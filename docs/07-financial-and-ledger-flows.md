# Financial and Ledger Flows

## 1. Purpose

This document defines how money moves through the User Payout Management System.

It establishes:

* The ledger as the financial source of truth.
* The account balance as a projection of ledger history.
* How advances are credited.
* How approved sales are settled.
* How rejected sales recover advances.
* How withdrawals reserve funds.
* How successful withdrawals are finalized.
* How failed withdrawals are recovered.
* How duplicate operations are prevented.
* How concurrent financial operations are handled.

The central financial principle is:

> Every financial movement must be represented by an immutable ledger entry.

The system must never directly modify financial history to correct a mistake.

---

# 2. Financial Architecture

The financial model consists of three primary layers:

```text
Ledger
   |
   | Source of Truth
   v
Account Projection
   |
   | Fast Read Model
   v
Withdrawable / Recovery Balance
```

The ledger records every financial movement.

The account projection provides fast access to the current financial position.

The projection must always be recoverable from the ledger.

---

# 3. Ledger as Source of Truth

The ledger is append-only.

Once a ledger entry is created:

```text
UPDATE = Forbidden
DELETE = Forbidden
```

Corrections are represented by new entries.

Example:

```text
Original Withdrawal
    -₹500

Payment Failed

Recovery
    +₹500
```

The original entry remains unchanged.

The resulting net balance is:

```text
-₹500 + ₹500 = ₹0
```

However, the audit history still shows:

```text
Withdrawal: ₹500
Recovery: ₹500
```

This provides complete financial traceability.

---

# 4. Account Projection

The account projection exists for performance.

Example:

```text
Account
-------------------------
Withdrawable Balance
₹1000
```

Instead of calculating:

```text
SUM(all ledger entries)
```

for every dashboard request, the system reads:

```text
account.withdrawable_balance
```

The projection must be updated atomically with the corresponding ledger entry.

Example:

```text
BEGIN TRANSACTION

Create Ledger Entry
    +₹100

Update Account Projection
    Balance += ₹100

COMMIT
```

The system must never commit one operation without the other.

---

# 5. Financial Accounts

Each affiliate user has an account containing at least:

```text
withdrawable_balance
recovery_balance
currency
```

### Withdrawable Balance

Represents funds that can currently be withdrawn by the user.

The system guarantees:

```text
withdrawable_balance >= 0
```

### Recovery Balance

Represents money that the user owes back to the platform.

This is kept separate from withdrawable funds.

Example:

```text
Withdrawable Balance = ₹100
Recovery Balance     = ₹20
```

The user has:

```text
₹100 available to withdraw
₹20 owed to the platform
```

The system does not represent this as:

```text
Withdrawable Balance = ₹80
```

unless the business explicitly defines automatic recovery netting.

This separation makes financial state explicit and easier to audit.

---

# 6. Ledger Entry Types

The system supports the following financial entry types.

```text
ADVANCE
FINAL_SETTLEMENT
REJECTION_ADJUSTMENT
WITHDRAWAL
WITHDRAWAL_RECOVERY
```

The exact database representation may include additional metadata.

Each ledger entry should contain:

```text
id
account_id
entry_type
amount
currency
reference
created_at
```

The reference must identify the originating business operation.

Examples:

```text
ADVANCE
    → sale_id

FINAL_SETTLEMENT
    → sale_id

REJECTION_ADJUSTMENT
    → sale_id

WITHDRAWAL
    → withdrawal_id

WITHDRAWAL_RECOVERY
    → withdrawal_id
```

---

# 7. Ledger Amount Convention

Ledger amounts use signed values.

Positive amount:

```text
+₹100
```

means money is credited to the user's account.

Negative amount:

```text
-₹100
```

means money is debited from the user's account.

Example:

```text
+₹4
```

represents an advance payout.

```text
+₹36
```

represents a final approved settlement.

```text
-₹4
```

represents recovery of an advance for a rejected sale.

```text
-₹500
```

represents a withdrawal.

```text
+₹500
```

represents recovery of a failed withdrawal.

---

# 8. Financial Flow: Advance Payout

Consider a sale:

```text
Total Earnings = ₹40
```

Advance percentage:

```text
10%
```

Therefore:

```text
Advance = ₹40 × 10%
        = ₹4
```

The ledger receives:

```text
+₹4 ADVANCE
```

Account projection:

```text
Before:
Withdrawable Balance = ₹0

After:
Withdrawable Balance = ₹4
```

The sale remains:

```text
PENDING
```

The advance does not reconcile the sale.

---

# 9. Advance Payout Transaction

The advance operation must be atomic.

Conceptually:

```text
BEGIN TRANSACTION

1. Lock / validate sale

2. Verify:
   Sale = PENDING

3. Verify:
   Successful Advance does not exist

4. Calculate:
   Advance = Total Earnings × 10%

5. Create Advance Payout

6. Create Ledger Entry:
   +₹4

7. Update Account:
   withdrawable_balance += ₹4

8. Commit

Then:

9. Execute Payment Provider Operation
```

The ledger and account projection must be committed before external payment execution.

---

# 10. Advance Payout Example

Initial state:

```text
Sale:
Total Earnings = ₹40
Status = PENDING

Account:
Withdrawable Balance = ₹0
```

After advance:

```text
Ledger:

+₹4 ADVANCE
```

Account:

```text
Withdrawable Balance = ₹4
```

Sale:

```text
Status = PENDING
```

The financial state is:

```text
User has received ₹4
Sale is still awaiting final reconciliation
```

---

# 11. Duplicate Advance Prevention

Suppose the scheduler runs twice.

### First execution

```text
Scheduler Run #1
    |
    v
Sale PENDING
    |
    v
No Advance Exists
    |
    v
Create +₹4 Advance
```

Result:

```text
Ledger:
+₹4
```

### Second execution

```text
Scheduler Run #2
    |
    v
Sale PENDING
    |
    v
Advance Already Exists
    |
    v
Skip
```

Result:

```text
Ledger:
+₹4
```

Not:

```text
+₹8
```

The database must enforce the invariant.

---

# 12. Approved Sale Flow

Consider:

```text
Total Earnings = ₹40
Advance Paid   = ₹4
```

The administrator approves the sale.

The final amount is:

```text
Final Settlement
=
Total Earnings
-
Advance Paid
```

Therefore:

```text
₹40 - ₹4 = ₹36
```

The system creates:

```text
+₹36 FINAL_SETTLEMENT
```

The complete ledger becomes:

```text
+₹4  ADVANCE
+₹36 FINAL_SETTLEMENT
---------------------
+₹40 NET EARNINGS
```

The user ultimately receives the full ₹40.

---

# 13. Approved Sale Transaction

The reconciliation transaction must:

```text
BEGIN TRANSACTION

1. Lock Sale

2. Verify:
   Sale Status = PENDING

3. Determine:
   Advance Paid = ₹4

4. Calculate:
   Final Settlement = ₹40 - ₹4 = ₹36

5. Create Ledger:
   +₹36 FINAL_SETTLEMENT

6. Update Account:
   withdrawable_balance += ₹36

7. Update Sale:
   PENDING → APPROVED

8. Commit
```

The state transition and financial adjustment must be atomic.

---

# 14. Approved Sale Example

Initial state:

```text
Sale:
Total Earnings = ₹40
Status = PENDING

Account:
Withdrawable Balance = ₹0
```

After advance:

```text
Ledger:
+₹4 ADVANCE

Balance:
₹4
```

After approval:

```text
Ledger:
+₹36 FINAL_SETTLEMENT

Balance:
₹40
```

Final state:

```text
Sale = APPROVED

Total credited:
₹4 + ₹36 = ₹40
```

---

# 15. Rejected Sale Flow

Consider:

```text
Total Earnings = ₹40
Advance Paid   = ₹4
```

The administrator rejects the sale.

The user is not entitled to any commission.

The user has already received:

```text
₹4
```

Therefore, the system must recover:

```text
Recovery = ₹4
```

The system creates:

```text
-₹4 REJECTION_ADJUSTMENT
```

The complete ledger becomes:

```text
+₹4  ADVANCE
-₹4  REJECTION_ADJUSTMENT
-------------------------
₹0 NET EARNINGS
```

The user's final entitlement is:

```text
₹0
```

---

# 16. Rejected Sale Transaction

The reconciliation transaction must:

```text
BEGIN TRANSACTION

1. Lock Sale

2. Verify:
   Sale Status = PENDING

3. Determine:
   Advance Paid = ₹4

4. Calculate:
   Recovery = ₹4

5. Create Ledger:
   -₹4 REJECTION_ADJUSTMENT

6. Update Account Projection

7. Update recovery balance if required

8. Update Sale:
   PENDING → REJECTED

9. Commit
```

The original advance ledger entry remains untouched.

---

# 17. Rejected Sale Example

Initial:

```text
Sale:
Total Earnings = ₹40
Status = PENDING

Balance:
₹0
```

Advance:

```text
+₹4
```

Balance:

```text
₹4
```

Rejected:

```text
-₹4
```

Balance:

```text
₹0
```

Final:

```text
Sale = REJECTED

Net Earnings = ₹0
```

---

# 18. Rejected Sale Without Advance

Consider:

```text
Total Earnings = ₹40
Advance Paid   = ₹0
```

The sale is rejected.

No financial recovery is required.

The ledger receives:

```text
No financial entry
```

or, if the system requires an explicit zero-value audit event, the event must not create a monetary ledger entry.

Final financial result:

```text
₹0
```

The sale becomes:

```text
REJECTED
```

---

# 19. Complete Reconciliation Example

Assume one user has three sales.

```text
Sale A:
Total Earnings = ₹40
Advance = ₹4
Status = APPROVED

Sale B:
Total Earnings = ₹40
Advance = ₹4
Status = APPROVED

Sale C:
Total Earnings = ₹40
Advance = ₹4
Status = REJECTED
```

Ledger:

```text
Sale A:
+₹4  ADVANCE
+₹36 FINAL_SETTLEMENT

Sale B:
+₹4  ADVANCE
+₹36 FINAL_SETTLEMENT

Sale C:
+₹4  ADVANCE
-₹4  REJECTION_ADJUSTMENT
```

Total:

```text
Sale A = ₹40
Sale B = ₹40
Sale C = ₹0
----------------
Total   = ₹80
```

The user's net earnings are:

```text
₹80
```

This demonstrates why the ledger provides a transparent financial audit trail.

---

# 20. Withdrawal Flow

Assume:

```text
Withdrawable Balance = ₹1000
```

The user requests:

```text
Withdrawal = ₹500
```

The system must first reserve/debit the funds internally.

Ledger:

```text
-₹500 WITHDRAWAL
```

Account:

```text
₹1000 - ₹500 = ₹500
```

Withdrawal:

```text
PROCESSING
```

Only after the database transaction commits does the system call the external payment provider.

---

# 21. Withdrawal Transaction

The withdrawal transaction is:

```text
BEGIN TRANSACTION

1. Lock Account

2. Validate:
   Amount > 0

3. Validate:
   Balance >= Withdrawal Amount

4. Validate:
   24-hour withdrawal rule

5. Create Withdrawal:
   PROCESSING

6. Create Ledger:
   -₹500 WITHDRAWAL

7. Update Account:
   Balance -= ₹500

8. Commit

Then:

9. Call Payment Provider
```

This prevents two concurrent withdrawal requests from spending the same funds.

---

# 22. Concurrent Withdrawal Example

Initial:

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

A approves ₹500
B approves ₹500

Result:
₹1000 spent from ₹500
```

This is a double-spending bug.

With row locking:

```text
Request A
    |
    v
LOCK ACCOUNT
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
  COMMIT
    |
    v
Unlock


Request B
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

# 23. Successful Withdrawal

Suppose:

```text
Initial Balance = ₹1000
Withdrawal = ₹500
```

After withdrawal creation:

```text
Ledger:
-₹500 WITHDRAWAL

Balance:
₹500

Withdrawal:
PROCESSING
```

Provider confirms success.

The system updates:

```text
Withdrawal:
PROCESSING → SUCCESS
```

No additional ledger entry is created.

Final ledger:

```text
-₹500 WITHDRAWAL
```

Final balance:

```text
₹500
```

---

# 24. Failed Withdrawal

Suppose:

```text
Initial Balance = ₹1000
Withdrawal = ₹500
```

After withdrawal creation:

```text
Ledger:
-₹500 WITHDRAWAL

Balance:
₹500

Withdrawal:
PROCESSING
```

Provider reports:

```text
FAILED
```

The system creates:

```text
+₹500 WITHDRAWAL_RECOVERY
```

Account becomes:

```text
₹500 + ₹500 = ₹1000
```

Final ledger:

```text
-₹500 WITHDRAWAL
+₹500 WITHDRAWAL_RECOVERY
-------------------------
₹0 NET EFFECT
```

The financial history remains intact.

---

# 25. Cancelled Withdrawal

The same recovery process applies when the provider reports:

```text
CANCELLED
```

Ledger:

```text
-₹500 WITHDRAWAL
+₹500 WITHDRAWAL_RECOVERY
```

Account:

```text
Restored
```

Withdrawal:

```text
CANCELLED
```

---

# 26. Rejected Withdrawal

If the provider reports:

```text
REJECTED
```

the system creates:

```text
+₹500 WITHDRAWAL_RECOVERY
```

The final result is:

```text
Withdrawal = REJECTED

Original Debit:
-₹500

Recovery:
+₹500

Net:
₹0
```

---

# 27. Failed Withdrawal Recovery Idempotency

Suppose the provider sends three identical failure events:

```text
FAILED
FAILED
FAILED
```

The system must produce:

```text
Original:
-₹500

Recovery:
+₹500
```

Only once.

Not:

```text
-₹500
+₹500
+₹500
+₹500
```

The recovery operation must have a unique constraint.

Conceptually:

```text
UNIQUE(withdrawal_id, WITHDRAWAL_RECOVERY)
```

---

# 28. Recovery Balance

A rejected sale may create an amount owed by the user.

Example:

```text
Advance Paid = ₹4
Sale Rejected
```

The user owes:

```text
₹4
```

The system records:

```text
Recovery Balance = ₹4
```

This is distinct from:

```text
Withdrawable Balance
```

Example:

```text
Withdrawable Balance = ₹100
Recovery Balance     = ₹4
```

The user can see:

```text
Available to Withdraw: ₹100
Amount Owed: ₹4
```

The exact mechanism for collecting this recovery must follow the business policy.

Possible future policies include:

```text
Automatic Netting
Manual Repayment
Future Earnings Offset
Account Restriction
```

The current system must not silently assume one unless explicitly defined by the requirements.

---

# 29. Financial Flow with Recovery Balance

Consider:

```text
Sale Earnings = ₹40
Advance = ₹4
```

Advance:

```text
Withdrawable Balance = ₹4
Recovery Balance = ₹0
```

Sale rejected:

```text
Rejection Adjustment = -₹4
```

If the user has no available funds to offset the recovery, the system records:

```text
Withdrawable Balance = ₹0
Recovery Balance = ₹4
```

The financial state becomes:

```text
User has:
₹0 available to withdraw
₹4 owed to platform
```

The original advance remains in the ledger.

The recovery obligation is separately visible.

---

# 30. Recovery Balance and Ledger

The ledger remains the source of truth for the financial event.

The recovery balance is a projection of outstanding recovery obligations.

Example:

```text
Ledger:

+₹4 ADVANCE
-₹4 REJECTION_ADJUSTMENT
```

The application may represent the outstanding recovery as:

```text
Recovery Balance = ₹4
```

until the recovery is actually settled.

The implementation must clearly distinguish:

```text
Financial Adjustment
```

from:

```text
Recovery Obligation
```

to avoid double-counting the same financial effect.

---

# 31. Important Accounting Rule

A financial event must never be recorded twice.

For example, a rejected sale with an advance must not result in:

```text
-₹4 REJECTION_ADJUSTMENT
+
₹4 RECOVERY_BALANCE DEBIT
```

if both represent the same recovery.

The system must define exactly which ledger entry represents the financial adjustment.

The recovery balance is a separate projection of what remains owed, not an additional financial transaction.

---

# 32. Complete Multi-Sale Example

Assume:

```text
Sale A = ₹40
Sale B = ₹40
Sale C = ₹40
```

All are initially:

```text
PENDING
```

### Step 1: Advances

```text
Sale A → +₹4
Sale B → +₹4
Sale C → +₹4
```

Account:

```text
Withdrawable Balance = ₹12
```

---

### Step 2: Sale A Approved

```text
Final Settlement = ₹40 - ₹4
                 = ₹36
```

Ledger:

```text
+₹36
```

Balance:

```text
₹12 + ₹36 = ₹48
```

---

### Step 3: Sale B Approved

```text
Final Settlement = ₹36
```

Balance:

```text
₹48 + ₹36 = ₹84
```

---

### Step 4: Sale C Rejected

```text
Recovery = ₹4
```

Ledger:

```text
-₹4
```

Balance:

```text
₹84 - ₹4 = ₹80
```

Final result:

```text
Sale A = ₹40
Sale B = ₹40
Sale C = ₹0

Total = ₹80
```

Ledger:

```text
+₹4   Sale A Advance
+₹36  Sale A Final

+₹4   Sale B Advance
+₹36  Sale B Final

+₹4   Sale C Advance
-₹4   Sale C Rejection
-----------------------
₹80 Net Earnings
```

---

# 33. Multi-Sale Withdrawal Example

Using the previous example:

```text
Withdrawable Balance = ₹80
```

User requests:

```text
Withdrawal = ₹50
```

Ledger:

```text
-₹50 WITHDRAWAL
```

Balance:

```text
₹80 - ₹50 = ₹30
```

Withdrawal:

```text
PROCESSING
```

Provider succeeds.

Final:

```text
Balance = ₹30
Withdrawal = SUCCESS
```

---

# 34. Multi-Sale Failed Withdrawal

Initial:

```text
Balance = ₹80
```

Withdrawal:

```text
₹50
```

Ledger:

```text
-₹50 WITHDRAWAL
```

Balance:

```text
₹30
```

Provider fails.

Recovery:

```text
+₹50 WITHDRAWAL_RECOVERY
```

Balance:

```text
₹30 + ₹50 = ₹80
```

Final:

```text
Withdrawal = FAILED
Balance = ₹80
```

The user's financial position is restored.

---

# 35. Full End-to-End Financial Timeline

```text
T1
Sale Created
    |
    v
PENDING


T2
Advance Scheduler
    |
    v
+₹4 ADVANCE
    |
    v
Balance = ₹4


T3
Admin Approves Sale
    |
    v
+₹36 FINAL_SETTLEMENT
    |
    v
Balance = ₹40


T4
User Requests Withdrawal
    |
    v
-₹40 WITHDRAWAL
    |
    v
Balance = ₹0


T5
Payment Provider Fails
    |
    v
+₹40 WITHDRAWAL_RECOVERY
    |
    v
Balance = ₹40
```

Final state:

```text
Sale = APPROVED
Withdrawal = FAILED
Balance = ₹40
```

Ledger:

```text
+₹4   ADVANCE
+₹36  FINAL_SETTLEMENT
-₹40  WITHDRAWAL
+₹40  WITHDRAWAL_RECOVERY
---------------------------
₹40 Net Position
```

The financial history explains every movement.

---

# 36. Duplicate Webhook Scenario

Suppose:

```text
Withdrawal = ₹500
```

The provider sends:

```text
Webhook 1 → FAILED
Webhook 2 → FAILED
Webhook 3 → FAILED
```

Processing:

```text
Webhook 1
    |
    v
Withdrawal → FAILED
    |
    v
Create Recovery +₹500


Webhook 2
    |
    v
Event Already Processed
    |
    v
No Financial Effect


Webhook 3
    |
    v
Event Already Processed
    |
    v
No Financial Effect
```

Final ledger:

```text
-₹500 WITHDRAWAL
+₹500 WITHDRAWAL_RECOVERY
```

Exactly one recovery.

---

# 37. Concurrent Reconciliation Scenario

Suppose:

```text
Sale Earnings = ₹40
Advance = ₹4
```

Two administrators act simultaneously.

```text
Admin A → APPROVE
Admin B → REJECT
```

Database:

```text
Admin A
    |
    v
LOCK SALE
    |
    v
PENDING
    |
    v
+₹36
    |
    v
APPROVED
    |
  COMMIT
```

Admin B then obtains the lock.

It sees:

```text
Sale = APPROVED
```

Therefore:

```text
Reject Request
```

No second financial entry is created.

Final ledger:

```text
+₹4 ADVANCE
+₹36 FINAL_SETTLEMENT
```

---

# 38. Concurrent Withdrawal Scenario

Initial:

```text
Balance = ₹100
```

Requests:

```text
Request A = ₹100
Request B = ₹100
```

Account lock ensures:

```text
Request A
    |
    v
Debit ₹100
    |
    v
Balance = ₹0
```

Request B then executes:

```text
Balance = ₹0
```

Therefore:

```text
INSUFFICIENT_BALANCE
```

Only one withdrawal exists.

---

# 39. Financial Transaction Boundaries

The following operations must be atomic.

### Advance

```text
Advance Record
+
Ledger Entry
+
Account Projection
```

### Approved Reconciliation

```text
Sale Status
+
Ledger Entry
+
Account Projection
```

### Rejected Reconciliation

```text
Sale Status
+
Ledger Entry / Recovery Obligation
+
Account Projection
```

### Withdrawal Creation

```text
Withdrawal Record
+
Ledger Debit
+
Account Projection
```

### Withdrawal Recovery

```text
Withdrawal Status
+
Recovery Ledger Entry
+
Account Projection
+
Recovery State
```

External provider calls must not be part of these database transactions.

---

# 40. External Payment Provider Boundary

The system must separate:

```text
Internal Financial Commitment
```

from:

```text
External Payment Execution
```

Example:

```text
Database Transaction
    |
    +---- Ledger Debit
    +---- Balance Reservation
    +---- Withdrawal Created
    |
    v
COMMIT
    |
    v
External Provider
```

If the provider call times out:

```text
Unknown External Result
```

The system must not create another withdrawal.

Instead:

```text
Retry Same Provider Operation
```

or:

```text
Query Provider Status
```

using the provider's idempotency mechanism.

---

# 41. Financial Failure Principle

The system follows:

> Fail closed for money movement.

If the system cannot determine whether an external payment succeeded:

```text
Do not release funds.
Do not create a second withdrawal.
Do not create a duplicate ledger debit.
```

The withdrawal remains in a non-terminal state until the provider result is known.

This prevents double-spending.

---

# 42. Ledger Integrity Rules

The following constraints must always hold.

```text
1. Ledger entries are append-only.
2. Every financial entry has a business reference.
3. Every monetary amount has a currency.
4. Duplicate financial operations are prevented.
5. Ledger entries cannot be deleted.
6. Ledger entries cannot be modified.
7. Every projection update corresponds to a ledger event.
8. Every ledger event has a defined transaction type.
9. Financial operations are atomic.
10. Account projection can be rebuilt from ledger history.
```

---

# 43. Financial Reconciliation Formula

For a sale:

```text
Total Earnings = T
Advance Paid   = A
```

If approved:

```text
Final Settlement = T - A
```

Total credited:

```text
A + (T - A)
= T
```

If rejected:

```text
Rejection Adjustment = -A
```

Total net earnings:

```text
A - A
= 0
```

Therefore:

```text
APPROVED → User receives exactly Total Earnings
REJECTED → User receives exactly ₹0
```

---

# 44. Financial Invariant

For every sale:

```text
Net Sale Earnings
=
Advance
+
Final Settlement
+
Rejection Adjustment
```

For approved:

```text
Net Sale Earnings = Total Earnings
```

For rejected:

```text
Net Sale Earnings = ₹0
```

This invariant can be used directly in automated tests.

---

# 45. Financial Audit Example

A support administrator investigating a user's account should be able to reconstruct the balance.

Example:

```text
Date        Type                    Amount
------------------------------------------------
Jul 01      Advance                 +₹4
Jul 15      Final Settlement        +₹36
Jul 16      Withdrawal              -₹20
Jul 17      Withdrawal Recovery     +₹20
------------------------------------------------
Net Balance                         ₹40
```

The support team can immediately explain:

```text
₹4 advance
₹36 final settlement
₹20 withdrawal
₹20 recovery after failed withdrawal
```

This is the primary advantage of an append-only ledger.

---

# 46. Projection Rebuild

If the account projection becomes corrupted:

```text
withdrawable_balance
```

can be reconstructed from ledger history.

Conceptually:

```text
SELECT SUM(amount)
FROM ledger_entries
WHERE account_id = $1;
```

The exact query may depend on:

* Entry type
* Account type
* Recovery semantics
* Currency
* Posted status

The important principle is:

```text
Ledger → Projection
```

not:

```text
Projection → Ledger
```

---

# 47. Financial Flow Summary

The complete financial model is:

```text
                    SALE
                      |
                      v
                  PENDING
                      |
              +-------+-------+
              |               |
              v               v
           ADVANCE         RECONCILE
              |               |
              v               |
           +₹10%              |
                              |
                    +---------+---------+
                    |                   |
                    v                   v
                 APPROVED            REJECTED
                    |                   |
                    v                   v
             +Final Settlement    -Advance Recovery
                    |                   |
                    +---------+---------+
                              |
                              v
                         USER BALANCE
                              |
                              v
                         WITHDRAWAL
                              |
                              v
                        -Withdrawal
                              |
                              v
                         PROVIDER
                              |
                    +---------+---------+
                    |                   |
                    v                   v
                 SUCCESS             FAILURE
                    |                   |
                    |                   v
                    |             +Recovery
                    |                   |
                    +---------+---------+
                              |
                              v
                       FINAL LEDGER
```

---

# 48. Core Financial Principles

The system follows these principles:

```text
1. The ledger is the financial source of truth.
2. Account balances are projections.
3. Every financial movement creates a ledger entry.
4. Ledger entries are immutable.
5. Corrections create new entries.
6. Advance payouts are exactly-once per sale.
7. Approved sales pay only the remaining amount.
8. Rejected sales recover previously paid advances.
9. Withdrawals debit funds before external execution.
10. Failed external payouts trigger recovery.
11. Recovery happens exactly once.
12. External systems are assumed to be unreliable.
13. Provider calls use idempotency where supported.
14. Database transactions protect internal consistency.
15. Row locks protect concurrent financial operations.
16. Database constraints enforce critical invariants.
17. The ledger provides a complete audit trail.
18. Financial projections can be rebuilt from ledger history.
```

---

# 49. Final Financial Model

The complete financial architecture is:

```text
                    BUSINESS EVENT
                          |
                          v
                  APPLICATION SERVICE
                          |
                          v
                 DATABASE TRANSACTION
                          |
             +------------+------------+
             |                         |
             v                         v
        LEDGER ENTRY            ACCOUNT PROJECTION
             |                         |
             |                         |
             +------------+------------+
                          |
                          v
                       COMMIT
                          |
                          v
                EXTERNAL SIDE EFFECT
                          |
                          v
                  PAYMENT PROVIDER
                          |
                          v
                       WEBHOOK
                          |
                          v
                 STATE TRANSITION
                          |
                          v
                 RECOVERY IF NEEDED
                          |
                          v
                    NEW LEDGER ENTRY
```

The core invariant is:

> **The ledger records what happened. The account projection tells us what is currently available. The state machine tells us what can happen next.**

Together, these three components form the financial backbone of the system.
