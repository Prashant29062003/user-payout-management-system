# Database Design

## 1. Purpose

This document defines the persistence architecture for the User Payout Management System.

It specifies:

* Database technology
* Tables
* Columns
* Relationships
* Primary keys
* Foreign keys
* Constraints
* Indexes
* Financial data representation
* Idempotency guarantees
* Concurrency controls
* Transaction boundaries
* Ledger design
* Balance projection
* Migration strategy

The database is designed around the following principle:

> **Financial history is immutable and append-only.**

The `ledger_entries` table is the authoritative record of financial movements.

The `accounts.withdrawable_balance` field is a performance-oriented projection used for fast balance reads and withdrawal validation.

---

# 2. Database Technology

The system uses:

```text
PostgreSQL
```

PostgreSQL is selected because the application requires:

* ACID transactions
* Row-level locking
* Strong consistency
* Unique constraints
* Foreign key enforcement
* Check constraints
* Reliable concurrent writes
* JSON support where necessary
* Mature indexing capabilities

The system relies heavily on database guarantees for financial correctness.

---

# 3. Database Design Principles

The database follows these principles:

1. Money must never use floating-point types.
2. Financial records must be immutable.
3. Ledger entries are append-only.
4. Critical idempotency must be enforced by database constraints.
5. Foreign keys must protect referential integrity.
6. Financial operations must use database transactions.
7. Concurrent withdrawals must lock the account.
8. Concurrent reconciliation must lock the sale.
9. External provider references must be persisted.
10. Provider events must be idempotently processed.
11. Business operations and payment attempts are separate records.
12. Database constraints provide the final layer of financial protection.

---

# 4. Entity Relationship Overview

The conceptual database relationship is:

```text
+----------+
|  users   |
+----+-----+
     |
     | 1:1
     v
+----------+
| accounts |
+----+-----+
     |
     | 1:N
     v
+----------------+
| ledger_entries |
+----------------+

     users
       |
       | 1:N
       v
+----------+
|  sales   |
+----+-----+
     |
     | 1:N
     v
+------------------+
| advance_payouts  |
+--------+---------+
         |
         | 1:N
         v
+--------------------+
| payment_attempts   |
+--------------------+

     users
       |
       | 1:N
       v
+--------------+
| withdrawals  |
+------+-------+
       |
       | 1:N
       v
+--------------------+
| payment_attempts   |
+--------------------+
```

A payment attempt belongs to a business payout operation.

Therefore, the relationship between `payment_attempts` and its parent operation must be modeled carefully.

---

# 5. UUID Strategy

The system uses UUIDs as primary identifiers.

Example:

```text
user_id
account_id
sale_id
advance_payout_id
withdrawal_id
payment_attempt_id
ledger_entry_id
```

UUIDs are preferred because they:

* Avoid predictable sequential IDs in public APIs.
* Allow distributed ID generation.
* Avoid exposing record counts.
* Make future service decomposition easier.

The database should use PostgreSQL's native `UUID` type.

UUID generation may use:

```text
gen_random_uuid()
```

through the appropriate PostgreSQL extension.

---

# 6. Money Representation

All monetary amounts must use:

```text
NUMERIC(19, 4)
```

or an equivalent fixed-precision numeric type.

Example:

```text
NUMERIC(19, 4)
```

The system must never use:

```text
FLOAT
REAL
DOUBLE PRECISION
```

for financial values.

---

## 6.1 Why Numeric?

Floating-point arithmetic can produce precision errors.

For example:

```text
0.1 + 0.2
```

may not be represented exactly in binary floating-point.

Financial calculations must therefore use fixed-precision decimal arithmetic.

---

## 6.2 Currency

Every financial record should carry a currency code where appropriate.

Example:

```text
INR
```

The system should use ISO 4217 currency codes.

For the current assignment, the expected currency is:

```text
INR
```

The currency field is retained to make the model extensible.

---

# 7. `users` Table

The `users` table represents affiliate users.

Conceptually:

```sql
users
-----
id
email
name
created_at
updated_at
```

---

## 7.1 Columns

| Column       | Type      | Constraints      | Purpose          |
| ------------ | --------- | ---------------- | ---------------- |
| `id`         | UUID      | PK               | User identifier  |
| `email`      | VARCHAR   | UNIQUE, NOT NULL | User email       |
| `name`       | VARCHAR   | NOT NULL         | User name        |
| `created_at` | TIMESTAMP | NOT NULL         | Creation time    |
| `updated_at` | TIMESTAMP | NOT NULL         | Last update time |

---

## 7.2 Constraints

The database must enforce:

```text
PRIMARY KEY (id)
UNIQUE (email)
```

The email should be normalized before persistence.

---

# 8. `accounts` Table

The `accounts` table represents a user's financial account.

Conceptually:

```sql
accounts
--------
id
user_id
currency
withdrawable_balance
created_at
updated_at
```

---

## 8.1 Columns

| Column                 | Type          | Constraints | Purpose            |
| ---------------------- | ------------- | ----------- | ------------------ |
| `id`                   | UUID          | PK          | Account identifier |
| `user_id`              | UUID          | UNIQUE, FK  | Account owner      |
| `currency`             | CHAR(3)       | NOT NULL    | Currency code      |
| `withdrawable_balance` | NUMERIC(19,4) | NOT NULL    | Balance projection |
| `created_at`           | TIMESTAMP     | NOT NULL    | Creation time      |
| `updated_at`           | TIMESTAMP     | NOT NULL    | Last update time   |

---

## 8.2 One Account Per User

The database must enforce:

```text
UNIQUE(user_id)
```

This guarantees:

```text
User 1
  |
  +---- Account 1
```

and prevents:

```text
User 1
  |
  +---- Account 1
  +---- Account 2
```

---

## 8.3 Balance Projection

The balance is a projection.

Conceptually:

```text
Ledger Entries
      |
      v
Balance Calculation
      |
      v
withdrawable_balance
```

The application must ensure that every balance-changing operation creates the corresponding ledger entry within the same database transaction.

---

## 8.4 Balance Constraint

The account should normally allow a non-negative balance:

```sql
CHECK (withdrawable_balance >= 0)
```

However, the requirements state that rejected advances may create a negative adjustment.

Therefore, the system must explicitly decide whether negative balances are allowed.

For this assignment, the recommended rule is:

> **Do not allow the account balance to become negative.**

If a rejection adjustment exceeds the user's available balance, the adjustment should still be recorded in the ledger, while the account projection becomes `0` and the remaining recovery amount becomes a debt/negative balance tracked separately.

This leads to an important refinement.

---

# 9. Debt / Recovery Consideration

A financial system should not hide a negative balance inside `withdrawable_balance`.

Instead, the account projection can be represented as:

```text
withdrawable_balance
recovery_balance
```

Where:

```text
withdrawable_balance >= 0
recovery_balance >= 0
```

Example:

```text
Current Balance = ₹2

Rejected Sale Recovery = ₹4

Result:

withdrawable_balance = ₹0
recovery_balance     = ₹2
```

Future earnings are applied against the recovery balance.

This is safer than:

```text
withdrawable_balance = -₹2
```

because the system clearly distinguishes:

* Money available to withdraw.
* Money owed to the platform.

The recommended account model therefore becomes:

```text
accounts
--------
id
user_id
currency
withdrawable_balance
recovery_balance
created_at
updated_at
```

Both balances must be derived from ledger activity.

---

# 10. `sales` Table

The `sales` table represents affiliate sales.

Conceptually:

```sql
sales
-----
id
user_id
total_earnings
currency
status
created_at
updated_at
reconciled_at
```

---

## 10.1 Columns

| Column           | Type           | Constraints  | Purpose             |
| ---------------- | -------------- | ------------ | ------------------- |
| `id`             | UUID           | PK           | Sale identifier     |
| `user_id`        | UUID           | FK, NOT NULL | Affiliate owner     |
| `total_earnings` | NUMERIC(19,4)  | NOT NULL     | Total commission    |
| `currency`       | CHAR(3)        | NOT NULL     | Currency            |
| `status`         | ENUM / VARCHAR | NOT NULL     | Sale lifecycle      |
| `created_at`     | TIMESTAMP      | NOT NULL     | Creation time       |
| `updated_at`     | TIMESTAMP      | NOT NULL     | Last update         |
| `reconciled_at`  | TIMESTAMP      | NULL         | Reconciliation time |

---

## 10.2 Sale Status

Valid statuses:

```text
PENDING
APPROVED
REJECTED
```

The database should enforce valid values using either:

```text
PostgreSQL ENUM
```

or:

```text
CHECK constraint
```

For flexibility during future migrations, a `VARCHAR` with a `CHECK` constraint is recommended.

---

## 10.3 Earnings Constraint

The total earnings must be positive or zero depending on the business definition.

Recommended:

```sql
CHECK (total_earnings >= 0)
```

---

# 11. `advance_payouts` Table

The `advance_payouts` table represents the business-level advance payout associated with a sale.

Conceptually:

```sql
advance_payouts
---------------
id
sale_id
amount
currency
status
created_at
updated_at
completed_at
```

---

## 11.1 Columns

| Column         | Type          | Constraints  | Purpose               |
| -------------- | ------------- | ------------ | --------------------- |
| `id`           | UUID          | PK           | Advance identifier    |
| `sale_id`      | UUID          | FK, NOT NULL | Associated sale       |
| `amount`       | NUMERIC(19,4) | NOT NULL     | Advance amount        |
| `currency`     | CHAR(3)       | NOT NULL     | Currency              |
| `status`       | VARCHAR       | NOT NULL     | Advance lifecycle     |
| `created_at`   | TIMESTAMP     | NOT NULL     | Creation time         |
| `updated_at`   | TIMESTAMP     | NOT NULL     | Last update           |
| `completed_at` | TIMESTAMP     | NULL         | Successful completion |

---

# 12. Advance Idempotency

A sale may have only one successful advance.

Therefore, the database must enforce:

```text
At most one SUCCESS advance per sale
```

Conceptually:

```sql
CREATE UNIQUE INDEX
ON advance_payouts(sale_id)
WHERE status = 'SUCCESS';
```

This is a critical financial invariant.

It protects against:

```text
Scheduler A
    |
    +---- SUCCESS


Scheduler B
    |
    +---- SUCCESS
```

Only one can be persisted.

---

## 12.1 Why Not `UNIQUE(sale_id)`?

A sale may have failed attempts or failed advance operations.

Therefore:

```text
sale_id UNIQUE
```

would unnecessarily prevent retry workflows.

The required rule is:

```text
One successful advance
```

not:

```text
One advance record ever
```

Therefore, a partial unique index is preferred.

---

# 13. `withdrawals` Table

The `withdrawals` table represents user-initiated withdrawal operations.

Conceptually:

```sql
withdrawals
-----------
id
user_id
account_id
amount
currency
status
created_at
updated_at
completed_at
```

---

## 13.1 Columns

| Column         | Type          | Constraints | Purpose               |
| -------------- | ------------- | ----------- | --------------------- |
| `id`           | UUID          | PK          | Withdrawal identifier |
| `user_id`      | UUID          | FK          | User                  |
| `account_id`   | UUID          | FK          | Financial account     |
| `amount`       | NUMERIC(19,4) | NOT NULL    | Requested amount      |
| `currency`     | CHAR(3)       | NOT NULL    | Currency              |
| `status`       | VARCHAR       | NOT NULL    | Withdrawal state      |
| `created_at`   | TIMESTAMP     | NOT NULL    | Creation time         |
| `updated_at`   | TIMESTAMP     | NOT NULL    | Last update           |
| `completed_at` | TIMESTAMP     | NULL        | Successful completion |

---

## 13.2 Withdrawal Status

Valid states:

```text
PROCESSING
SUCCESS
FAILED
CANCELLED
REJECTED
```

---

## 13.3 Amount Constraint

A withdrawal must always be positive.

```sql
CHECK (amount > 0)
```

---

# 14. Withdrawal 24-Hour Rule

The rolling 24-hour restriction is primarily a business rule.

The application checks:

```text
Latest eligible withdrawal
```

against:

```text
CURRENT_TIMESTAMP - INTERVAL '24 hours'
```

The exact definition of "eligible withdrawal" must be consistent.

Recommended:

Only successful or actively processing withdrawals count toward the restriction.

Failed, rejected, and cancelled withdrawals do not permanently consume the user's withdrawal allowance.

This allows a failed payout to be retried through the recovery flow.

---

# 15. `payment_attempts` Table

The `payment_attempts` table represents individual interactions with the external payment provider.

Conceptually:

```sql
payment_attempts
----------------
id
operation_type
operation_id
provider
provider_reference
idempotency_key
status
failure_reason
created_at
updated_at
completed_at
```

---

## 15.1 Columns

| Column               | Type      | Constraints | Purpose              |
| -------------------- | --------- | ----------- | -------------------- |
| `id`                 | UUID      | PK          | Attempt identifier   |
| `operation_type`     | VARCHAR   | NOT NULL    | ADVANCE / WITHDRAWAL |
| `operation_id`       | UUID      | NOT NULL    | Parent operation     |
| `provider`           | VARCHAR   | NOT NULL    | Provider name        |
| `provider_reference` | VARCHAR   | UNIQUE      | External reference   |
| `idempotency_key`    | VARCHAR   | UNIQUE      | Request idempotency  |
| `status`             | VARCHAR   | NOT NULL    | Payment status       |
| `failure_reason`     | TEXT      | NULL        | Failure details      |
| `created_at`         | TIMESTAMP | NOT NULL    | Creation time        |
| `updated_at`         | TIMESTAMP | NOT NULL    | Last update          |
| `completed_at`       | TIMESTAMP | NULL        | Completion time      |

---

# 16. Polymorphic Relationship Consideration

The proposed model uses:

```text
operation_type
operation_id
```

This creates a polymorphic relationship.

For example:

```text
operation_type = ADVANCE
operation_id = advance_payout_id
```

or:

```text
operation_type = WITHDRAWAL
operation_id = withdrawal_id
```

The advantage is flexibility.

However, PostgreSQL cannot enforce a normal foreign key across multiple tables for this pattern.

Therefore, this design weakens referential integrity.

---

# 17. Recommended Payment Attempt Design

For a financial system, explicit foreign keys are preferable.

The recommended design is:

```text
payment_attempts
----------------
id
advance_payout_id   NULL
withdrawal_id       NULL
provider
provider_reference
idempotency_key
status
...
```

with:

```sql
CHECK (
    (advance_payout_id IS NOT NULL AND withdrawal_id IS NULL)
    OR
    (advance_payout_id IS NULL AND withdrawal_id IS NOT NULL)
);
```

This guarantees that a payment attempt belongs to exactly one business operation.

It also allows PostgreSQL to enforce foreign keys.

This is the recommended design for this assignment.

---

# 18. Payment Attempt Idempotency

The provider's idempotency key must be unique:

```text
UNIQUE(idempotency_key)
```

This protects against duplicate payment requests.

Example:

```text
Request A
idempotency_key = withdrawal_123_attempt_1


Request B
idempotency_key = withdrawal_123_attempt_1
```

The provider and application should treat both requests as the same logical operation.

---

# 19. Provider Reference

The external provider reference must be unique.

```text
UNIQUE(provider, provider_reference)
```

This prevents the same external payment from being associated with multiple internal payment attempts.

---

# 20. `ledger_entries` Table

The `ledger_entries` table is the authoritative financial history.

Conceptually:

```sql
ledger_entries
--------------
id
account_id
entry_type
amount
currency
reference_type
reference_id
created_at
```

---

## 20.1 Columns

| Column           | Type          | Constraints | Purpose                 |
| ---------------- | ------------- | ----------- | ----------------------- |
| `id`             | UUID          | PK          | Ledger identifier       |
| `account_id`     | UUID          | FK          | Account affected        |
| `entry_type`     | VARCHAR       | NOT NULL    | Financial event type    |
| `amount`         | NUMERIC(19,4) | NOT NULL    | Signed financial amount |
| `currency`       | CHAR(3)       | NOT NULL    | Currency                |
| `reference_type` | VARCHAR       | NOT NULL    | Source entity           |
| `reference_id`   | UUID          | NOT NULL    | Source operation        |
| `created_at`     | TIMESTAMP     | NOT NULL    | Creation time           |

---

# 21. Ledger Entry Types

Valid types:

```text
ADVANCE
SETTLEMENT
REJECTION_ADJUSTMENT
WITHDRAWAL
WITHDRAWAL_RECOVERY
```

---

# 22. Ledger Amount Sign Convention

The amount is signed.

Positive:

```text
+₹100
```

means money is credited.

Negative:

```text
-₹100
```

means money is debited.

Examples:

```text
ADVANCE
+₹4
```

```text
SETTLEMENT
+₹36
```

```text
REJECTION_ADJUSTMENT
-₹4
```

```text
WITHDRAWAL
-₹500
```

```text
WITHDRAWAL_RECOVERY
+₹500
```

---

# 23. Ledger Immutability

The application must never:

```text
UPDATE ledger_entries
DELETE FROM ledger_entries
```

Existing financial history must remain unchanged.

Corrections must be represented by new entries.

Example:

```text
ADVANCE
+₹4

REJECTION_ADJUSTMENT
-₹4
```

The database user used by the application should ideally have restricted permissions that prevent accidental updates or deletes to ledger history.

---

# 24. Ledger Idempotency

Every financial operation must have a unique business reference.

For example:

```text
Sale 123 Advance
```

should create:

```text
reference_type = SALE_ADVANCE
reference_id   = sale_123
```

A unique constraint can then guarantee:

```text
One Advance Ledger Entry Per Sale
```

Similarly:

```text
Sale 123 Final Settlement
```

must have a unique reference.

For example:

```text
SALE_SETTLEMENT
sale_123
```

---

# 25. Recommended Ledger Reference Model

Instead of relying only on:

```text
reference_type
reference_id
```

the database should enforce idempotency through dedicated nullable foreign keys where possible.

For example:

```text
ledger_entries
--------------
id
account_id
entry_type

sale_id
withdrawal_id
advance_payout_id

amount
currency
created_at
```

The system can then enforce business-specific uniqueness.

Examples:

```text
One ADVANCE per advance payout
One SETTLEMENT per sale
One REJECTION_ADJUSTMENT per sale
One WITHDRAWAL per withdrawal
One WITHDRAWAL_RECOVERY per withdrawal
```

This is preferable because PostgreSQL can enforce actual foreign keys.

---

# 26. Ledger Idempotency Constraints

Recommended unique indexes:

```text
ADVANCE
Unique advance_payout_id


SETTLEMENT
Unique sale_id


REJECTION_ADJUSTMENT
Unique sale_id


WITHDRAWAL
Unique withdrawal_id


WITHDRAWAL_RECOVERY
Unique withdrawal_id
```

These should be implemented as partial unique indexes.

Conceptually:

```sql
CREATE UNIQUE INDEX
ON ledger_entries(advance_payout_id)
WHERE entry_type = 'ADVANCE';
```

And similarly for other entry types.

This guarantees exact-once financial effects even if the application retries.

---

# 27. Reconciliation Idempotency

A sale can only be reconciled once.

The database should protect this using the sale status and transaction locking.

The reconciliation transaction should:

```text
BEGIN

SELECT sale
FOR UPDATE

Verify status = PENDING

Create financial entry

Update sale status

COMMIT
```

The unique ledger constraint provides an additional safety net.

---

# 28. Withdrawal Recovery Idempotency

A failed withdrawal may receive:

```text
Webhook A
Webhook B
Webhook C
```

all representing the same failure.

The recovery process must create:

```text
One Recovery Ledger Entry
```

only.

The database should enforce:

```text
UNIQUE(withdrawal_id)
WHERE entry_type = 'WITHDRAWAL_RECOVERY'
```

The first recovery succeeds.

Subsequent attempts become no-ops.

---

# 29. Index Strategy

Indexes should support the application's most common queries.

Recommended indexes include:

```text
sales(status, created_at)
sales(user_id, status)

advance_payouts(sale_id)

withdrawals(user_id, created_at DESC)
withdrawals(account_id, created_at DESC)

payment_attempts(provider_reference)
payment_attempts(idempotency_key)

ledger_entries(account_id, created_at DESC)
ledger_entries(reference_id)

```

---

# 30. Scheduler Query Index

The scheduler frequently queries:

```text
PENDING sales
```

Therefore:

```text
INDEX ON sales(status, created_at)
```

is recommended.

A partial index may be more efficient:

```sql
CREATE INDEX
ON sales(created_at)
WHERE status = 'PENDING';
```

This keeps the index focused on active pending sales.

---

# 31. Withdrawal 24-Hour Query Index

The system frequently needs the latest withdrawal for a user.

Recommended:

```text
INDEX ON withdrawals(user_id, created_at DESC)
```

This allows efficient lookup of the most recent withdrawal.

---

# 32. Ledger Query Index

User transaction history should be retrieved efficiently.

Recommended:

```text
INDEX ON ledger_entries(account_id, created_at DESC)
```

This supports:

```text
Get account statement
```

without scanning the entire ledger.

---

# 33. Account Locking

Withdrawal creation must lock the account row.

Conceptually:

```sql
SELECT *
FROM accounts
WHERE id = $1
FOR UPDATE;
```

This guarantees that concurrent withdrawal transactions cannot simultaneously modify the same account balance.

Example:

```text
Balance = ₹500

Transaction A
    |
    +---- Lock Account
    +---- Withdraw ₹400


Transaction B
    |
    +---- Wait
```

After Transaction A commits:

```text
Balance = ₹100
```

Transaction B then reads the latest balance.

---

# 34. Sale Locking

Reconciliation must lock the sale row.

Conceptually:

```sql
SELECT *
FROM sales
WHERE id = $1
FOR UPDATE;
```

This prevents:

```text
Admin A → APPROVE
Admin B → REJECT
```

from both successfully reconciling the same sale.

---

# 35. Withdrawal Transaction

The withdrawal transaction should conceptually perform:

```text
BEGIN

1. Lock Account

2. Validate Balance

3. Validate 24-Hour Rule

4. Create Withdrawal

5. Create WITHDRAWAL Ledger Entry

6. Decrease withdrawable_balance

7. COMMIT
```

Only after the transaction commits should the external payment process proceed.

---

# 36. Withdrawal Payment Failure

If the provider reports:

```text
FAILED
CANCELLED
REJECTED
```

the recovery transaction performs:

```text
BEGIN

1. Lock Withdrawal

2. Verify terminal failure state

3. Check recovery already exists

4. Create WITHDRAWAL_RECOVERY ledger entry

5. Restore balance / reduce recovery debt

6. Mark recovery processed

7. COMMIT
```

The recovery must be atomic.

---

# 37. Reconciliation Transaction

For an approved sale:

```text
BEGIN

1. Lock Sale

2. Verify PENDING

3. Lock relevant financial state

4. Determine successful advance

5. Calculate:
   total_earnings - advance_paid

6. Create SETTLEMENT ledger entry

7. Update balance projection

8. Update Sale → APPROVED

9. COMMIT
```

For a rejected sale:

```text
BEGIN

1. Lock Sale

2. Verify PENDING

3. Determine successful advance

4. Calculate:
   -advance_paid

5. Create REJECTION_ADJUSTMENT

6. Apply recovery

7. Update Sale → REJECTED

8. COMMIT
```

---

# 38. Handling Recovery Debt

If the system uses:

```text
withdrawable_balance
recovery_balance
```

then a rejected sale is processed as:

```text
Recovery Amount = Advance Paid
```

If:

```text
withdrawable_balance >= Recovery Amount
```

then:

```text
withdrawable_balance -= Recovery Amount
```

Otherwise:

```text
Recovery Remaining =
Recovery Amount - withdrawable_balance

withdrawable_balance = 0

recovery_balance += Recovery Remaining
```

Future earnings first reduce:

```text
recovery_balance
```

before increasing:

```text
withdrawable_balance
```

This rule must be implemented consistently across all financial credit operations.

---

# 39. Currency Consistency

An account must not receive ledger entries in a different currency.

The application must validate:

```text
Ledger Currency
      =
Account Currency
```

A database-level composite relationship or application validation should enforce this.

For the current system:

```text
Account Currency = INR
```

Therefore, all current ledger entries should be:

```text
INR
```

---

# 40. Timestamps

All timestamps should be stored in UTC.

Recommended PostgreSQL type:

```text
TIMESTAMPTZ
```

Examples:

```text
created_at
updated_at
completed_at
reconciled_at
```

The application converts timestamps to local time only for presentation.

---

# 41. Audit Fields

Core business tables should include:

```text
created_at
updated_at
```

Where relevant:

```text
completed_at
reconciled_at
```

For administrative reconciliation, the system should also record:

```text
reconciled_by
```

This provides auditability.

---

# 42. Administrative Audit

The `sales` table may contain:

```text
reconciled_by
reconciled_at
```

where:

```text
reconciled_by → users.id
```

if administrators are represented in the same identity system.

Alternatively, a separate audit table can be introduced.

For this assignment, storing the administrator reference directly is sufficient unless a broader audit framework is required.

---

# 43. Database Transaction Isolation

The default PostgreSQL isolation level:

```text
READ COMMITTED
```

is sufficient for most operations when combined with explicit row locking.

Critical operations use:

```sql
SELECT ... FOR UPDATE
```

rather than relying solely on isolation level.

The system does not need `SERIALIZABLE` isolation globally because it would increase transaction conflicts and retries unnecessarily.

---

# 44. Deadlock Considerations

When transactions lock multiple resources, lock order must remain consistent.

For example:

```text
Account
    |
    v
Sale
```

should always be locked in the same order wherever both are required.

The system should avoid:

```text
Transaction A:
Lock Account
Lock Sale


Transaction B:
Lock Sale
Lock Account
```

This can produce a deadlock.

The application must establish a consistent lock ordering policy.

---

# 45. Migration Strategy

Database changes should be managed through versioned migrations.

Example:

```text
migrations/
├── 001_create_users.sql
├── 002_create_accounts.sql
├── 003_create_sales.sql
├── 004_create_advance_payouts.sql
├── 005_create_withdrawals.sql
├── 006_create_payment_attempts.sql
├── 007_create_ledger_entries.sql
└── 008_add_indexes_and_constraints.sql
```

Migrations should be:

* Version controlled
* Repeatable in deployment environments
* Reviewed through pull requests
* Tested before production deployment

---

# 46. Migration Order

The recommended creation order is:

```text
1. users
       |
       v
2. accounts
       |
       v
3. sales
       |
       v
4. advance_payouts
       |
       +----------------+
       |                |
       v                v
5. withdrawals    6. payment_attempts
       |
       v
7. ledger_entries
       |
       v
8. indexes
       |
       v
9. unique constraints
```

Foreign key dependencies must be respected.

---

# 47. Database-Level Financial Invariants

The database should enforce:

```text
1. Every user has a unique identity.

2. A user has at most one account.

3. Every sale belongs to a valid user.

4. A sale has a valid lifecycle status.

5. A sale can have at most one successful advance.

6. Every withdrawal has a positive amount.

7. Payment idempotency keys are unique.

8. Provider references are unique.

9. Every ledger entry belongs to a valid account.

10. Ledger entries cannot be updated or deleted by application logic.

11. A sale can have only one settlement ledger entry.

12. A sale can have only one rejection adjustment.

13. A withdrawal can have only one withdrawal ledger entry.

14. A withdrawal can have only one recovery ledger entry.

15. Financial operations use fixed-precision numeric values.
```

---

# 48. Recommended Final Schema

The conceptual schema is:

```text
users
-----
id PK
email UNIQUE
name
created_at
updated_at


accounts
--------
id PK
user_id FK UNIQUE
currency
withdrawable_balance
recovery_balance
created_at
updated_at


sales
-----
id PK
user_id FK
total_earnings
currency
status
reconciled_by FK
reconciled_at
created_at
updated_at


advance_payouts
---------------
id PK
sale_id FK
amount
currency
status
created_at
updated_at
completed_at


withdrawals
-----------
id PK
user_id FK
account_id FK
amount
currency
status
created_at
updated_at
completed_at


payment_attempts
----------------
id PK
advance_payout_id FK NULL
withdrawal_id FK NULL
provider
provider_reference UNIQUE
idempotency_key UNIQUE
status
failure_reason
created_at
updated_at
completed_at


ledger_entries
--------------
id PK
account_id FK
entry_type
amount
currency
advance_payout_id FK NULL
sale_id FK NULL
withdrawal_id FK NULL
created_at
```

---

# 49. Final Database Architecture

The financial model is:

```text
                         BUSINESS OPERATIONS
                                |
              +-----------------+----------------+
              |                 |                |
              v                 v                v
           Sale         Advance Payout       Withdrawal
              |                 |                |
              |                 v                |
              |          Payment Attempt         |
              |                                  |
              +----------------+-----------------+
                               |
                               v
                        Ledger Entry
                               |
                               v
                         Account State
                               |
                +--------------+--------------+
                |                             |
                v                             v
      Withdrawable Balance             Recovery Balance
```

The ledger remains the historical source of truth.

The account balances remain optimized projections.

All financial changes must be represented through immutable ledger entries and corresponding atomic balance projection updates.

---

# 50. Final Design Decision

The recommended database architecture is:

```text
PostgreSQL
    |
    +---- Strong Foreign Keys
    |
    +---- Fixed Precision Money
    |
    +---- Append-Only Ledger
    |
    +---- Balance Projection
    |
    +---- Partial Unique Indexes
    |
    +---- Row-Level Locking
    |
    +---- ACID Transactions
    |
    +---- Idempotency Constraints
    |
    +---- Versioned Migrations
```

The database is therefore not merely a persistence layer.

It is an active participant in enforcing financial correctness.

The application layer defines business workflows.

The database guarantees that critical invariants cannot be violated under concurrent execution.

```text
Application Logic
       |
       v
Business Decisions
       |
       v
Database Transaction
       |
       +---- Constraints
       +---- Locks
       +---- Unique Indexes
       +---- Foreign Keys
       |
       v
Consistent Financial State
```

This design provides the persistence foundation required to safely implement the payout system under **concurrent requests, duplicate jobs, provider retries, webhook duplication, application crashes, and financial reconciliation**.
    