# Testing Strategy

## 1. Purpose

This document defines the testing strategy for the User Payout Management System.

The system handles financial transactions involving:

* Affiliate earnings
* Advance payouts
* Final settlements
* Rejection adjustments
* User withdrawals
* Payment-provider transactions
* Failed payout recovery

Because the system handles money, testing must focus primarily on **financial correctness, consistency, idempotency, concurrency safety, and failure recovery**.

The objective is not only to verify that the system works during normal execution.

The system must also remain correct when:

* The same request is submitted multiple times.
* Two requests execute simultaneously.
* Background workers retry jobs.
* Webhooks are delivered repeatedly.
* The payment provider times out.
* The application crashes during processing.
* Database transactions fail.
* External systems return unexpected results.

The fundamental testing principle is:

> A financial operation is considered correct only when its financial effect remains correct regardless of retries, duplicate messages, concurrency, or recoverable failures.

---

# 2. Testing Principles

## 2.1 Test Business Invariants

Tests must verify the rules that must always remain true.

Examples:

```text
A sale receives at most one advance payout.
```

```text
A sale can be reconciled only once.
```

```text
A withdrawal cannot spend more than the user's available funds.
```

```text
A failed withdrawal can be recovered exactly once.
```

```text
A provider timeout must not automatically trigger recovery.
```

```text
A user's withdrawable balance must never become negative.
```

These invariants are more important than testing individual implementation details.

---

## 2.2 Test at Multiple Levels

The testing pyramid is:

```text
             E2E Tests
                ▲
                │
       Integration Tests
                ▲
                │
         Domain Tests
                ▲
                │
          Unit Tests
```

Each layer has a different responsibility.

---

## 2.3 Prefer Deterministic Tests

Financial tests should avoid unnecessary timing dependencies.

Avoid tests that depend on:

```text
setTimeout()
sleep()
arbitrary delays
```

Prefer:

```text
explicit synchronization
database transactions
controlled test doubles
deterministic clocks
```

---

## 2.4 Test the Database as Part of the System

The database is not simply a persistence mechanism.

It actively protects financial invariants through:

* Unique constraints
* Foreign keys
* Check constraints
* Transactions
* Row-level locking

Therefore, database integration tests are mandatory.

---

# 3. Testing Layers

The system will use the following testing layers:

```text
1. Static Analysis
2. Unit Tests
3. Domain Tests
4. Repository Tests
5. Integration Tests
6. Concurrency Tests
7. Idempotency Tests
8. Failure Recovery Tests
9. API Tests
10. Security Tests
11. End-to-End Tests
12. Deployment Verification
```

---

# 4. Static Analysis

## Objective

Catch errors before runtime.

The CI pipeline should run:

```text
Lint
Type Check
Format Check
Build
```

Example:

```text
npm run lint
npm run typecheck
npm run format:check
npm run build
```

All checks must pass before merging code.

---

# 5. Unit Testing

## Objective

Test isolated business logic without infrastructure dependencies.

Unit tests should cover:

* Money calculations
* Advance payout calculation
* Final settlement calculation
* Rejection adjustment calculation
* Balance projection logic
* State transition validation
* Withdrawal eligibility
* 24-hour withdrawal rule
* Recovery calculation
* Provider status mapping

---

# 6. Money Calculation Tests

The money calculation logic must be tested independently.

## Advance Calculation

Given:

```text
Total Earnings = ₹100
```

Expected:

```text
Advance = ₹10
```

Given:

```text
Total Earnings = ₹40
```

Expected:

```text
Advance = ₹4
```

The implementation must never use floating-point arithmetic that can introduce financial precision errors.

---

# 7. Settlement Calculation Tests

For an approved sale:

```text
Total Earnings = ₹40
Advance Paid = ₹4
```

Expected:

```text
Final Settlement = ₹36
```

For a rejected sale:

```text
Total Earnings = ₹40
Advance Paid = ₹4
```

Expected:

```text
Final Adjustment = -₹4
```

Tests must also cover:

```text
Zero advance
Full advance
Decimal amounts
Smallest supported currency unit
Large monetary values
```

---

# 8. Account Projection Tests

The account projection logic must be tested independently.

## 8.1 Credit With No Recovery Debt

Initial:

```text
Withdrawable = ₹0
Recovery = ₹0
```

Credit:

```text
+₹100
```

Expected:

```text
Withdrawable = ₹100
Recovery = ₹0
```

---

## 8.2 Credit With Recovery Debt

Initial:

```text
Withdrawable = ₹0
Recovery = ₹40
```

Credit:

```text
+₹100
```

Expected:

```text
Withdrawable = ₹60
Recovery = ₹0
```

---

## 8.3 Credit Smaller Than Recovery Debt

Initial:

```text
Withdrawable = ₹0
Recovery = ₹100
```

Credit:

```text
+₹40
```

Expected:

```text
Withdrawable = ₹0
Recovery = ₹60
```

---

## 8.4 Debit With Sufficient Balance

Initial:

```text
Withdrawable = ₹100
Recovery = ₹0
```

Debit:

```text
-₹40
```

Expected:

```text
Withdrawable = ₹60
Recovery = ₹0
```

---

## 8.5 Debit Larger Than Balance

Initial:

```text
Withdrawable = ₹20
Recovery = ₹0
```

Debit:

```text
-₹40
```

Expected:

```text
Withdrawable = ₹0
Recovery = ₹20
```

---

# 9. Domain State Transition Tests

Every domain state machine must be tested.

## Sale

Valid:

```text
PENDING → APPROVED
PENDING → REJECTED
```

Invalid:

```text
APPROVED → REJECTED
REJECTED → APPROVED
APPROVED → APPROVED
REJECTED → REJECTED
```

---

## Withdrawal

The exact allowed state transitions must follow:

```text
docs/06-state-machines.md
```

Tests must reject invalid transitions.

---

## Payment Attempt

Tests must verify that:

* Successful payments cannot be marked failed later without an explicit reconciliation rule.
* Failed payments cannot be recovered twice.
* Processing payments remain unresolved when the outcome is unknown.

---

# 10. Repository Tests

Repository tests verify persistence behavior.

The repository layer must be tested against a real PostgreSQL database or a production-equivalent test database.

Tests must cover:

* Insert
* Update
* Find
* Locking
* Transactions
* Unique constraints
* Foreign keys
* Check constraints

Mocks alone are not sufficient for these tests.

---

# 11. Database Constraint Tests

The database must reject invalid states directly.

Tests must verify:

### Duplicate Advance

Attempt:

```text
Sale A → Advance
Sale A → Advance
```

Expected:

```text
Database rejects second advance
```

---

### Duplicate Recovery

Attempt:

```text
Withdrawal A → Recovery
Withdrawal A → Recovery
```

Expected:

```text
Database rejects second recovery
```

---

### Negative Withdrawable Balance

Attempt:

```text
withdrawable_balance = -₹1
```

Expected:

```text
Database rejects operation
```

---

### Invalid Foreign Key

Attempt to create a ledger entry referencing a non-existent entity.

Expected:

```text
Database rejects operation
```

---

# 12. Transaction Tests

Financial workflows must be atomic.

## Successful Transaction

Expected:

```text
Ledger Entry Created
+
Account Projection Updated
```

Both changes must be committed.

---

## Failed Transaction

If the projection update fails:

```text
Ledger Entry
```

must also be rolled back.

Expected:

```text
No Ledger Entry
No Projection Change
```

---

## Partial Failure

Test a failure after:

```text
Ledger Insert
```

but before:

```text
Account Update
```

Expected:

```text
Transaction Rollback
```

No partial financial state may remain.

---

# 13. Sale Reconciliation Tests

## 13.1 Approved Sale

Given:

```text
Sale = PENDING
Total Earnings = ₹40
Advance = ₹4
```

Admin approves.

Expected:

```text
Sale = APPROVED
Ledger = +₹36 SETTLEMENT
```

---

## 13.2 Rejected Sale

Given:

```text
Sale = PENDING
Advance = ₹4
```

Admin rejects.

Expected:

```text
Sale = REJECTED
Ledger = -₹4 REJECTION_ADJUSTMENT
```

---

## 13.3 No Advance

If a pending sale has no advance:

Approved:

```text
Settlement = Full Earnings
```

Rejected:

```text
Adjustment = ₹0
```

No unnecessary negative ledger entry should be created.

---

## 13.4 Reconciliation Idempotency

Submit reconciliation twice.

Expected:

```text
First request → Success
Second request → No additional financial effect
```

---

# 14. Advance Payout Tests

## 14.1 Eligible Sale

Given:

```text
Sale = PENDING
Advance = Not Paid
```

Expected:

```text
Advance Created
Ledger Created
Projection Updated
```

---

## 14.2 Already Paid Advance

Given:

```text
Sale = PENDING
Advance = Already Paid
```

Expected:

```text
No new advance
No new ledger entry
No balance change
```

---

## 14.3 Duplicate Worker Execution

Run:

```text
Worker A
Worker B
```

simultaneously for the same sale.

Expected:

```text
1 Advance
1 Ledger Entry
1 Projection Update
```

---

# 15. Withdrawal Tests

## 15.1 Successful Withdrawal Request

Given:

```text
Withdrawable Balance = ₹1000
Withdrawal = ₹500
```

Expected:

```text
Withdrawal Created
₹500 Reserved
Available Balance = ₹500
```

---

## 15.2 Insufficient Funds

Given:

```text
Balance = ₹100
Withdrawal = ₹200
```

Expected:

```text
Request Rejected
Balance = ₹100
```

---

## 15.3 Rolling 24-Hour Restriction

Given:

```text
Withdrawal A = Completed 12 hours ago
```

New withdrawal request:

```text
Withdrawal B
```

Expected:

```text
Rejected
```

After more than 24 hours:

```text
Withdrawal B
```

Expected:

```text
Allowed
```

The test must use a controllable clock.

---

## 15.4 Failed Withdrawal

Given:

```text
Balance = ₹1000
Withdrawal = ₹500
```

After reservation:

```text
Available Balance = ₹500
```

Provider returns:

```text
FAILED
```

Expected:

```text
Recovery = ₹500
Available Balance = ₹1000
```

The recovery must occur exactly once.

---

# 16. Payment Provider Tests

The provider must be mocked in application tests.

The mock should support:

```text
SUCCESS
FAILED
REJECTED
CANCELLED
PROCESSING
TIMEOUT
NETWORK_ERROR
UNKNOWN
```

---

# 17. Timeout Tests

A timeout must not automatically be interpreted as failure.

Scenario:

```text
Withdrawal
    ↓
Funds Reserved
    ↓
Provider Request
    ↓
Timeout
```

Expected:

```text
Withdrawal = PROCESSING / UNKNOWN
Funds remain reserved
No recovery
```

The system must wait for a definitive provider result.

---

# 18. Webhook Tests

## 18.1 Successful Webhook

Provider sends:

```text
SUCCESS
```

Expected:

```text
Payment Attempt = SUCCESS
```

---

## 18.2 Failed Webhook

Provider sends:

```text
FAILED
```

Expected:

```text
Payment Attempt = FAILED
Recovery Created
```

---

## 18.3 Duplicate Webhook

Send the same webhook:

```text
3 times
```

Expected:

```text
1 State Transition
1 Recovery
```

---

## 18.4 Out-of-Order Webhook

Example:

```text
FAILED
SUCCESS
```

The system must follow the approved payment state transition rules.

Invalid transitions must not produce additional financial effects.

---

# 19. Exactly-Once Recovery Tests

This is a critical financial test category.

Initial:

```text
Withdrawal = ₹500
```

Provider sends:

```text
FAILED
```

Then send the same failure event repeatedly.

Expected:

```text
Recovery Count = 1
Recovery Amount = ₹500
```

The user's balance must be restored exactly once.

---

# 20. Concurrency Testing

Concurrency tests are mandatory.

These tests must execute real concurrent operations against PostgreSQL.

The goal is to reproduce race conditions.

---

# 21. Concurrent Withdrawal Test

Initial:

```text
Balance = ₹1000
```

Two requests execute simultaneously:

```text
Request A = ₹800
Request B = ₹800
```

Expected:

```text
One succeeds
One fails
```

Final balance:

```text
₹200
```

or:

```text
₹1000
```

depending on whether the successful withdrawal is later recovered.

The final balance must never become:

```text
-₹600
```

---

# 22. Concurrent Reconciliation Test

Initial:

```text
Sale = PENDING
```

Two administrators submit:

```text
APPROVED
APPROVED
```

simultaneously.

Expected:

```text
One transition
One settlement
```

No duplicate settlement.

---

# 23. Conflicting Reconciliation Test

Two administrators simultaneously submit:

```text
APPROVED
REJECTED
```

Expected:

```text
Exactly one transition succeeds
```

The second operation must fail because the sale is no longer `PENDING`.

Only one financial effect may exist.

---

# 24. Concurrent Advance Worker Test

Two workers process the same pending sale.

Expected:

```text
One Advance Payout
One Ledger Entry
```

Database uniqueness must guarantee correctness even if application-level checks race.

---

# 25. Concurrent Recovery Test

Two webhook handlers process the same failed withdrawal simultaneously.

Expected:

```text
One Recovery
```

The database must reject or safely ignore the duplicate operation.

---

# 26. Idempotency Testing

Idempotency must be tested at multiple layers.

```text
HTTP Idempotency
Database Idempotency
Worker Idempotency
Webhook Idempotency
Financial Idempotency
```

---

# 27. API Idempotency Test

Submit:

```text
POST /api/v1/workflows/withdrawals
Idempotency-Key: abc123
```

Then repeat the exact request with:

```text
Idempotency-Key: abc123
```

Expected:

```text
Same logical withdrawal
Same response
No duplicate withdrawal
No duplicate financial debit
```

---

# 28. Idempotency Key Conflict Test

Use the same idempotency key with a different request payload.

Example:

```text
Request A
Key = abc123
Amount = ₹100
```

Then:

```text
Request B
Key = abc123
Amount = ₹500
```

Expected:

```text
Request rejected
```

The system must not silently associate the second request with the first operation.

---

# 29. Worker Retry Testing

Simulate:

```text
Worker Starts
    ↓
Financial Operation Succeeds
    ↓
Worker Crashes Before Acknowledgement
    ↓
Worker Retries
```

Expected:

```text
No duplicate financial effect
```

This validates that the system is safe under at-least-once job execution.

---

# 30. Failure Recovery Testing

The system must be tested against failures at every important boundary.

Examples:

```text
Database unavailable
Database transaction rollback
Provider unavailable
Provider timeout
Provider returns 500
Provider returns malformed response
Webhook duplicated
Webhook delayed
Worker crashes
Application crashes
```

The expected state must be explicitly defined for each scenario.

---

# 31. Application Crash Tests

Test a crash after:

```text
Funds Reserved
```

but before:

```text
Provider Request
```

Expected:

```text
Withdrawal remains in recoverable processing state.
```

The system must not automatically assume the payment succeeded or failed.

---

# 32. Provider Failure Matrix

The following behavior must be tested:

| Provider Result | Expected Internal State | Recovery |
| --------------- | ----------------------- | -------- |
| Success         | SUCCESS                 | No       |
| Failed          | FAILED                  | Yes      |
| Rejected        | REJECTED                | Yes      |
| Cancelled       | CANCELLED               | Yes      |
| Processing      | PROCESSING              | No       |
| Timeout         | PROCESSING / UNKNOWN    | No       |
| Network Error   | PROCESSING / UNKNOWN    | No       |

The exact internal states must match the approved state machine.

---

# 33. Security Testing

Security tests must verify:

## Authentication

Unauthenticated users cannot access protected endpoints.

---

## Authorization

A normal user cannot access admin endpoints.

---

## Ownership

User A cannot access:

```text
User B's Account
User B's Ledger
User B's Withdrawal
```

Even if User A modifies the resource ID in the request.

---

## Webhook Security

Invalid signatures must be rejected.

The signature must be verified against the raw request payload before parsing.

---

# 34. API Validation Tests

Test:

```text
Missing fields
Invalid types
Invalid amounts
Negative amounts
Zero amounts
Invalid status
Malformed IDs
Invalid currency
Oversized values
```

Expected:

```text
Validation Error
```

No financial state must change.

---

# 35. Error Handling Tests

Every expected error must have:

```text
Correct HTTP status
Consistent error structure
Correlation ID
No sensitive information leakage
No partial financial effect
```

Example:

```text
Insufficient funds
```

must not result in:

```text
Partial withdrawal
```

---

# 36. End-to-End Financial Scenarios

The following complete workflows must be tested.

---

## Scenario A — Pending → Advance → Approved → Settlement

```text
Sale Created
    ↓
Pending
    ↓
Advance 10%
    ↓
Admin Approves
    ↓
Settlement
```

Verify:

```text
Sale State
Ledger
Account Projection
Final Balance
```

---

## Scenario B — Pending → Advance → Rejected → Recovery Adjustment

```text
Sale Created
    ↓
Pending
    ↓
Advance 10%
    ↓
Admin Rejects
    ↓
Negative Adjustment
```

Verify:

```text
Advance
Adjustment
Recovery Balance
Withdrawable Balance
```

---

## Scenario C — Withdrawal → Provider Success

```text
Available Balance
    ↓
Withdrawal
    ↓
Reservation
    ↓
Provider Success
```

Verify:

```text
No duplicate debit
Correct final state
```

---

## Scenario D — Withdrawal → Provider Failure → Recovery

```text
Available Balance
    ↓
Withdrawal
    ↓
Reservation
    ↓
Provider Failure
    ↓
Recovery
```

Verify:

```text
Exactly one recovery
Correct balance restoration
```

---

## Scenario E — Withdrawal → Provider Timeout

```text
Available Balance
    ↓
Withdrawal
    ↓
Reservation
    ↓
Provider Timeout
```

Verify:

```text
No automatic recovery
Funds remain safely reserved
Withdrawal remains unresolved
```

---

# 37. Financial Invariant Test Suite

A dedicated test suite must verify the following invariants.

### Invariant 1

```text
A sale can receive at most one advance payout.
```

### Invariant 2

```text
A sale can be reconciled at most once.
```

### Invariant 3

```text
A withdrawal cannot spend unavailable funds.
```

### Invariant 4

```text
Withdrawable balance cannot become negative.
```

### Invariant 5

```text
A failed withdrawal can be recovered at most once.
```

### Invariant 6

```text
A provider timeout does not trigger automatic recovery.
```

### Invariant 7

```text
Duplicate webhook events do not create duplicate financial effects.
```

### Invariant 8

```text
Duplicate worker executions do not create duplicate financial effects.
```

### Invariant 9

```text
Every financial ledger operation is atomic with its account projection update.
```

### Invariant 10

```text
The ledger is append-only and immutable.
```

---

# 38. Ledger Integrity Tests

The ledger must be treated as immutable history.

Tests must verify that:

```text
Existing Ledger Entry
```

cannot be:

```text
Updated
Deleted
```

through normal application operations.

Corrections must be represented by new ledger entries.

Example:

```text
Original:
-₹4

Correction:
+₹4
```

The original entry remains unchanged.

---

# 39. Projection Consistency Tests

The account projection must be compared against the ledger.

For a test account:

```text
Ledger Entries
    ↓
Recalculate Expected Financial State
```

Compare against:

```text
Account.withdrawable_balance
Account.recovery_balance
```

Expected:

```text
Projection = Ledger-derived State
```

This test should run periodically in integration or reconciliation test suites.

---

# 40. Property-Based Testing

Where practical, property-based testing may be used for financial calculations.

Generate random sequences of:

```text
Credits
Debits
Recovery
Settlements
Adjustments
```

Then verify invariants such as:

```text
Withdrawable Balance >= 0
```

and:

```text
Recovery Balance >= 0
```

The projection must remain mathematically consistent.

---

# 41. Test Data Strategy

Tests should use deterministic factories.

Examples:

```text
UserFactory
AccountFactory
SaleFactory
WithdrawalFactory
LedgerEntryFactory
PaymentAttemptFactory
```

Factories must create valid domain objects by default.

Invalid objects should be created explicitly for negative tests.

---

# 42. Test Isolation

Each test must be isolated.

Preferred approaches:

```text
Database Transaction Rollback
```

or:

```text
Dedicated Test Database
```

Tests must not depend on execution order.

A test should pass whether executed:

```text
Alone
```

or:

```text
As Part of Full Suite
```

---

# 43. Test Environment

The integration test environment should contain:

```text
Application
PostgreSQL
Mock Payment Provider
```

Optional:

```text
Redis
Background Job Infrastructure
```

The test environment should be reproducible through Docker.

---

# 44. Continuous Integration

Every pull request should execute:

```text
Lint
Type Check
Unit Tests
Domain Tests
Repository Tests
Integration Tests
Security Tests
Build
```

Concurrency tests may run in a dedicated CI stage if they require additional infrastructure.

---

# 45. Test Execution Stages

## Fast Feedback

Run on every code change:

```text
Lint
Type Check
Unit Tests
Domain Tests
```

## Pull Request

Run:

```text
Unit Tests
Integration Tests
Repository Tests
API Tests
Security Tests
```

## Main Branch

Run:

```text
Full Test Suite
Concurrency Tests
End-to-End Tests
```

## Pre-Deployment

Run:

```text
Full Test Suite
Database Migration Tests
Deployment Smoke Tests
```

---

# 46. Minimum Coverage Expectations

Coverage should not be treated as the only measure of quality.

However, the following areas require comprehensive coverage:

```text
Financial Calculations
Ledger Operations
Account Projection
Sale Reconciliation
Advance Payout
Withdrawal
Recovery
State Transitions
Idempotency
Concurrency
```

Critical financial workflows should have near-complete branch coverage.

---

# 47. Testing Definition of Done

A feature is not considered complete until:

```text
[ ] Unit tests exist
[ ] Integration tests exist where persistence is involved
[ ] Financial invariants are tested
[ ] Error paths are tested
[ ] Idempotency is tested
[ ] Concurrency is tested where applicable
[ ] Database constraints are tested
[ ] Security boundaries are tested
[ ] Logs and correlation IDs are verified
```

---

# 48. Implementation Test Order

Testing should be implemented alongside development.

Recommended order:

```text
1. Money Tests
2. Domain Tests
3. State Machine Tests
4. Database Constraint Tests
5. Repository Tests
6. Transaction Tests
7. Ledger Tests
8. Account Projection Tests
9. Reconciliation Tests
10. Advance Payout Tests
11. Withdrawal Tests
12. Payment Provider Tests
13. Webhook Tests
14. Recovery Tests
15. Idempotency Tests
16. Concurrency Tests
17. Security Tests
18. End-to-End Tests
19. Deployment Smoke Tests
```

---

# 49. Critical Test Scenarios Checklist

Before final delivery, the following scenarios must pass:

```text
[ ] Pending sale receives 10% advance
[ ] Same sale cannot receive advance twice
[ ] Pending sale can be approved once
[ ] Pending sale can be rejected once
[ ] Approved sale receives remaining settlement
[ ] Rejected sale creates correct negative adjustment
[ ] User cannot withdraw more than available funds
[ ] Two concurrent withdrawals cannot overspend
[ ] 24-hour withdrawal restriction works
[ ] Failed withdrawal is recovered
[ ] Failed withdrawal cannot be recovered twice
[ ] Cancelled withdrawal is recovered
[ ] Rejected withdrawal is recovered
[ ] Provider timeout does not trigger recovery
[ ] Duplicate webhook does not duplicate recovery
[ ] Duplicate worker does not duplicate advance
[ ] Duplicate idempotency key does not create duplicate withdrawal
[ ] Idempotency key payload conflict is rejected
[ ] Ledger entries cannot be modified
[ ] Account projection matches ledger-derived state
[ ] Unauthorized user cannot access another user's funds
[ ] Admin-only operations are protected
[ ] Webhook signature is validated
[ ] Database rollback prevents partial financial state
[ ] Application restart does not corrupt financial state
```

---

# 50. Final Testing Principle

The most important test in this project is not:

```text
"Does the endpoint return 200?"
```

It is:

> **"After every possible retry, race condition, duplicate event, timeout, crash, and provider failure, is the financial state still correct?"**

The testing strategy therefore follows:

```text
Business Rule
      ↓
Invariant
      ↓
Normal Case
      ↓
Error Case
      ↓
Duplicate Case
      ↓
Concurrent Case
      ↓
Failure Case
      ↓
Recovery Case
```

A financial feature is considered production-ready only when it passes all eight levels.

The final objective is to demonstrate that the system is not merely functional under ideal conditions, but **financially correct under adverse conditions**.
