# Domain Model

## 1. Purpose

This document defines the core domain model for the User Payout Management System.

The domain model identifies:

* Core business entities
* Responsibilities of each entity
* Relationships between entities
* Entity lifecycles
* Domain invariants
* Financial ownership
* State transitions

The domain model is independent of the database and API implementation.

---

# 2. Domain Overview

The system manages the relationship between:

```text
User
  |
  +---- generates ----> Sales
  |
  +---- owns ---------> Account
  |                       |
  |                       +---- contains financial history
  |                              through Ledger Entries
  |
  +---- initiates ----> Withdrawals
```

Sales may generate payouts:

```text
Sale
  |
  +---- may receive ----> Advance Payout
  |
  +---- eventually -----> Reconciliation
                              |
                    +---------+---------+
                    |                   |
                    v                   v
                APPROVED             REJECTED
                    |                   |
                    v                   v
              Settlement         Negative Adjustment
```

External financial operations are handled through payment attempts:

```text
Advance Payout
      |
      +---- Payment Attempts

Withdrawal
      |
      +---- Payment Attempts
```

The complete domain can be represented as:

```text
                              +------+
                              | User |
                              +--+---+
                                 |
                   +-------------+-------------+
                   |                           |
                   v                           v
                +------+                  +---------+
                | Sale |                  | Account |
                +--+---+                  +----+----+
                   |                           |
          +--------+--------+                  |
          |                 |                  |
          v                 v                  v
   Advance Payout     Reconciliation     Ledger Entry
          |                 |
          v                 |
   Payment Attempt          |
                            |
                   Settlement / Adjustment

                +-------------+
                | Withdrawal  |
                +------+------+
                       |
                       v
                Payment Attempt
```

---

# 3. Core Domain Entities

The core entities are:

1. User
2. Account
3. Sale
4. Advance Payout
5. Withdrawal
6. Payment Attempt
7. Ledger Entry

These entities represent different business concepts and should not be merged into a single generic transaction model.

---

# 4. User

## 4.1 Definition

A `User` represents an affiliate partner who generates sales and earns commissions.

The user is the primary owner of:

* Sales
* Financial account
* Withdrawals

---

## 4.2 Responsibilities

The User domain concept is responsible for establishing ownership relationships.

A user:

* Owns affiliate sales.
* Owns one financial account.
* Initiates withdrawals.
* Receives financial earnings through the payout process.

The user itself does not directly manipulate ledger entries or account balances.

Financial changes must occur through domain operations.

---

## 4.3 Relationships

```text
User
 |
 +---- 1 Account
 |
 +---- N Sales
 |
 +---- N Withdrawals
```

A user has exactly one account in the current domain model.

---

# 5. Account

## 5.1 Definition

An `Account` represents the user's financial account within the payout system.

It is the financial container associated with a user.

The account maintains a representation of the amount currently available for withdrawal.

---

## 5.2 Responsibilities

The Account is responsible for:

* Owning financial ledger entries.
* Representing the user's withdrawable balance.
* Participating in fund reservation.
* Preventing invalid withdrawals.
* Maintaining financial consistency with ledger operations.

---

## 5.3 Financial Source of Truth

The account balance is a **projection of financial activity**.

The immutable ledger is the authoritative financial history.

Conceptually:

```text
Financial Events
      |
      v
Ledger Entries
      |
      v
Account Balance Projection
```

The account balance must never be treated as an independent source of financial truth.

---

## 5.4 Balance Invariant

The account must not allow a withdrawal that exceeds the amount available for withdrawal.

Example:

```text
Available Balance = ₹500
Withdrawal        = ₹600

Result:
Withdrawal rejected
```

The account must also support the financial effects of:

* Advance credits
* Settlement credits
* Rejection adjustments
* Withdrawal debits
* Withdrawal recovery credits

---

## 5.5 Negative Balance

A rejected sale may require recovery of an advance that has already been paid.

If the adjustment exceeds the user's current positive balance, the account may temporarily become negative.

Example:

```text
Current Balance = ₹2
Recovery        = -₹4

New Balance     = -₹2
```

Future earnings offset the negative balance before the user can withdraw those funds.

This is an explicit domain assumption for the current system.

---

# 6. Sale

## 6.1 Definition

A `Sale` represents an affiliate commission generated from a user's successful affiliate activity.

A sale contains the expected earning associated with the transaction.

The sale starts in an unresolved state and is later reconciled by an administrator.

---

## 6.2 Responsibilities

The Sale is responsible for:

* Representing the affiliate earning opportunity.
* Maintaining its reconciliation state.
* Providing the total earning amount used in payout calculations.
* Being associated with exactly one affiliate user.

The Sale does not directly manage money.

Financial consequences of a sale are represented through payout and ledger operations.

---

## 6.3 Lifecycle

The sale lifecycle is:

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

---

## 6.4 PENDING

A `PENDING` sale represents a sale whose final commission outcome has not yet been determined.

A pending sale:

* Is eligible for advance payout processing.
* Has not yet been finally reconciled.
* May become approved or rejected.

---

## 6.5 APPROVED

An `APPROVED` sale represents a sale for which the user is entitled to the full commission.

The final settlement is:

```text
Total Earnings - Successful Advance Paid
```

Example:

```text
Total Earnings = ₹40
Advance Paid   = ₹4

Final Settlement = ₹36
```

---

## 6.6 REJECTED

A `REJECTED` sale represents a sale for which the user is no longer entitled to the commission.

Possible real-world causes include:

* Product return
* Order cancellation
* Invalidated commission

If an advance was already paid, the system creates a negative adjustment.

```text
Adjustment = -Successful Advance Paid
```

---

## 6.7 Sale Invariants

A Sale must satisfy the following invariants:

1. Every sale starts as `PENDING`.
2. A sale can transition from `PENDING` to `APPROVED`.
3. A sale can transition from `PENDING` to `REJECTED`.
4. An `APPROVED` sale cannot return to `PENDING`.
5. A `REJECTED` sale cannot return to `PENDING`.
6. A sale can be reconciled only once.
7. A sale can have at most one successful advance payout.
8. Reconciliation must not create duplicate final financial adjustments.

---

# 7. Advance Payout

## 7.1 Definition

An `Advance Payout` represents the early payout process associated with a pending sale.

The advance is calculated as:

```text
Advance = 10% × Sale Earnings
```

Example:

```text
Sale Earnings = ₹40
Advance       = ₹4
```

---

## 7.2 Responsibilities

The Advance Payout concept is responsible for:

* Determining the advance amount.
* Tracking the advance payout lifecycle.
* Coordinating external payment attempts.
* Ensuring that only one successful advance exists for a sale.

---

## 7.3 Relationship With Sale

An advance payout belongs to a specific sale.

Conceptually:

```text
Sale
 |
 +---- Advance Payout
```

A sale may experience multiple payment attempts before success:

```text
Sale
 |
 +---- Advance Payout
          |
          +---- Payment Attempt 1 → FAILED
          |
          +---- Payment Attempt 2 → SUCCESS
```

The important distinction is:

```text
Advance Payout
        ≠
Payment Attempt
```

The payout is the business operation.

The payment attempt represents one interaction with the external provider.

---

## 7.4 Advance Payout Lifecycle

The advance payout lifecycle is:

```text
             +------------+
             | PROCESSING |
             +------+-----+
                    |
              +-----+-----+
              |           |
              v           v
          +-------+   +--------+
          |FAILED |   |SUCCESS |
          +-------+   +--------+
```

A failed attempt may be retried.

Once the advance payout succeeds:

```text
SUCCESS
```

no additional successful advance may be created for the same sale.

---

## 7.5 Advance Invariants

1. Only a `PENDING` sale is eligible for an advance.
2. Advance amount is 10% of sale earnings.
3. A sale can have at most one successful advance.
4. Multiple failed payment attempts may exist.
5. A successful advance must produce exactly one corresponding financial credit.
6. Repeated scheduler execution must not create duplicate successful advances.

---

# 8. Withdrawal

## 8.1 Definition

A `Withdrawal` represents a user's request to transfer available funds from the platform to an external payment destination.

A withdrawal is a business-level financial operation.

It is separate from the external provider payment attempts used to execute it.

---

## 8.2 Responsibilities

The Withdrawal is responsible for:

* Representing the user's withdrawal request.
* Tracking the withdrawal lifecycle.
* Enforcing withdrawal eligibility.
* Tracking the requested amount.
* Coordinating external payment processing.
* Supporting failed payout recovery.

---

## 8.3 Withdrawal Lifecycle

The withdrawal lifecycle is:

```text
             +------------+
             | PROCESSING |
             +------+-----+
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
    +-------+  +----------+  +----------+
    |SUCCESS|  |  FAILED  |  |CANCELLED |
    +-------+  +----------+  +----------+
                           |
                           |
                       +---+---+
                       |REJECTED|
                       +-------+
```

The exact transition from `PROCESSING` to a terminal state is determined by the payment provider result.

---

## 8.4 Withdrawal Invariants

1. Withdrawal amount must be greater than zero.
2. Withdrawal cannot exceed available funds.
3. A user cannot create another withdrawal while restricted by the rolling 24-hour rule.
4. A `PROCESSING` withdrawal is considered active.
5. Concurrent withdrawals must not overspend the account.
6. A failed withdrawal must be recoverable.
7. A withdrawal can be recovered at most once.
8. Recovery restores the withdrawn amount exactly once.
9. Recovered funds can be withdrawn again.

---

# 9. Payment Attempt

## 9.1 Definition

A `Payment Attempt` represents one interaction between the application and the external payment provider.

It is an execution-level concept rather than a business-level financial transaction.

---

## 9.2 Purpose

Separating payment attempts from business operations allows the system to handle:

* Provider failures
* Network timeouts
* Retries
* Duplicate requests
* Provider status updates

without creating duplicate business transactions.

---

## 9.3 Relationships

A Payment Attempt belongs to either:

```text
Advance Payout
```

or:

```text
Withdrawal
```

Conceptually:

```text
Advance Payout
      |
      +---- Payment Attempt 1
      |
      +---- Payment Attempt 2
      |
      +---- Payment Attempt 3
```

or:

```text
Withdrawal
      |
      +---- Payment Attempt 1
      |
      +---- Payment Attempt 2
```

---

## 9.4 Payment Attempt Lifecycle

```text
             +------------+
             | PROCESSING |
             +------+-----+
                    |
       +------------+------------+
       |            |            |
       v            v            v
   +-------+    +--------+   +----------+
   |SUCCESS|    | FAILED |   |CANCELLED |
   +-------+    +--------+   +----------+
                     |
                     v
                 +--------+
                 |REJECTED|
                 +--------+
```

The provider-specific lifecycle may vary, but the application normalizes external statuses into domain-level statuses.

---

## 9.5 Important Distinction

A payment attempt is not itself the financial source of truth.

For example:

```text
Payment Attempt
SUCCESS
```

does not automatically mean the system has correctly completed the business operation.

The application must perform the required transactional financial operation, such as:

```text
Payment Success
      |
      v
Ledger Entry
      +
Balance Projection
```

This distinction prevents external provider state from being confused with internal financial state.

---

# 10. Ledger Entry

## 10.1 Definition

A `Ledger Entry` represents an immutable financial movement affecting a user's account.

It is the primary source of financial history.

---

## 10.2 Responsibilities

The Ledger Entry provides:

* Financial audit history.
* Transaction traceability.
* Immutable records.
* Support for compensating transactions.
* Reconstruction of financial activity.

---

## 10.3 Ledger Entry Types

The current domain defines the following transaction types:

```text
ADVANCE
SETTLEMENT
REJECTION_ADJUSTMENT
WITHDRAWAL
WITHDRAWAL_RECOVERY
```

---

## 10.4 Financial Direction

Positive amounts increase the user's financial balance.

Negative amounts decrease the user's financial balance.

Example:

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

## 10.5 Append-Only Principle

Ledger entries are immutable.

The system must never modify or delete a historical financial entry.

Corrections are represented through compensating entries.

Example:

```text
Original:

ADVANCE
+₹4
```

After sale rejection:

```text
ADVANCE
+₹4

REJECTION_ADJUSTMENT
-₹4
```

This preserves the complete financial history.

---

## 10.6 Ledger Invariants

1. Ledger entries are immutable.
2. Ledger entries are append-only.
3. Every financial movement must have a corresponding ledger entry.
4. Existing financial history must never be deleted or modified.
5. Corrections must be represented through compensating entries.
6. Each ledger entry must be traceable to its originating business operation.

---

# 11. Domain Relationships

The primary domain relationships are:

```text
User
 |
 +---- 1:1 ---- Account
 |
 +---- 1:N ---- Sale
 |
 +---- 1:N ---- Withdrawal
```

```text
Sale
 |
 +---- 1:N ---- Advance Payout
```

```text
Advance Payout
 |
 +---- 1:N ---- Payment Attempt
```

```text
Withdrawal
 |
 +---- 1:N ---- Payment Attempt
```

```text
Account
 |
 +---- 1:N ---- Ledger Entry
```

The complete relationship model is:

```text
                            +------+
                            | User |
                            +--+---+
                               |
                +--------------+--------------+
                |              |              |
                v              v              v
             +------+      +---------+    +------------+
             | Sale |      | Account |    | Withdrawal |
             +--+---+      +----+----+    +-----+------+
                |               |               |
                |               |               |
                v               v               v
         +-------------+  +------------+  +---------------+
         |AdvancePayout|  |LedgerEntry |  |PaymentAttempt |
         +------+------+  +------------+  +---------------+
                |
                |
                +------------------------+
                                         |
                                         v
                                  Payment Attempt
```

---

# 12. Domain Service Responsibilities

Some business operations span multiple entities and therefore should be represented as domain/application services rather than being owned by a single entity.

## 12.1 Advance Payout Service

Responsible for:

* Finding eligible sales.
* Calculating advance amounts.
* Coordinating advance payout processing.
* Ensuring advance idempotency.

---

## 12.2 Reconciliation Service

Responsible for:

* Reconciling pending sales.
* Calculating settlement amounts.
* Calculating rejection adjustments.
* Creating corresponding financial movements.

---

## 12.3 Withdrawal Service

Responsible for:

* Validating withdrawal eligibility.
* Enforcing the rolling 24-hour rule.
* Reserving available funds.
* Initiating external payout processing.

---

## 12.4 Recovery Service

Responsible for:

* Processing failed payout notifications.
* Determining whether recovery is required.
* Creating recovery ledger entries.
* Restoring recovered funds exactly once.

---

# 13. Domain State Transitions

## Sale

```text
PENDING
   |
   +---- APPROVED
   |
   +---- REJECTED
```

---

## Advance Payout

```text
PROCESSING
   |
   +---- SUCCESS
   |
   +---- FAILED
```

---

## Withdrawal

```text
PROCESSING
   |
   +---- SUCCESS
   |
   +---- FAILED
   |
   +---- CANCELLED
   |
   +---- REJECTED
```

---

## Payment Attempt

```text
PROCESSING
   |
   +---- SUCCESS
   |
   +---- FAILED
   |
   +---- CANCELLED
   |
   +---- REJECTED
```

---

# 14. Core Domain Invariants

The following invariants must always hold:

### Sale

```text
One sale
    |
    +---- At most one successful advance
    |
    +---- Exactly zero or one reconciliation
```

### Financial History

```text
Ledger
    |
    +---- Immutable
    |
    +---- Append-only
    |
    +---- Auditable
```

### Withdrawal

```text
Withdrawal
    |
    +---- Cannot exceed available balance
    |
    +---- Subject to 24-hour restriction
    |
    +---- Cannot overspend under concurrency
```

### Recovery

```text
Failed Withdrawal
       |
       +---- At most one recovery
       |
       +---- Exact amount restored
```

### Consistency

```text
Financial Operation
       |
       +---- Ledger Entry
       |
       +---- Balance Projection
       |
       +---- Atomic Transaction
```

---

# 15. Domain Model Summary

The domain separates **business concepts** from **execution mechanisms**.

```text
Business Concepts
-----------------

User
Account
Sale
Advance Payout
Withdrawal
Ledger Entry


Execution Concepts
------------------

Payment Attempt
Scheduler
Payment Provider
```

The most important design distinction is:

```text
Business Operation
       |
       v
Advance Payout / Withdrawal
       |
       v
Payment Attempt
       |
       v
External Provider
```

while financial truth is maintained through:

```text
Business Operation
       |
       v
Ledger Entry
       |
       v
Account Balance Projection
```

This separation allows the system to safely handle external failures, retries, duplicate events, and concurrent operations without corrupting financial history.
