# Requirements

## 1. Purpose

The User Payout Management System is a backend application responsible for managing affiliate user earnings throughout their complete financial lifecycle.

The system manages:

1. Affiliate sales
2. Advance payouts
3. Sale reconciliation
4. Final settlements
5. User withdrawals
6. External payment processing
7. Failed payout recovery

The primary goal is to ensure that all financial operations are **correct, auditable, idempotent, and safe under concurrent execution and external failures**.

---

# 2. Actors

The system has four primary actors.

## 2.1 Affiliate User

The Affiliate User is the individual who generates affiliate sales and earns commissions.

### Responsibilities

The Affiliate User can:

* Generate affiliate sales.
* Receive advance payouts.
* Receive final settlement amounts.
* View their financial balance.
* View their ledger history.
* Request withdrawal of available funds.

### Financial Interaction

The user does not directly modify financial records.

All financial changes are generated through validated business operations such as:

* Advance payout
* Sale reconciliation
* Withdrawal
* Withdrawal recovery

---

## 2.2 Administrator

The Administrator is responsible for reconciling affiliate sales based on the real-world outcome of the associated order.

### Responsibilities

The Administrator can:

* View pending sales.
* Review sales during reconciliation.
* Mark a sale as `APPROVED`.
* Mark a sale as `REJECTED`.

### Reconciliation Rules

A sale can be reconciled only once.

After reconciliation, the sale reaches a terminal state:

```text
APPROVED
```

or:

```text
REJECTED
```

A reconciled sale cannot return to `PENDING`.

---

## 2.3 Background Job / Scheduler

The Background Job is an automated system process responsible for identifying eligible pending sales and initiating advance payout processing.

### Responsibilities

The scheduler:

* Runs periodically.
* Finds eligible `PENDING` sales.
* Initiates advance payout processing.
* May process multiple sales in one execution.

### Important Requirement

The scheduler must be safe to run repeatedly.

If the same sale is picked up multiple times because of:

* Job retries
* Worker crashes
* Multiple workers
* Network failures
* Duplicate job execution

the system must not issue multiple successful advance payouts for the same sale.

---

## 2.4 Payment Provider

The Payment Provider is an external financial system responsible for transferring money to users.

The provider may return or asynchronously report statuses such as:

```text
PROCESSING
SUCCESS
FAILED
CANCELLED
REJECTED
```

### Responsibilities

The Payment Provider:

* Receives payout requests.
* Processes financial transfers.
* Returns payment results.
* Sends asynchronous payment status updates.

The application must not assume that an external payment operation succeeds simply because the request was accepted.

---

# 3. Sale Lifecycle

Every sale initially enters the system with the status:

```text
PENDING
```

The sale remains pending until an Administrator reconciles it.

The allowed lifecycle is:

```text
                +----------+
                |  PENDING |
                +----+-----+
                     |
          Administrator Reconciliation
                     |
              +------+------+
              |             |
              v             v
        +-----------+  +-----------+
        | APPROVED  |  | REJECTED  |
        +-----------+  +-----------+
```

## 3.1 PENDING

A pending sale represents a purchase for which the final commission outcome has not yet been confirmed.

A pending sale:

* Is eligible for advance payout processing.
* Has not yet been finally reconciled.
* May later become approved or rejected.

---

## 3.2 APPROVED

A sale becomes `APPROVED` when:

* The product has been successfully delivered.
* The applicable customer return period has ended.
* The commission is considered final.

For an approved sale, the system calculates the remaining settlement amount.

```text
Final Settlement
= Total Earnings - Successful Advance Paid
```

Example:

```text
Total Earnings = ₹40
Advance Paid   = ₹4

Final Settlement = ₹40 - ₹4
                 = ₹36
```

---

## 3.3 REJECTED

A sale becomes `REJECTED` when:

* The order is cancelled.
* The product is returned.
* The user is no longer entitled to the commission.

If an advance was previously paid, the system creates a negative adjustment.

```text
Final Adjustment
= -Successful Advance Paid
```

Example:

```text
Advance Paid = ₹4

Final Adjustment = -₹4
```

The original advance ledger entry is never modified or deleted.

Instead, a new compensating ledger entry is created.

---

# 4. Advance Payout Requirements

## 4.1 Eligibility

Every eligible `PENDING` sale can receive an advance payout.

The advance amount is:

```text
Advance Amount
= 10% × Total Earnings
```

Example:

```text
Total Earnings = ₹40

Advance = 10% × ₹40
        = ₹4
```

---

## 4.2 Advance Payout Idempotency

A sale may receive **at most one successful advance payout**.

The system must guarantee that repeated processing does not result in duplicate successful advances.

For example:

```text
Job Execution 1
    |
    v
Sale #123
    |
    v
Advance ₹4
    |
    v
SUCCESS
```

If the scheduler runs again:

```text
Job Execution 2
    |
    v
Sale #123
    |
    v
Already has successful advance
    |
    v
No additional payout
```

This guarantee must hold even if:

* Multiple workers process the same sale.
* A job is retried.
* The application crashes.
* The same request is submitted multiple times.

Idempotency must be enforced using a combination of:

* Application-level checks.
* Database constraints.
* Transactional state transitions.

---

## 4.3 Advance Payment Failure

If the external payment provider fails to process the advance payout:

```text
Payment Result
    |
    v
FAILED / CANCELLED / REJECTED
```

the system must not create a successful advance ledger credit.

The failed attempt may be retried according to the configured retry policy.

A failed attempt must not prevent a future successful advance for the same sale.

However, once one attempt succeeds, no additional successful advance may be created.

---

# 5. Final Reconciliation Requirements

When an Administrator reconciles a sale, the system must:

1. Verify that the sale exists.
2. Verify that the sale is still `PENDING`.
3. Determine the successful advance amount, if any.
4. Update the sale status.
5. Calculate the final financial adjustment.
6. Create the corresponding ledger entry.
7. Update the account balance projection.
8. Commit the entire operation atomically.

---

## 5.1 Approved Sale

For an approved sale:

```text
Settlement
= Total Earnings - Successful Advance Paid
```

Example:

```text
Total Earnings = ₹40
Advance Paid   = ₹4

Settlement = ₹36
```

The ledger records:

```text
ADVANCE
+₹4

SETTLEMENT
+₹36
```

Total financial earning:

```text
₹4 + ₹36 = ₹40
```

---

## 5.2 Rejected Sale

For a rejected sale:

```text
Adjustment
= -Successful Advance Paid
```

Example:

```text
Advance Paid = ₹4

Adjustment = -₹4
```

The ledger records:

```text
ADVANCE
+₹4

REJECTION_ADJUSTMENT
-₹4
```

Net financial result:

```text
₹4 - ₹4 = ₹0
```

The original advance transaction remains permanently recorded for audit purposes.

---

## 5.3 Reconciliation Idempotency

A sale can be reconciled only once.

The system must prevent:

```text
PENDING
   |
   v
APPROVED
   |
   v
APPROVED
```

or:

```text
PENDING
   |
   v
REJECTED
   |
   v
APPROVED
```

or duplicate settlement entries caused by repeated requests.

The reconciliation operation must be protected by:

* Sale state validation.
* Database transaction.
* Appropriate row locking or equivalent concurrency control.
* Idempotent financial ledger constraints.

---

# 6. Withdrawal Requirements

An Affiliate User can request a withdrawal of their available balance.

Before creating a withdrawal, the system must validate:

1. Withdrawal amount is greater than zero.
2. User has sufficient withdrawable balance.
3. User is eligible under the 24-hour withdrawal rule.

---

## 6.1 Balance Validation

A user cannot withdraw more than their available balance.

Example:

```text
Available Balance = ₹500
Requested Amount  = ₹600
```

The withdrawal must be rejected.

The system must not allow the account balance to become incorrectly negative because of an invalid withdrawal request.

---

## 6.2 Rolling 24-Hour Restriction

A user is limited to one withdrawal within a rolling 24-hour period.

This is a rolling time window, not a calendar-day restriction.

Example:

```text
Withdrawal:
10 July, 10:00 AM

Next eligible time:
11 July, 10:00 AM
```

A withdrawal request before that time must be rejected according to the withdrawal eligibility rules.

An active `PROCESSING` withdrawal also prevents another withdrawal request.

---

## 6.3 Concurrent Withdrawals

The system must prevent concurrent requests from spending the same funds.

Example:

```text
Initial Balance = ₹500

Request A → Withdraw ₹400
Request B → Withdraw ₹300
```

If both requests execute simultaneously, only one can successfully reserve the available funds.

The system must guarantee:

```text
₹400 + ₹300
```

cannot both be successfully withdrawn from a ₹500 balance.

Concurrency protection should be implemented using transactional database mechanisms such as row-level locking.

---

# 7. Failed Payout Recovery

A withdrawal may fail after the user has initiated it.

The external payment provider may report:

```text
FAILED
CANCELLED
REJECTED
```

When this occurs, the system must recover the withdrawn amount.

---

## 7.1 Recovery Process

The recovery process must:

1. Identify the affected withdrawal.
2. Verify that the withdrawal has not already been recovered.
3. Mark the withdrawal with the appropriate failure status.
4. Create a compensating recovery ledger entry.
5. Restore the recovered amount to the user's balance projection.
6. Commit the operation atomically.

Example:

```text
Original Withdrawal

WITHDRAWAL
-₹500
```

After failure:

```text
WITHDRAWAL
-₹500

WITHDRAWAL_RECOVERY
+₹500
```

Net financial effect:

```text
₹0
```

---

## 7.2 Exact-Once Recovery

Recovery must happen exactly once.

If the payment provider sends the same failure notification multiple times:

```text
Webhook 1 → FAILED
Webhook 2 → FAILED
Webhook 3 → FAILED
```

the system must create only one recovery entry.

Expected result:

```text
WITHDRAWAL
-₹500

WITHDRAWAL_RECOVERY
+₹500
```

Incorrect result:

```text
WITHDRAWAL
-₹500

WITHDRAWAL_RECOVERY
+₹500

WITHDRAWAL_RECOVERY
+₹500

WITHDRAWAL_RECOVERY
+₹500
```

Database-level idempotency must protect against duplicate recovery.

---

## 7.3 Retry After Recovery

After a failed withdrawal is recovered, the user must be able to initiate another withdrawal for the recovered amount.

The recovered funds become part of the user's available withdrawable balance.

The recovery must not permanently lock the user's funds.

---

# 8. Ledger Requirements

The ledger is the financial source of truth.

All financial movements must be represented as ledger entries.

Possible transaction types include:

```text
ADVANCE
SETTLEMENT
REJECTION_ADJUSTMENT
WITHDRAWAL
WITHDRAWAL_RECOVERY
```

---

## 8.1 Append-Only Ledger

Ledger entries are immutable.

The system must not:

* Update existing financial entries.
* Delete financial entries.
* Rewrite financial history.

Corrections are represented using new compensating entries.

Example:

```text
ADVANCE
+₹4
```

Later, the sale is rejected:

```text
REJECTION_ADJUSTMENT
-₹4
```

The original `ADVANCE` entry remains unchanged.

---

## 8.2 Balance Projection

The account maintains a `withdrawable_balance` projection for efficient balance reads.

The balance projection is not the primary source of financial history.

The conceptual model is:

```text
Ledger Entries
      |
      v
Financial History
      |
      v
Balance Projection
```

Ledger updates and balance projection updates must occur within the same database transaction.

---

# 9. Transactional Requirements

Financial operations must be atomic.

A financial database transaction must either:

```text
COMMIT
```

all required changes, or:

```text
ROLLBACK
```

all changes.

For example, reconciliation should not produce:

```text
Sale = APPROVED
Ledger = missing
Balance = not updated
```

Instead, the following changes must be committed together:

```text
Sale Status Update
        +
Ledger Entry
        +
Balance Projection Update
```

If any part fails, the complete transaction must roll back.

---

# 10. Idempotency Requirements

The following operations must be idempotent:

* Advance payout processing.
* Sale reconciliation.
* Final settlement creation.
* Rejection adjustment creation.
* Withdrawal recovery.
* Payment webhook processing.

Repeated execution must not produce duplicate financial effects.

The system should use:

* Unique database constraints.
* Idempotency keys where appropriate.
* State transition validation.
* Database transactions.
* Row-level locking where required.

---

# 11. Concurrency Requirements

The system must remain financially correct when multiple operations execute simultaneously.

Critical concurrent scenarios include:

### Duplicate Advance Processing

```text
Worker A → Sale #123
Worker B → Sale #123
```

Only one successful advance may be created.

### Concurrent Withdrawal

```text
Request A → ₹400
Request B → ₹300
Balance → ₹500
```

Only valid withdrawals within available funds may succeed.

### Concurrent Reconciliation

```text
Admin A → APPROVED
Admin B → REJECTED
```

Only one reconciliation may succeed.

### Duplicate Recovery

```text
Webhook A → FAILED
Webhook B → FAILED
```

Only one recovery may be created.

---

# 12. Non-Functional Requirements

## 12.1 Consistency

Financial records must remain internally consistent across:

* Sales
* Payouts
* Ledger
* Account balance
* Withdrawals

---

## 12.2 Auditability

The system must allow financial history to be reconstructed from immutable ledger entries.

Each financial entry should contain sufficient information to identify:

* The account affected.
* The transaction type.
* The related business entity.
* The amount.
* The creation timestamp.

---

## 12.3 Reliability

The system must safely handle:

* Application crashes.
* Database transaction failures.
* External provider failures.
* Duplicate requests.
* Duplicate webhooks.
* Background job retries.

---

## 12.4 Testability

Business logic must be separated from:

* HTTP transport.
* Database access.
* External payment provider implementation.

This allows business rules to be tested independently.

---

# 13. Requirements Summary

The system must guarantee the following core properties:

```text
                    Financial Correctness
                            |
        +-------------------+-------------------+
        |                   |                   |
        v                   v                   v
   Idempotency         Concurrency          Auditability
        |                   |                   |
        +-------------------+-------------------+
                            |
                            v
                   Reliable Payout System
```

The most critical invariants are:

1. A sale can have at most one successful advance payout.
2. A sale can be reconciled only once.
3. A reconciliation can create only one final financial adjustment.
4. A withdrawal cannot spend more than available funds.
5. Concurrent withdrawals cannot overspend the account.
6. A user cannot make withdrawals more frequently than allowed by the rolling 24-hour rule.
7. A failed withdrawal can be recovered exactly once.
8. Duplicate payment webhooks cannot create duplicate financial effects.
9. Ledger entries are immutable and append-only.
10. Ledger and balance projection updates are transactionally consistent.
11. Financial operations remain safe under retries, crashes, and concurrent execution.
