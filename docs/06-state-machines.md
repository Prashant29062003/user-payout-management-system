# State Machines

## 1. Purpose

This document defines the state machines used by the User Payout Management System.

The system contains multiple independent but related state machines:

1. Sale
2. Advance Payout
3. Withdrawal
4. Payment Attempt
5. Payment Provider Event

Each state machine has:

* A defined set of states
* Valid state transitions
* Invalid state transitions
* A responsible actor
* Business rules
* Concurrency requirements
* Idempotency requirements

The system must never allow an entity to move between states without satisfying the rules defined in this document.

---

# 2. State Machine Principles

The following principles apply to all state machines.

### 2.1 States represent business truth

A state represents the current business condition of an entity.

For example:

```text
PENDING
```

means that the sale has not yet been reconciled.

It does not mean:

```text
The administrator has not looked at it yet.
```

The state must represent the actual business meaning.

---

### 2.2 State transitions are controlled

Entities cannot arbitrarily change state.

For example:

```text
APPROVED → REJECTED
```

is invalid.

A state transition must be performed through a domain/application service that validates:

* Current state
* Requested state
* Actor permissions
* Business rules
* Concurrency requirements

---

### 2.3 State changes and financial effects are atomic

Whenever a state transition creates a financial effect, the following operations must occur within the same database transaction:

```text
State Change
    +
Ledger Entry
    +
Account Projection Update
```

For example:

```text
Sale: PENDING → APPROVED
        +
Ledger: +₹36
        +
Account Balance: +₹36
```

These operations must either all succeed or all roll back.

---

### 2.4 History is never rewritten

The system must never delete or modify historical financial ledger entries to correct an error.

Corrections are represented as new ledger entries.

Example:

```text
Original withdrawal
    -₹500

Provider failure

Recovery
    +₹500
```

The original `-₹500` entry remains permanently in the ledger.

---

# 3. Sale State Machine

The Sale represents an affiliate transaction whose commission is initially pending reconciliation.

### States

```text
PENDING
APPROVED
REJECTED
```

### State Diagram

```text
                 +------------+
                 |            |
                 |  APPROVED  |
                 |            |
                 +------------+
                       ^
                       |
                    APPROVE
                       |
                       |
+---------+            |
|         |------------+
| PENDING |
|         |------------+
+---------+            |
                       |
                    REJECT
                       |
                       v
                 +------------+
                 |            |
                 |  REJECTED  |
                 |            |
                 +------------+
```

The only valid transitions are:

```text
PENDING → APPROVED
PENDING → REJECTED
```

---

# 4. Sale: PENDING

`PENDING` is the initial state of every sale.

Meaning:

* The sale exists.
* The commission has not been finally reconciled.
* The sale may be eligible for an advance payout.
* The sale has not yet been approved or rejected.

A sale must start in:

```text
PENDING
```

---

# 5. Sale: APPROVED

A sale moves to `APPROVED` when:

* The product was successfully delivered.
* The customer return period has ended.
* The administrator confirms the sale is valid.

The transition is:

```text
PENDING → APPROVED
```

Actor:

```text
ADMIN
```

Financial effect:

```text
Final Payout
=
Total Earnings
-
Advance Paid
```

Example:

```text
Total Earnings = ₹40
Advance Paid   = ₹4

Final Payout   = ₹36
```

A positive ledger entry of:

```text
+₹36
```

is created.

---

# 6. Sale: REJECTED

A sale moves to `REJECTED` when:

* The product was returned.
* The order was cancelled.
* The user is no longer entitled to the commission.

The transition is:

```text
PENDING → REJECTED
```

Actor:

```text
ADMIN
```

If an advance was already paid:

```text
Advance Paid = ₹4
```

the user owes:

```text
₹4
```

The system creates a negative financial adjustment:

```text
-₹4
```

This represents recovery of the previously issued advance.

The system must never delete the original advance ledger entry.

---

# 7. Sale State Invariants

The following rules must always hold.

### Rule 1

A sale can only be reconciled once.

```text
PENDING → APPROVED
```

or:

```text
PENDING → REJECTED
```

After reconciliation, the sale cannot return to `PENDING`.

---

### Rule 2

The same sale cannot be approved and rejected.

Invalid:

```text
PENDING
   |
   v
APPROVED
   |
   v
REJECTED
```

---

### Rule 3

Two concurrent administrators cannot reconcile the same sale.

The reconciliation service must lock the sale row:

```sql
SELECT ...
FROM sales
WHERE id = $1
FOR UPDATE;
```

Then verify:

```text
status == PENDING
```

Only then can reconciliation continue.

---

# 8. Advance Payout State Machine

An advance payout represents the financial operation that gives the affiliate user 10% of the expected earnings before final reconciliation.

Recommended states:

```text
PENDING
PROCESSING
SUCCESS
FAILED
```

The system may simplify the implementation by tracking only successful advances, but the domain model should distinguish the payout operation from its payment execution.

---

# 9. Advance Payout State Diagram

```text
+---------+
| PENDING |
+---------+
     |
     | Start Processing
     v
+------------+
| PROCESSING |
+------------+
     |
     +-------------------+
     |                   |
   SUCCESS             FAILED
     |                   |
     v                   v
+---------+          +--------+
| SUCCESS |          | FAILED |
+---------+          +--------+
```

Valid transitions:

```text
PENDING → PROCESSING
PROCESSING → SUCCESS
PROCESSING → FAILED
```

A failed operation may be retried according to the payment retry policy.

However, retrying the payment attempt must not create another advance payout operation.

---

# 10. Advance Payout Eligibility

A sale is eligible for an advance when:

```text
Sale Status = PENDING
```

and:

```text
No Successful Advance Exists
```

The advance amount is:

```text
Advance = Total Earnings × 10%
```

Example:

```text
Total Earnings = ₹40

Advance = ₹40 × 10%
        = ₹4
```

---

# 11. Advance Idempotency

The system must guarantee:

```text
One Sale
    |
    +---- Maximum One Successful Advance
```

The following must never happen:

```text
Sale A
    |
    +---- Advance ₹4
    |
    +---- Advance ₹4
    |
    +---- Advance ₹4
```

If the scheduler runs multiple times:

```text
Scheduler Run 1 → Create Advance
Scheduler Run 2 → Detect Existing Advance → Skip
Scheduler Run 3 → Detect Existing Advance → Skip
```

The database must enforce this invariant.

Conceptually:

```text
UNIQUE(sale_id, ADVANCE)
```

or an equivalent unique constraint that guarantees one successful advance operation per sale.

---

# 12. Advance Payout and Payment Attempt

The advance payout represents the business operation.

The payment attempt represents the attempt to execute that operation externally.

These must not be treated as the same entity.

Example:

```text
Advance Payout
      |
      +---- Payment Attempt 1 → FAILED
      |
      +---- Payment Attempt 2 → SUCCESS
```

There is still only one advance payout.

There are two execution attempts.

This distinction prevents retries from creating duplicate financial operations.

---

# 13. Withdrawal State Machine

A withdrawal represents a user's request to withdraw available funds.

Recommended states:

```text
PROCESSING
SUCCESS
FAILED
CANCELLED
REJECTED
```

---

# 14. Withdrawal State Diagram

```text
                 +---------+
                 | SUCCESS |
                 +---------+
                     ^
                     |
                  Success
                     |
                     |
+------------+       |
|            |-------+
| PROCESSING |
|            |-------+
+------------+       |
       |             |
       |             +----------+
       |                        |
     Failed                 Cancelled
       |                        |
       v                        v
+---------+                +-----------+
| FAILED  |                | CANCELLED |
+---------+                +-----------+
       |
       |
    Recovery
       |
       v
Available Balance Restored
```

Provider rejection is represented as:

```text
PROCESSING → REJECTED
```

depending on the normalized provider result.

---

# 15. Withdrawal: PROCESSING

A withdrawal enters `PROCESSING` after:

1. User submits withdrawal request.
2. Request passes validation.
3. Account is locked.
4. Withdrawable balance is verified.
5. Withdrawal is created.
6. Withdrawal ledger debit is created.
7. Account projection is decreased.
8. Database transaction commits.

Example:

```text
Withdrawable Balance = ₹1000

Withdrawal = ₹500

Ledger:
-₹500

New Balance:
₹500
```

Only after this transaction commits should the system attempt external payment execution.

---

# 16. Withdrawal: SUCCESS

A withdrawal moves to `SUCCESS` when the payment provider confirms successful transfer.

Transition:

```text
PROCESSING → SUCCESS
```

Financial effect:

```text
No additional ledger entry
```

The withdrawal debit was already recorded when the withdrawal was created.

Therefore:

```text
Withdrawal Created
    |
    +---- Ledger -₹500
    |
    +---- Balance -₹500
    |
    v
Payment Provider Success
    |
    +---- Withdrawal → SUCCESS
```

The provider success event must never create a second `-₹500` ledger entry.

---

# 17. Withdrawal: FAILED

A withdrawal moves to `FAILED` when the payment provider confirms that the transfer failed.

Transition:

```text
PROCESSING → FAILED
```

The system must perform recovery.

Example:

```text
Original Withdrawal:
-₹500

Recovery:
+₹500
```

The final net financial effect is:

```text
₹0
```

However, both ledger entries remain permanently.

---

# 18. Withdrawal: CANCELLED

A withdrawal moves to `CANCELLED` when the payment provider reports cancellation.

Transition:

```text
PROCESSING → CANCELLED
```

The system performs the same recovery process:

```text
Original Debit
    -₹500

Recovery
    +₹500
```

---

# 19. Withdrawal: REJECTED

A withdrawal moves to `REJECTED` when the payment provider rejects the transfer.

Transition:

```text
PROCESSING → REJECTED
```

The system performs recovery:

```text
Original Debit
    -₹500

Recovery
    +₹500
```

---

# 20. Withdrawal Recovery State

Recovery must be treated as an independent financial operation.

The recovery operation should have its own idempotency guarantee.

Conceptually:

```text
Withdrawal W1
    |
    +---- Recovery R1
```

There must never be:

```text
Withdrawal W1
    |
    +---- Recovery R1
    |
    +---- Recovery R2
```

for the same failed withdrawal.

The database must enforce:

```text
One Withdrawal
    |
    +---- Maximum One Recovery
```

---

# 21. Withdrawal Recovery Rules

Recovery is allowed only when:

```text
Withdrawal Status ∈
{
    FAILED,
    CANCELLED,
    REJECTED
}
```

Recovery must not occur when:

```text
PROCESSING
SUCCESS
```

The recovery operation must:

1. Lock the withdrawal.
2. Verify the current state.
3. Check whether recovery has already occurred.
4. Create the recovery ledger entry.
5. Restore the account projection.
6. Mark recovery as completed.
7. Commit the transaction.

---

# 22. Payment Attempt State Machine

A Payment Attempt represents an individual attempt to execute a payout through the external payment provider.

States:

```text
PENDING
PROCESSING
SUCCESS
FAILED
CANCELLED
REJECTED
```

---

# 23. Payment Attempt Diagram

```text
+---------+
| PENDING |
+---------+
     |
     v
+------------+
| PROCESSING |
+------------+
     |
     +--------+---------+---------+
     |        |         |         |
     v        v         v         v
 SUCCESS    FAILED   CANCELLED  REJECTED
```

Valid transitions:

```text
PENDING → PROCESSING

PROCESSING → SUCCESS
PROCESSING → FAILED
PROCESSING → CANCELLED
PROCESSING → REJECTED
```

---

# 24. Payment Attempt Retry

A payment attempt failure does not necessarily mean the business operation itself failed permanently.

Example:

```text
Withdrawal W1
    |
    +---- Payment Attempt 1 → FAILED
    |
    +---- Payment Attempt 2 → SUCCESS
```

The withdrawal may remain:

```text
PROCESSING
```

until a terminal outcome is reached.

However, the system must distinguish:

```text
Retryable Failure
```

from:

```text
Permanent Failure
```

This decision is determined by the payment provider integration.

---

# 25. Payment Attempt Idempotency

Every request sent to the payment provider must use an idempotency mechanism whenever supported.

Example:

```text
Internal Operation ID:
withdrawal_123

Provider Idempotency Key:
withdrawal_123_attempt_1
```

If the application times out:

```text
Application
    |
    | Request
    v
Payment Provider
    |
    X Network Timeout
```

the application must not blindly create another financial operation.

Instead, it should retry using the same provider idempotency key or query the provider for the original operation status.

---

# 26. Payment Provider Event State Machine

External payment providers may send events such as:

```text
SUCCESS
FAILED
CANCELLED
REJECTED
```

The application normalizes these events.

Example:

```text
Provider Event
      |
      v
Webhook Verification
      |
      v
Event Deduplication
      |
      v
Internal Status
```

Provider-specific statuses must not leak into the core domain model.

For example:

```text
PROVIDER_DECLINED
PROVIDER_REJECTED
```

may both map to:

```text
REJECTED
```

---

# 27. Webhook Event Idempotency

Every provider event must have a unique event identifier.

Example:

```text
event_id = evt_123
```

The system stores the event before processing its financial effect.

If the same event arrives again:

```text
evt_123
evt_123
evt_123
```

only the first processing attempt may create a financial effect.

The others must be treated as duplicates.

---

# 28. Cross-Entity State Relationships

The system contains relationships between state machines.

Example:

```text
Sale
PENDING
   |
   | Advance Eligible
   v
Advance Payout
   |
   v
Payment Attempt
```

Later:

```text
Sale
PENDING
   |
   | Admin Reconciliation
   v
APPROVED / REJECTED
   |
   v
Final Adjustment
```

Withdrawal:

```text
Withdrawal
PROCESSING
   |
   v
Payment Attempt
   |
   +---- SUCCESS
   |
   +---- FAILED
   |
   +---- CANCELLED
   |
   +---- REJECTED
```

The important distinction is:

```text
Business Operation
        ≠
Payment Execution Attempt
```

---

# 29. State Transition Authority

| Entity          | Transition                  | Actor               |
| --------------- | --------------------------- | ------------------- |
| Sale            | PENDING → APPROVED          | ADMIN               |
| Sale            | PENDING → REJECTED          | ADMIN               |
| Advance         | PENDING → PROCESSING        | Scheduler/System    |
| Advance         | PROCESSING → SUCCESS        | Payment Integration |
| Advance         | PROCESSING → FAILED         | Payment Integration |
| Withdrawal      | Creation → PROCESSING       | Affiliate User      |
| Withdrawal      | PROCESSING → SUCCESS        | Payment Provider    |
| Withdrawal      | PROCESSING → FAILED         | Payment Provider    |
| Withdrawal      | PROCESSING → CANCELLED      | Payment Provider    |
| Withdrawal      | PROCESSING → REJECTED       | Payment Provider    |
| Payment Attempt | PENDING → PROCESSING        | Payment Integration |
| Payment Attempt | PROCESSING → terminal state | Payment Provider    |

---

# 30. Invalid Transition Matrix

The following transitions are explicitly forbidden.

| Current State | Attempted State | Result                                      |
| ------------- | --------------- | ------------------------------------------- |
| APPROVED      | REJECTED        | ❌ Reject                                    |
| APPROVED      | PENDING         | ❌ Reject                                    |
| REJECTED      | APPROVED        | ❌ Reject                                    |
| REJECTED      | PENDING         | ❌ Reject                                    |
| SUCCESS       | FAILED          | ❌ Reject                                    |
| SUCCESS       | CANCELLED       | ❌ Reject                                    |
| SUCCESS       | REJECTED        | ❌ Reject                                    |
| FAILED        | SUCCESS         | ❌ Reject unless explicitly modeled as retry |
| CANCELLED     | SUCCESS         | ❌ Reject                                    |
| REJECTED      | SUCCESS         | ❌ Reject                                    |

If a business requirement later requires a transition not listed here, the state machine must be explicitly updated rather than bypassed.

---

# 31. State Transition Concurrency

Every state transition that can be triggered concurrently must be protected.

For database-backed state transitions:

```text
BEGIN TRANSACTION

SELECT entity
FOR UPDATE

VERIFY current state

APPLY transition

CREATE financial effect

UPDATE projection

COMMIT
```

Example:

```text
Admin A                  Admin B
   |                        |
   | APPROVE                | REJECT
   v                        v
Lock Sale                  Wait
   |
   v
PENDING → APPROVED
   |
 COMMIT
                            |
                            v
                       Read Sale
                            |
                            v
                    Status = APPROVED
                            |
                            v
                       Reject Request
```

Only one transition succeeds.

---

# 32. State Transition Idempotency

Idempotency depends on the entity.

### Sale Reconciliation

Use:

```text
Row Lock + Current State Check
```

### Advance Payout

Use:

```text
Unique Sale + Advance Constraint
```

### Withdrawal Creation

Use:

```text
Client Idempotency Key
```

### Withdrawal Recovery

Use:

```text
Unique Withdrawal + Recovery Constraint
```

### Payment Webhook

Use:

```text
Unique Provider Event ID
```

### Payment Execution

Use:

```text
Provider Idempotency Key
```

---

# 33. Financial Invariants

The following invariants must always hold.

### Invariant 1

A sale can have at most one successful advance payout.

```text
COUNT(successful advances for sale) <= 1
```

---

### Invariant 2

A reconciled sale cannot be reconciled again.

```text
Sale Status != PENDING
→ No Further Reconciliation
```

---

### Invariant 3

A withdrawal cannot be recovered more than once.

```text
COUNT(recoveries for withdrawal) <= 1
```

---

### Invariant 4

A successful withdrawal cannot be recovered.

```text
SUCCESS → No Recovery
```

---

### Invariant 5

A failed withdrawal must eventually have exactly one recovery.

```text
FAILED/CANCELLED/REJECTED
→ Exactly One Recovery
```

The recovery may be processed asynchronously, but the final financial invariant must be:

```text
One Failed Withdrawal
    =
One Recovery
```

---

### Invariant 6

The ledger is append-only.

No financial ledger entry may be:

```text
UPDATE
DELETE
```

after posting.

Corrections must create new entries.

---

### Invariant 7

Account projection must equal the ledger-derived balance.

Conceptually:

```text
Account Withdrawable Balance
=
Sum of Applicable Ledger Entries
```

The projection may be used for fast reads, but the ledger remains the source of truth.

---

# 34. Complete Sale Lifecycle

```text
Sale Created
     |
     v
  PENDING
     |
     +---------------------+
     |                     |
     | Scheduler           | Admin
     |                     |
     v                     v
Advance Payout         Reconciliation
     |                     |
     v                     |
Advance Paid               |
     |                     |
     +----------+----------+
                |
                v
          Admin Decision
                |
          +-----+-----+
          |           |
          v           v
       APPROVED    REJECTED
          |           |
          v           v
       +₹36         -₹4
          |           |
          +-----+-----+
                |
                v
          Final Financial
             State
```

---

# 35. Complete Withdrawal Lifecycle

```text
User Requests Withdrawal
          |
          v
Validate Balance
          |
          v
Create Withdrawal
          |
          v
PROCESSING
          |
          v
Reserve/Debit Funds
          |
          v
Call Payment Provider
          |
     +----+----+----+----+
     |         |         |
     v         v         v
 SUCCESS    FAILURE   REJECTED
     |         |         |
     |         |         |
     v         v         v
 SUCCESS    FAILED    REJECTED
               \       /
                \     /
                 v   v
                Recovery
                   |
                   v
            Funds Restored
```

---

# 36. Exactly-Once Recovery

The recovery flow is designed to tolerate duplicate provider notifications.

Example:

```text
Provider
    |
    +---- FAILED webhook
    |
    +---- FAILED webhook
    |
    +---- FAILED webhook
```

Application:

```text
Webhook 1
    |
    v
Create Recovery
    |
    v
+₹500


Webhook 2
    |
    v
Duplicate / Already Recovered
    |
    v
No Financial Effect


Webhook 3
    |
    v
Duplicate / Already Recovered
    |
    v
No Financial Effect
```

The database constraint is the final protection.

---

# 37. Exactly-Once vs At-Least-Once Delivery

The system should assume that:

```text
External Events = At-Least-Once Delivery
```

Therefore:

* Webhooks may be duplicated.
* Network requests may be retried.
* Scheduler jobs may execute multiple times.
* Application processes may restart.
* Payment provider calls may time out.

The system achieves effectively exactly-once financial effects through:

```text
Database Constraints
+
Transactions
+
Locks
+
Idempotency Keys
+
Unique Event IDs
+
Append-Only Ledger
```

The goal is not to guarantee that an event is physically delivered only once.

The goal is to guarantee that the **financial effect occurs only once**.

---

# 38. State Machine Design Summary

The system follows these fundamental rules:

```text
1. Every entity has explicit states.
2. Only documented transitions are allowed.
3. Invalid transitions are rejected.
4. State changes are performed by authorized actors.
5. Financial effects are atomic with state changes.
6. Concurrent transitions use database locking.
7. Retryable operations have idempotency mechanisms.
8. External events are assumed to be delivered at least once.
9. Duplicate events must produce no duplicate financial effects.
10. Ledger entries are append-only.
11. Financial corrections are represented by new ledger entries.
12. Business operations are separated from payment execution attempts.
13. Payment provider failures trigger recovery, not deletion.
14. Database constraints provide the final enforcement layer.
```

The resulting architecture is:

```text
                  STATE MACHINES
                        |
        +---------------+---------------+
        |               |               |
        v               v               v
       SALE          ADVANCE        WITHDRAWAL
        |               |               |
        |               |               |
        +---------------+---------------+
                        |
                        v
                 PAYMENT ATTEMPT
                        |
                        v
                PAYMENT PROVIDER
                        |
                        v
                     WEBHOOK
                        |
                        v
                  STATE UPDATE
                        |
                        v
                   RECOVERY
                        |
                        v
                    LEDGER
```

The state machines provide the formal rules that connect the requirements, domain model, database constraints, and API contract into one consistent system.
