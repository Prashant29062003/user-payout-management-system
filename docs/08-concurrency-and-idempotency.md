# Concurrency and Idempotency

## 1. Purpose

This document defines the concurrency-control and idempotency strategy for the User Payout Management System.

The system handles financial operations where duplicate processing or race conditions can cause direct monetary loss.

The primary goals are:

* Prevent double payment.
* Prevent double withdrawal.
* Prevent duplicate ledger entries.
* Prevent duplicate advance payouts.
* Prevent duplicate recovery credits.
* Prevent conflicting sale reconciliation.
* Prevent double-spending of account balances.
* Safely handle duplicate scheduler executions.
* Safely handle duplicate external webhooks.
* Safely recover from network timeouts.
* Maintain financial consistency under concurrent requests.

The fundamental principle is:

> **The system must assume that every operation can be retried, duplicated, delayed, or delivered more than once.**

Therefore, correctness must be enforced by the database and transaction boundaries rather than by application assumptions.

---

# 2. Core Concurrency Principles

The system follows these principles:

```text
1. Database transactions protect atomic state changes.
2. Row-level locks protect concurrent modifications.
3. Unique constraints enforce exactly-once financial effects.
4. Idempotency keys protect retryable external operations.
5. External systems are assumed to provide at-least-once delivery.
6. External API calls are never treated as transactional with the database.
7. Financial history is append-only.
8. State transitions are validated before execution.
9. Account balances are modified only inside controlled transactions.
10. A successful financial operation must be safe to retry.
```

---

# 3. Exactly-Once vs At-Least-Once

The system must distinguish between:

### Exactly-Once Business Effect

The desired financial result should happen only once.

Examples:

```text
Advance for Sale #123
```

must create:

```text
+₹4
```

only once.

A failed withdrawal recovery:

```text
+₹500
```

must happen only once.

### At-Least-Once Delivery

External systems may deliver the same event multiple times.

For example:

```text
Webhook #1 → FAILED
Webhook #2 → FAILED
Webhook #3 → FAILED
```

The application must accept that duplicate delivery is normal.

Therefore:

```text
At-Least-Once Delivery
          ↓
Idempotent Processing
          ↓
Exactly-Once Financial Effect
```

The system does not require the external provider to deliver events exactly once.

The system ensures that duplicate events cannot create duplicate financial effects.

---

# 4. Concurrency Control Layers

Concurrency protection exists at multiple layers.

```text
Application Layer
       ↓
Transaction Layer
       ↓
Row-Level Locking
       ↓
Database Constraints
       ↓
Unique Constraints
       ↓
External Idempotency
```

No single mechanism is sufficient by itself.

For example:

* Application checks prevent normal duplicates.
* Transactions provide atomicity.
* Row locks prevent races.
* Unique constraints protect against unexpected duplicate execution.
* Idempotency keys protect external provider calls.

The database must remain the final enforcement boundary for financial invariants.

---

# 5. Transaction Boundary Principle

A financial operation must be performed atomically.

The internal financial transaction should contain:

```text
BEGIN TRANSACTION

Validate business state

Lock required records

Create business operation

Create ledger entry

Update account projection

Update related state

COMMIT
```

If any operation fails:

```text
ROLLBACK
```

No partial financial state may remain.

For example, the following must never happen:

```text
Ledger Entry Created
        ↓
Account Update Failed
        ↓
COMMIT
```

This would create a mismatch between the ledger and account projection.

Instead:

```text
Ledger Entry Created
        ↓
Account Update Failed
        ↓
ROLLBACK
```

Both operations are reverted.

---

# 6. Ledger and Projection Atomicity

Every ledger entry that affects an account must update the account projection in the same database transaction.

Example:

```text
BEGIN

INSERT ledger_entry
    amount = +₹36

UPDATE account
    withdrawable_balance = ...

COMMIT
```

The system must never commit:

```text
Ledger
```

without:

```text
Account Projection
```

or vice versa.

The invariant is:

> **A committed financial ledger entry and its corresponding account projection change must always exist together.**

---

# 7. Advance Payout Concurrency

The background scheduler may run multiple times.

For example:

```text
Scheduler A
Scheduler B
Scheduler C
```

may all identify the same sale:

```text
Sale #123
Status = PENDING
```

All three workers may attempt to create the advance.

The system must ensure:

```text
Sale #123
    ↓
Exactly One Advance
```

---

# 8. Advance Processing Strategy

The advance operation should use a database transaction.

Conceptually:

```text
BEGIN TRANSACTION

1. Lock Sale

2. Verify:
   Sale Status = PENDING

3. Check:
   Advance does not already exist

4. Calculate:
   Advance = Total Earnings × 10%

5. Create Advance Payout

6. Create Ledger Entry

7. Update Account Projection

8. COMMIT
```

The database must also enforce uniqueness.

For example:

```text
UNIQUE(sale_id, transaction_type)
```

for:

```text
transaction_type = ADVANCE
```

This provides defense in depth.

---

# 9. Duplicate Advance Race

Suppose two scheduler workers execute simultaneously.

```text
Worker A                    Worker B
   |                           |
   | Find Sale                 |
   |                           |
   | Begin Transaction         |
   |                           |
   | Lock Sale                 |
   |                           |
   | Create Advance            |
   |                           |
   | Commit                    |
   |                           |
   |                           | Attempts processing
   |                           |
   |                           | Finds existing advance
   |                           |
   |                           | Skip
```

Only one advance is created.

If both workers somehow pass the application-level check, the database unique constraint still prevents a duplicate.

---

# 10. Advance Idempotency Invariant

For every sale:

```text
COUNT(ADVANCE ledger entries) <= 1
```

The system must never allow:

```text
Sale #123
+₹4 ADVANCE
+₹4 ADVANCE
```

The correct result is:

```text
Sale #123
+₹4 ADVANCE
```

---

# 11. Concurrent Sale Reconciliation

A sale can be reconciled by an administrator.

Two administrators may act simultaneously.

Example:

```text
Admin A → APPROVE
Admin B → REJECT
```

The system must guarantee that only one transition succeeds.

---

# 12. Reconciliation Locking

The reconciliation transaction must lock the sale row.

Conceptually:

```sql
SELECT *
FROM sales
WHERE id = $1
FOR UPDATE;
```

The first transaction obtains the lock.

Example:

```text
Transaction A
    |
    v
LOCK Sale
    |
    v
PENDING
    |
    v
APPROVE
    |
    v
COMMIT
```

The second transaction waits.

After the first transaction commits:

```text
Transaction B
    |
    v
Acquire Lock
    |
    v
Read Sale
    |
    v
Status = APPROVED
    |
    v
Reject Invalid Transition
```

This prevents:

```text
+₹36 FINAL_SETTLEMENT
```

and:

```text
-₹4 REJECTION_ADJUSTMENT
```

from both being created for the same sale.

---

# 13. Reconciliation Invariant

A sale may transition only once from:

```text
PENDING
```

to one of:

```text
APPROVED
REJECTED
```

Therefore:

```text
PENDING → APPROVED
```

or:

```text
PENDING → REJECTED
```

but never:

```text
PENDING → APPROVED → REJECTED
```

and never:

```text
PENDING → REJECTED → APPROVED
```

The database and application layer must enforce this.

---

# 14. Reconciliation Financial Idempotency

The following operations must occur exactly once:

### Approved Sale

```text
Sale Status:
PENDING → APPROVED

Ledger:
+Final Settlement
```

### Rejected Sale

```text
Sale Status:
PENDING → REJECTED

Ledger:
-Rejection Adjustment
```

A second reconciliation attempt must not create another financial entry.

Example:

```text
First Request:
APPROVE
    ↓
+₹36

Second Request:
APPROVE
    ↓
No financial effect
```

The second request may return:

```text
409 Conflict
```

or an idempotent success response, depending on the API contract.

The important requirement is:

```text
No Duplicate Financial Effect
```

---

# 15. Concurrent Withdrawal Requests

Withdrawals represent the highest-risk concurrency scenario.

Suppose:

```text
Balance = ₹500
```

Two requests arrive simultaneously:

```text
Request A = ₹500
Request B = ₹500
```

Without locking:

```text
A reads ₹500
B reads ₹500

A approves
B approves

A spends ₹500
B spends ₹500

Total = ₹1000
Available = ₹500
```

This is a catastrophic double-spending bug.

---

# 16. Withdrawal Locking Strategy

The withdrawal transaction must lock the user's account.

Conceptually:

```sql
SELECT *
FROM accounts
WHERE user_id = $1
FOR UPDATE;
```

Then:

```text
BEGIN

Lock Account

Read Withdrawable Balance

Validate Amount

Validate 24-Hour Rule

Create Withdrawal

Create -Withdrawal Ledger Entry

Update Account Projection

COMMIT
```

The external provider is called only after the transaction commits.

---

# 17. Concurrent Withdrawal Example

Initial:

```text
Balance = ₹500
```

Two requests:

```text
A = ₹500
B = ₹500
```

Execution:

```text
Request A
    |
    v
LOCK Account
    |
    v
Balance = ₹500
    |
    v
Debit ₹500
    |
    v
Balance = ₹0
    |
    v
COMMIT
```

Request B:

```text
Request B
    |
    v
Wait for Lock
    |
    v
Acquire Lock
    |
    v
Balance = ₹0
    |
    v
Reject
```

Only one withdrawal succeeds.

---

# 18. Withdrawal Reservation

The withdrawal amount must be reserved before calling the external provider.

Example:

```text
Initial Balance
₹1000
```

User requests:

```text
₹500
```

Internal transaction:

```text
-₹500 WITHDRAWAL
```

Projection:

```text
Withdrawable Balance = ₹500
```

Withdrawal:

```text
PROCESSING
```

Then:

```text
COMMIT
```

Only now:

```text
Call Payment Provider
```

The funds are no longer available for another withdrawal.

---

# 19. Why Provider Calls Must Occur After Commit

The following approach is unsafe:

```text
Call Provider
    ↓
Provider succeeds
    ↓
Update Database
```

If the application crashes after provider success but before the database commit:

```text
Provider:
SUCCESS

Database:
No Withdrawal
```

A retry may send the money again.

The safer approach is:

```text
Database
    ↓
Reserve Funds
    ↓
COMMIT
    ↓
Call Provider
```

Now a retry cannot create another internal withdrawal.

---

# 20. Network Timeout During Provider Call

Consider:

```text
Database:
Withdrawal = PROCESSING
Balance = Debited

Provider Request:
Sent

Network:
Timeout
```

The system does not know whether the provider:

```text
Received the request
```

or:

```text
Never received the request
```

The system must not immediately create another withdrawal.

Instead:

```text
Withdrawal = PROCESSING
```

The system should:

```text
1. Retry using the same provider idempotency key
```

or:

```text
2. Query provider status
```

or:

```text
3. Wait for provider webhook
```

The original withdrawal operation remains the same.

---

# 21. Provider Idempotency Key

Each external withdrawal operation should have a stable idempotency key.

Example:

```text
withdrawal_id = wd_123
```

Provider request:

```text
Idempotency-Key: wd_123
```

Retry:

```text
Idempotency-Key: wd_123
```

The same key must be reused.

The system must never generate:

```text
wd_123
wd_456
```

for retries of the same financial withdrawal.

The rule is:

> **One internal withdrawal operation must map to one stable external idempotency key.**

---

# 22. Withdrawal State Machine and Retries

A withdrawal may follow:

```text
CREATED
   ↓
PROCESSING
   ↓
SUCCESS
```

or:

```text
CREATED
   ↓
PROCESSING
   ↓
FAILED
```

or:

```text
CREATED
   ↓
PROCESSING
   ↓
CANCELLED
```

or:

```text
CREATED
   ↓
PROCESSING
   ↓
REJECTED
```

A retry of the provider request does not create a new withdrawal.

It retries the same:

```text
Withdrawal ID
```

and:

```text
Provider Idempotency Key
```

---

# 23. Duplicate Provider Webhooks

External providers may send:

```text
FAILED
FAILED
FAILED
```

for the same withdrawal.

The application must process these events idempotently.

Example:

```text
Withdrawal:
wd_123

Webhook 1:
FAILED

Webhook 2:
FAILED

Webhook 3:
FAILED
```

Only one recovery is allowed.

Final ledger:

```text
-₹500 WITHDRAWAL
+₹500 WITHDRAWAL_RECOVERY
```

Never:

```text
-₹500
+₹500
+₹500
+₹500
```

---

# 24. Webhook Idempotency

The provider webhook should contain an external event identifier.

Example:

```text
provider_event_id = evt_123
```

The system should persist the event ID.

Database constraint:

```text
UNIQUE(provider_event_id)
```

If the same event arrives again:

```text
evt_123
```

the database rejects the duplicate.

Alternatively, the application can detect the existing event and safely return success.

The key principle is:

> **Duplicate delivery must result in the same final state and no additional financial effect.**

---

# 25. Withdrawal Recovery Idempotency

Even if webhook event IDs are unavailable or unreliable, the financial recovery itself must remain protected.

The system should enforce:

```text
UNIQUE(withdrawal_id, transaction_type)
```

where:

```text
transaction_type = WITHDRAWAL_RECOVERY
```

Therefore:

```text
Withdrawal wd_123
    |
    +-- WITHDRAWAL_RECOVERY
```

can exist only once.

This provides a second layer of protection.

---

# 26. Recovery Race Condition

Suppose two webhook workers process the same failed withdrawal.

```text
Worker A → FAILED
Worker B → FAILED
```

Both attempt:

```text
+₹500 WITHDRAWAL_RECOVERY
```

Possible execution:

```text
Worker A
    |
    v
BEGIN
    |
    v
Create Recovery
    |
    v
COMMIT
```

Worker B:

```text
BEGIN
    |
    v
Create Recovery
    |
    v
UNIQUE CONSTRAINT
    |
    v
Duplicate
    |
    v
No Financial Effect
```

Only one recovery succeeds.

---

# 27. Scheduler Concurrency

The advance scheduler may run:

```text
Every 5 minutes
```

But a previous execution may still be running.

Example:

```text
Job A starts at 10:00
Job B starts at 10:05

Job A is still processing Sale #123
Job B also finds Sale #123
```

The system must remain safe.

Possible strategies include:

### Strategy A: Database-Level Idempotency

Allow both jobs to attempt processing.

The unique constraint ensures:

```text
One Advance
```

This is simple and robust.

### Strategy B: Row-Level Locking

Lock the sale during advance processing.

This prevents concurrent processing.

### Strategy C: Job-Level Locking

Use a distributed lock or scheduler mechanism.

This reduces duplicate work but should not be the only correctness mechanism.

The recommended design is:

```text
Scheduler Coordination
        +
Database Idempotency
```

Scheduler locks improve efficiency.

Database constraints guarantee correctness.

---

# 28. Database Constraints as Final Defense

Application logic may contain:

```text
if (!advanceExists) {
    createAdvance();
}
```

This is not sufficient.

Two concurrent requests may both execute:

```text
if (!advanceExists)
```

before either creates the record.

Therefore:

```text
Application Check
```

must be backed by:

```text
Database Unique Constraint
```

The correct architecture is:

```text
Application Validation
        +
Transaction
        +
Database Constraint
```

---

# 29. Idempotency Keys vs Unique Constraints

These mechanisms solve different problems.

### Idempotency Key

Protects against repeated requests representing the same client operation.

Example:

```text
POST /api/v1/workflows/withdrawals
Idempotency-Key: abc123
```

A client retry with:

```text
abc123
```

must return the same operation rather than creating another withdrawal.

### Unique Constraint

Protects database invariants.

Example:

```text
UNIQUE(sale_id, transaction_type)
```

Even if the application incorrectly attempts a duplicate operation, the database prevents it.

The recommended architecture is:

```text
Idempotency Key
        ↓
Application Operation
        ↓
Transaction
        ↓
Unique Constraint
```

---

# 30. Withdrawal API Idempotency

A withdrawal request should support an idempotency key.

Example:

```text
POST /api/v1/workflows/withdrawals

Idempotency-Key: client-request-123
Amount: ₹500
```

First request:

```text
201 Created
Withdrawal ID = wd_001
```

Client does not receive the response because of a network timeout.

The client retries:

```text
POST /api/v1/workflows/withdrawals

Idempotency-Key: client-request-123
Amount: ₹500
```

The system returns:

```text
Withdrawal ID = wd_001
```

It must not create:

```text
wd_002
```

---

# 31. Idempotency Key Rules

An idempotency key must be:

```text
Unique per logical client operation
```

It should be stored with:

```text
user_id
endpoint / operation
request fingerprint
response
created_at
```

The request fingerprint prevents this:

```text
First Request:
Key = abc123
Amount = ₹500

Second Request:
Key = abc123
Amount = ₹1000
```

The system must reject the second request because the same key is being reused for a different operation.

Recommended response:

```text
409 Conflict
```

---

# 32. Idempotent Withdrawal Request Flow

```text
Client
   |
   | POST /api/v1/workflows/withdrawals
   | Idempotency-Key = abc123
   v
Check Idempotency Record
   |
   +---- Exists ----> Return Previous Result
   |
   +---- Not Exists
           |
           v
      BEGIN TRANSACTION
           |
           v
      Lock Account
           |
           v
      Validate Balance
           |
           v
      Create Withdrawal
           |
           v
      Create Ledger Debit
           |
           v
      Update Projection
           |
           v
      Store Idempotency Record
           |
           v
      COMMIT
           |
           v
      Provider Execution
```

---

# 33. Reconciliation Idempotency

Admin reconciliation can also be retried.

Example:

```text
Admin clicks Approve
```

The request times out.

The administrator clicks again.

The system must not create:

```text
+₹36
+₹36
```

The first successful transaction changes:

```text
PENDING → APPROVED
```

The second request observes:

```text
APPROVED
```

and creates no additional financial effect.

The state transition itself acts as a natural idempotency boundary.

---

# 34. State-Based Idempotency

For a sale:

```text
PENDING
```

the operation may execute.

For:

```text
APPROVED
```

the approval operation must not execute again.

For:

```text
REJECTED
```

the approval operation must not execute.

Therefore:

```text
Allowed:
PENDING → APPROVED

Not Allowed:
APPROVED → APPROVED
REJECTED → APPROVED
```

The state machine protects the financial operation.

---

# 35. Concurrency During Account Projection

Multiple financial events may affect the same account.

Example:

```text
Advance:
+₹4

Settlement:
+₹36

Withdrawal:
-₹20
```

These may happen concurrently.

The account projection must be updated safely.

The recommended strategy is:

```text
BEGIN TRANSACTION

SELECT account
FOR UPDATE

Calculate new projection

Insert ledger entry

Update account

COMMIT
```

This ensures that each transaction sees the latest committed account state.

---

# 36. Account Projection Example

Initial:

```text
Withdrawable = ₹0
Recovery = ₹0
```

Two concurrent credits:

```text
Transaction A = +₹36
Transaction B = +₹4
```

Without locking:

```text
A reads ₹0
B reads ₹0

A writes ₹36
B writes ₹4

Final = ₹4
```

The ₹36 update is lost.

With locking:

```text
A locks account
A writes ₹36
A commits

B locks account
B reads ₹36
B writes ₹40
B commits
```

Final:

```text
Withdrawable = ₹40
```

No lost update.

---

# 37. Account Lock Ordering

When multiple rows must be locked, the application should use a consistent lock order.

For example:

```text
1. Sale
2. Account
3. Withdrawal
```

All code paths should follow the same ordering where possible.

This reduces the risk of deadlocks.

Example of dangerous ordering:

```text
Transaction A:
Lock Sale
    ↓
Wait for Account

Transaction B:
Lock Account
    ↓
Wait for Sale
```

This can produce a deadlock.

Consistent lock ordering helps avoid this.

---

# 38. Deadlock Handling

Even with consistent lock ordering, deadlocks may still occur.

The database may terminate one transaction.

The application should:

```text
1. Detect transaction failure.
2. Roll back.
3. Retry the complete transaction.
```

The retry must be safe because the operation is idempotent.

For example:

```text
Transaction Failed
        ↓
Rollback
        ↓
Retry
        ↓
Unique Constraint / State Check
        ↓
Safe Result
```

The application must never retry only half of a financial transaction.

---

# 39. Transaction Retry Rule

When retrying a failed database transaction:

```text
Retry Entire Transaction
```

Not:

```text
Retry Only Ledger Insert
```

or:

```text
Retry Only Account Update
```

The correct model is:

```text
BEGIN
    |
    +-- Validate
    +-- Lock
    +-- Ledger
    +-- Projection
    +-- State
    |
    v
COMMIT
```

If the transaction fails:

```text
ROLLBACK
```

Then execute the entire transaction again.

---

# 40. External Provider and Database Consistency

The database and external payment provider cannot participate in one local ACID transaction.

Therefore:

```text
Database
```

and:

```text
Payment Provider
```

must be treated as separate systems.

The system must use a controlled workflow:

```text
Internal Financial Commitment
        ↓
External Execution
        ↓
External Result
        ↓
Internal State Update
```

The internal system must remain safe even when the external operation is delayed or unknown.

---

# 41. Provider Result Handling

### Success

```text
PROCESSING
    ↓
SUCCESS
```

No recovery.

### Failed

```text
PROCESSING
    ↓
FAILED
    ↓
Recovery
```

### Cancelled

```text
PROCESSING
    ↓
CANCELLED
    ↓
Recovery
```

### Rejected

```text
PROCESSING
    ↓
REJECTED
    ↓
Recovery
```

Recovery must happen exactly once.

---

# 42. Unknown Provider Result

If the provider response is unknown:

```text
PROCESSING
```

must remain the internal state.

The system must not assume:

```text
SUCCESS
```

or:

```text
FAILED
```

until sufficient evidence exists.

This is important because:

```text
Timeout ≠ Failure
```

A timeout only means:

```text
Application does not know the result.
```

The provider may have successfully processed the payment.

---

# 43. Recovery Trigger Rule

Recovery should occur only when the withdrawal reaches a terminal failure state.

Valid recovery states:

```text
FAILED
CANCELLED
REJECTED
```

Invalid recovery trigger:

```text
TIMEOUT
```

unless the system has confirmed that the payment was not executed.

This prevents:

```text
Provider actually succeeds
        +
Application assumes timeout = failure
        +
Recovery issued
```

which would create an unintended duplicate credit.

---

# 44. Webhook Processing Transaction

A provider webhook should be processed transactionally.

Conceptually:

```text
BEGIN TRANSACTION

1. Validate webhook authenticity

2. Check provider_event_id

3. If already processed:
      Return success

4. Lock Withdrawal

5. Validate current state

6. Update Withdrawal Status

7. If failure:
      Create Recovery Ledger Entry

8. Update Account Projection

9. Mark Webhook Event Processed

10. COMMIT
```

The webhook response should be returned after the database transaction succeeds.

---

# 45. Duplicate Webhook Race

Two workers receive the same webhook.

```text
Worker A
Worker B
```

Both process:

```text
provider_event_id = evt_123
```

One transaction wins.

The other encounters:

```text
UNIQUE(provider_event_id)
```

or observes that the event already exists.

Only one financial effect occurs.

---

# 46. Idempotency Matrix

| Operation            | Duplicate Risk              | Protection                       |
| -------------------- | --------------------------- | -------------------------------- |
| Advance              | Duplicate scheduler         | Unique sale + transaction type   |
| Sale Approval        | Double reconciliation       | Row lock + state transition      |
| Sale Rejection       | Double reconciliation       | Row lock + state transition      |
| Account Projection   | Lost updates                | Account row lock                 |
| Withdrawal           | Double spending             | Account row lock                 |
| Withdrawal API Retry | Duplicate request           | Idempotency key                  |
| Provider Retry       | Duplicate external transfer | Provider idempotency key         |
| Provider Webhook     | Duplicate event             | Event ID uniqueness              |
| Recovery             | Duplicate credit            | Withdrawal + recovery uniqueness |
| Database Retry       | Partial execution           | Full transaction retry           |

---

# 47. Failure Scenario Matrix

## Scenario A: Duplicate Scheduler

```text
Result:
One advance
```

Protection:

```text
Unique constraint
+
Transaction
```

---

## Scenario B: Two Admins Reconcile

```text
Result:
One final state
One financial adjustment
```

Protection:

```text
SELECT FOR UPDATE
+
State transition
```

---

## Scenario C: Two Withdrawals Simultaneously

```text
Result:
Only withdrawals within available balance succeed
```

Protection:

```text
Account row lock
```

---

## Scenario D: Client Retries Withdrawal

```text
Result:
Same withdrawal returned
```

Protection:

```text
Idempotency-Key
```

---

## Scenario E: Provider Timeout

```text
Result:
Withdrawal remains PROCESSING
```

Protection:

```text
Stable provider idempotency key
+
Status reconciliation
```

---

## Scenario F: Duplicate Failure Webhook

```text
Result:
One recovery
```

Protection:

```text
Provider event ID
+
Unique recovery constraint
```

---

## Scenario G: Database Deadlock

```text
Result:
Transaction rolls back and retries
```

Protection:

```text
Full transaction retry
+
Idempotent operation
```

---

# 48. Critical Invariants

The following invariants must always hold.

### Advance

```text
For each sale:
ADVANCE entries <= 1
```

### Reconciliation

```text
A sale can be reconciled at most once.
```

### Withdrawal

```text
A withdrawal cannot exceed available funds.
```

### Concurrent Withdrawal

```text
Total successfully reserved withdrawals
<= available withdrawable balance
```

### Recovery

```text
WITHDRAWAL_RECOVERY entries <= 1 per withdrawal
```

### Account

```text
withdrawable_balance >= 0
```

### Provider Retry

```text
One withdrawal
=
One provider idempotency key
```

### Webhook

```text
One provider event ID
=
One processed event
```

### Ledger

```text
Ledger entries are immutable.
```

---

# 49. Recommended Implementation Pattern

Every financial application service should follow this structure:

```text
Application Service
        |
        v
BEGIN TRANSACTION
        |
        v
Acquire Required Locks
        |
        v
Validate Current State
        |
        v
Validate Business Rules
        |
        v
Create Financial Record
        |
        v
Create Ledger Entry
        |
        v
Update Account Projection
        |
        v
Update Business State
        |
        v
COMMIT
        |
        v
External Side Effect
```

The exact order may differ for specific operations, but the principles remain constant.

---

# 50. What Must Never Happen

The following patterns are prohibited.

### Direct Balance Mutation

```text
account.balance += amount
```

without a corresponding ledger entry.

---

### External Call Before Reservation

```text
Call Provider
    ↓
Then Debit Balance
```

This can cause double spending.

---

### Application-Only Idempotency

```text
if (!exists) {
    create();
}
```

without a database constraint.

---

### Duplicate Recovery

```text
Every FAILED webhook
    ↓
Create Recovery
```

without idempotency protection.

---

### Retry With New Withdrawal

```text
Timeout
    ↓
Create New Withdrawal
```

This can cause duplicate payments.

---

### Treating Timeout as Failure

```text
Timeout
    ↓
Recovery
```

without confirming provider failure.

---

### Partial Transaction Retry

```text
Ledger succeeded
Account failed
    ↓
Retry Account Only
```

This can create inconsistent financial state.

---

# 51. Final Concurrency Architecture

The complete model is:

```text
                 CLIENT
                    |
                    v
            IDEMPOTENCY KEY
                    |
                    v
           APPLICATION SERVICE
                    |
                    v
           DATABASE TRANSACTION
                    |
          +---------+---------+
          |                   |
          v                   v
      ROW LOCKS        UNIQUE CONSTRAINTS
          |                   |
          +---------+---------+
                    |
                    v
              LEDGER ENTRY
                    |
                    v
           ACCOUNT PROJECTION
                    |
                    v
                 COMMIT
                    |
                    v
         EXTERNAL PAYMENT PROVIDER
                    |
                    v
              WEBHOOK EVENT
                    |
                    v
          EVENT IDEMPOTENCY CHECK
                    |
                    v
            LOCK WITHDRAWAL
                    |
                    v
            UPDATE STATE
                    |
                    v
          RECOVERY IF REQUIRED
```

---

# 52. Final Concurrency Principles

The system's concurrency strategy can be summarized as:

```text
Database Transactions
        +
Pessimistic Row Locking
        +
Unique Constraints
        +
Application Idempotency Keys
        +
Provider Idempotency Keys
        +
Webhook Event Deduplication
        +
Append-Only Ledger
        +
Safe Transaction Retries
```

The most important invariant is:

> **No matter how many times an operation is retried, duplicated, or concurrently executed, the resulting financial effect must be equivalent to executing that operation exactly once.**

The system therefore treats:

```text
Exactly-Once Financial Effect
```

as the business requirement, while accepting:

```text
At-Least-Once Execution
```

as the reality of distributed systems.

---

# 53. Implementation Decision Summary

The following decisions are now considered mandatory implementation rules.

| Concern                     | Decision                                   |
| --------------------------- | ------------------------------------------ |
| Advance duplication         | Unique `(sale_id, transaction_type)`       |
| Sale reconciliation         | `SELECT FOR UPDATE`                        |
| Account balance concurrency | `SELECT FOR UPDATE`                        |
| Withdrawal reservation      | Debit before provider call                 |
| Withdrawal API retry        | Client idempotency key                     |
| Provider retry              | Stable provider idempotency key            |
| Webhook duplication         | Unique provider event ID                   |
| Recovery duplication        | Unique `(withdrawal_id, transaction_type)` |
| Ledger consistency          | Ledger + projection in one transaction     |
| Database deadlock           | Retry entire transaction                   |
| Provider timeout            | Do not assume failure                      |
| Financial history           | Append-only                                |
| Balance source              | Ledger-derived projection                  |
| External provider           | Separate transaction boundary              |

This document establishes the final concurrency and idempotency contract for the system.
