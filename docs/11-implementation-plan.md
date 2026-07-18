# Implementation Plan

## 1. Purpose

This document defines the implementation roadmap for the User Payout Management System.

The purpose is to translate the approved architecture and business requirements into a controlled engineering execution plan.

The implementation must proceed incrementally.

Each phase must produce a working and testable system component before the next dependent phase begins.

The implementation strategy prioritizes:

* Financial correctness
* Data integrity
* Explicit transaction boundaries
* Idempotency
* Concurrency safety
* Testability
* Observability
* Security
* Production readiness

The system must not be implemented as a collection of independent CRUD endpoints.

Financial operations must be implemented as domain workflows with explicit invariants.

---

# 2. Implementation Philosophy

The implementation follows these principles:

### Principle 1 — Build the foundation first

Infrastructure and database constraints must exist before financial business logic is implemented.

### Principle 2 — Domain before API

The core business rules should be implemented independently of HTTP controllers.

### Principle 3 — Ledger before balance

Financial history is created first.

Account projections are derived from ledger activity.

### Principle 4 — Database constraints are part of the implementation

Important business invariants must be enforced at both:

```text
Application Layer
+
Database Layer
```

### Principle 5 — External providers are untrusted

Payment-provider communication must be isolated behind an adapter.

The domain must not depend directly on provider-specific APIs.

### Principle 6 — Unknown is not failure

A timeout or network error does not automatically mean that money movement failed.

The system must preserve an `UNKNOWN` or `PROCESSING` state until the provider result is definitively known.

### Principle 7 — Test financial invariants before optimizing

Correctness takes priority over premature performance optimization.

---

# 3. Overall Implementation Sequence

The recommended implementation sequence is:

```text
Phase 1
Repository & Project Bootstrap
        ↓
Phase 2
Infrastructure & Local Development
        ↓
Phase 3
Database Schema & Migrations
        ↓
Phase 4
Domain Models & Value Objects
        ↓
Phase 5
Repositories & Transaction Infrastructure
        ↓
Phase 6
Ledger & Account Projection
        ↓
Phase 7
Sale Reconciliation
        ↓
Phase 8
Advance Payout Processing
        ↓
Phase 9
Withdrawal & Fund Reservation
        ↓
Phase 10
Payment Provider Integration
        ↓
Phase 11
Webhook Processing
        ↓
Phase 12
Failed Payout Recovery
        ↓
Phase 13
REST API
        ↓
Phase 14
Authentication & Authorization
        ↓
Phase 15
Background Workers
        ↓
Phase 16
Concurrency & Idempotency Testing
        ↓
Phase 17
Integration & End-to-End Testing
        ↓
Phase 18
Observability
        ↓
Phase 19
Docker & Deployment
        ↓
Phase 20
Final Verification
```

---

# 4. Phase 1 — Repository & Project Bootstrap

## Objective

Create the initial project structure and development foundation.

## Tasks

* Initialize Git repository.
* Initialize backend application.
* Configure package manager.
* Configure TypeScript if applicable.
* Configure linting.
* Configure formatting.
* Configure environment configuration.
* Configure test runner.
* Configure Git hooks if required.
* Create initial README.
* Create documentation directory.

Recommended structure:

```text
project/
├── src/
├── tests/
├── docs/
├── migrations/
├── scripts/
├── .env.example
├── .gitignore
├── Dockerfile
├── docker-compose.yml
├── package.json
└── README.md
```

The exact structure may change as implementation progresses.

## Completion Criteria

The project must:

* Start locally.
* Run a health-check endpoint.
* Run automated tests.
* Pass linting.
* Pass formatting checks.
* Build successfully.

---

# 5. Phase 2 — Infrastructure & Local Development

## Objective

Create reproducible local infrastructure.

Initial infrastructure:

```text
Application
    ↓
PostgreSQL
```

Additional infrastructure may include:

```text
Redis
Background Worker
Payment Provider Mock
```

only when required.

## Tasks

* Configure PostgreSQL.
* Create Docker Compose configuration.
* Configure application database connection.
* Configure health checks.
* Configure environment variables.
* Create local development setup instructions.
* Add database connection verification.

## Completion Criteria

A developer must be able to clone the repository and start the system using documented commands.

Example:

```text
git clone ...
npm install
docker compose up
npm run dev
```

The application must successfully connect to PostgreSQL.

---

# 6. Phase 3 — Database Schema & Migrations

## Objective

Implement the database design defined in:

```text
docs/04-database-design.md
```

## Tasks

Create migrations for:

```text
Users
Accounts
Sales
Ledger Entries
Advance Payouts
Withdrawals
Payment Attempts
Recovery Operations
Idempotency Records
Webhook Events
Audit Logs
```

The exact table structure must follow the approved database design.

## Important Rules

Migrations must define:

* Primary keys
* Foreign keys
* Unique constraints
* Check constraints
* Indexes
* Required fields
* State constraints

## Financial Constraints

Examples:

```text
Unique advance per sale
Unique recovery per failed withdrawal
Non-negative withdrawable balance
Valid account ownership
Valid ledger references
```

## Completion Criteria

The database must reject invalid financial states even when the application attempts to create them.

---

# 7. Phase 4 — Domain Models & Value Objects

## Objective

Implement the domain model independently from infrastructure.

Core domain concepts include:

```text
User
Account
Sale
LedgerEntry
AdvancePayout
Withdrawal
PaymentAttempt
Recovery
```

Value objects may include:

```text
Money
Currency
SaleStatus
WithdrawalStatus
PaymentStatus
LedgerEntryType
```

## Money Representation

Money must use exact arithmetic.

Avoid:

```text
JavaScript Number
Floating-point arithmetic
```

Prefer:

```text
Decimal
```

or:

```text
Integer minor units
```

The selected approach must be used consistently throughout the system.

## Completion Criteria

Domain models must enforce basic invariants without depending on HTTP or database-specific code.

---

# 8. Phase 5 — Repository & Transaction Infrastructure

## Objective

Create persistence abstractions and transaction management.

Recommended architecture:

```text
Controller
    ↓
Application Service
    ↓
Domain
    ↓
Repository Interface
    ↓
Repository Implementation
    ↓
PostgreSQL
```

Repositories should handle persistence.

Application services should orchestrate business workflows.

## Transaction Infrastructure

The system must support:

```text
BEGIN
    ↓
Database Operations
    ↓
COMMIT
```

and:

```text
BEGIN
    ↓
Error
    ↓
ROLLBACK
```

Financial workflows must have explicitly defined transaction boundaries.

## Completion Criteria

A transaction can safely execute multiple related database operations atomically.

---

# 9. Phase 6 — Ledger & Account Projection

## Objective

Implement the financial core.

The ledger is the financial source of truth.

The account projection provides fast access to current balances.

Conceptually:

```text
Ledger Entry
      ↓
Projection Logic
      ↓
Account
├── withdrawable_balance
└── recovery_balance
```

## Credit Logic

For:

```text
+₹36
```

calculate:

```text
amount_to_balance =
    max(0, amount - current_recovery_balance)

new_recovery_balance =
    max(0, current_recovery_balance - amount)

new_withdrawable_balance =
    current_withdrawable_balance + amount_to_balance
```

## Debit Logic

For:

```text
-₹4
```

calculate:

```text
amount_to_debt =
    max(0, absolute(amount) - current_withdrawable_balance)

new_withdrawable_balance =
    max(0, current_withdrawable_balance - absolute(amount))

new_recovery_balance =
    current_recovery_balance + amount_to_debt
```

## Critical Rule

Ledger creation and account projection update must occur in the same database transaction.

Example:

```text
BEGIN
    ↓
Insert Ledger Entry
    ↓
Update Account Projection
    ↓
COMMIT
```

If either operation fails:

```text
ROLLBACK
```

## Completion Criteria

Every financial ledger entry produces exactly one corresponding projection update.

No ledger entry may exist without its projection being updated.

---

# 10. Phase 7 — Sale Reconciliation

## Objective

Implement administrator-driven sale reconciliation.

Supported transitions:

```text
PENDING
    ↓
APPROVED

PENDING
    ↓
REJECTED
```

Invalid transitions must be rejected.

Examples:

```text
APPROVED → REJECTED
REJECTED → APPROVED
APPROVED → APPROVED
```

must not create additional financial effects.

## Approved Sale

If:

```text
Total Earnings = ₹40
Advance = ₹4
```

then:

```text
Settlement = ₹36
```

Create:

```text
+₹36 SETTLEMENT
```

## Rejected Sale

If:

```text
Total Earnings = ₹40
Advance = ₹4
```

then:

```text
Adjustment = -₹4
```

Create:

```text
-₹4 REJECTION_ADJUSTMENT
```

## Concurrency

Reconciliation must use pessimistic locking or an equivalent concurrency-safe mechanism.

Conceptually:

```text
BEGIN
    ↓
SELECT Sale FOR UPDATE
    ↓
Verify PENDING
    ↓
Update Sale Status
    ↓
Create Ledger Entry
    ↓
Update Account Projection
    ↓
COMMIT
```

## Completion Criteria

Two simultaneous reconciliation requests cannot produce duplicate financial effects.

---

# 11. Phase 8 — Advance Payout Processing

## Objective

Implement scheduled advance payout processing.

Every eligible pending sale may receive:

```text
10% of total earnings
```

## Eligibility

The worker must verify:

```text
Sale status = PENDING
AND
Advance payout does not already exist
```

## Idempotency

The database must enforce:

```text
UNIQUE(sale_id)
```

or an equivalent unique constraint.

## Processing Flow

```text
Find Eligible Sale
      ↓
Lock / Claim Sale
      ↓
Check Advance Eligibility
      ↓
Create Advance Payout
      ↓
Create Ledger Entry
      ↓
Update Account Projection
      ↓
COMMIT
```

The worker may run repeatedly.

The financial effect must occur only once.

## Completion Criteria

Running the job:

```text
1 time
```

or:

```text
100 times
```

must produce the same financial result.

---

# 12. Phase 9 — Withdrawal & Fund Reservation

## Objective

Implement user withdrawals safely.

The withdrawal process is:

```text
User Request
    ↓
Validate Eligibility
    ↓
Check 24-Hour Rule
    ↓
Reserve Funds
    ↓
Create Withdrawal
    ↓
Create Payment Attempt
    ↓
COMMIT
    ↓
Call Provider
```

## Critical Rule

Funds must be reserved before calling the external payment provider.

The system must never:

```text
Call Provider
    ↓
Then Debit User
```

because concurrent requests could spend the same funds.

## Reservation Transaction

```text
BEGIN
    ↓
SELECT Account FOR UPDATE
    ↓
Validate Balance
    ↓
Reserve / Debit Funds
    ↓
Create Withdrawal
    ↓
Create Payment Attempt
    ↓
COMMIT
```

Only after commit:

```text
Call Payment Provider
```

## Completion Criteria

Two simultaneous withdrawal requests cannot spend the same balance.

---

# 13. Phase 10 — Payment Provider Integration

## Objective

Isolate external payment infrastructure.

Use an adapter interface:

```text
PaymentProvider
```

Example:

```text
createTransfer()
getTransferStatus()
```

The domain must not depend on provider-specific request formats.

Architecture:

```text
Application Service
        ↓
Payment Provider Interface
        ↓
Provider Adapter
        ↓
External Provider
```

## Provider Results

The provider may return:

```text
SUCCESS
FAILED
REJECTED
CANCELLED
PROCESSING
UNKNOWN
```

The system must map provider-specific statuses into internal statuses.

## Completion Criteria

The provider can be replaced with a mock implementation during tests.

---

# 14. Phase 11 — Webhook Processing

## Objective

Process asynchronous provider updates.

Webhook flow:

```text
Webhook
    ↓
Verify Signature
    ↓
Validate Event
    ↓
Check Event Idempotency
    ↓
Load Payment Attempt
    ↓
Lock Relevant Record
    ↓
Process State Transition
    ↓
Financial Recovery if Required
    ↓
Commit
```

## Duplicate Webhooks

The same event must never produce multiple financial effects.

Database uniqueness must enforce this.

## Completion Criteria

Sending the same webhook repeatedly produces exactly one financial effect.

---

# 15. Phase 12 — Failed Payout Recovery

## Objective

Recover funds when the payment provider definitively reports:

```text
CANCELLED
REJECTED
FAILED
```

## Recovery Flow

```text
Provider Failure
       ↓
Verify Event
       ↓
Lock Withdrawal
       ↓
Check Recovery Already Exists
       ↓
Create Recovery Ledger Entry
       ↓
Update Account Projection
       ↓
Mark Withdrawal Recovered
       ↓
COMMIT
```

## Exactly-Once Recovery

The system must guarantee:

```text
One Failed Withdrawal
        ↓
At Most One Recovery
```

The recovery operation must be protected by a unique database constraint.

## Completion Criteria

Repeated failure notifications cannot credit the user multiple times.

---

# 16. Phase 13 — REST API

## Objective

Expose business functionality through HTTP.

API implementation must follow:

```text
HTTP Controller
      ↓
Request Validation
      ↓
Authentication
      ↓
Authorization
      ↓
Application Service
      ↓
Domain
      ↓
Repository
```

Controllers must not contain financial business logic.

## Initial API Areas

```text
Authentication
Users
Accounts
Sales
Ledger
Withdrawals
Admin Reconciliation
Webhooks
```

The API contract must follow:

```text
docs/05-api-design.md
```

## Completion Criteria

Every API endpoint has:

* Request validation
* Authorization
* Error handling
* Consistent response format
* Tests

---

# 17. Phase 14 — Authentication & Authorization

## Objective

Implement the security model.

Required capabilities:

```text
Authentication
Role-Based Access Control
Resource Ownership
Admin Authorization
Webhook Authentication
```

## User Authorization

Users can access only their own:

```text
Account
Sales
Ledger
Withdrawals
```

## Admin Authorization

Admins can perform authorized reconciliation operations.

They cannot directly modify:

```text
Account Balance
Ledger
Payment State
```

outside defined application workflows.

## Completion Criteria

Unauthorized requests are rejected by automated tests.

---

# 18. Phase 15 — Background Workers

## Objective

Implement scheduled and asynchronous processing.

Workers may include:

```text
Advance Payout Worker
Reconciliation Worker
Recovery Worker
```

Each worker must be:

```text
Idempotent
Retryable
Observable
Safe under concurrency
```

## Worker Retry Rule

A worker retry must never create duplicate financial effects.

The system relies on:

```text
Database Constraints
+
Idempotent Operations
+
Transactions
```

## Completion Criteria

Workers can safely restart or execute concurrently.

---

# 19. Phase 16 — Concurrency & Idempotency Testing

## Objective

Prove that financial invariants survive concurrent execution.

Tests must simulate:

```text
Two simultaneous withdrawals
Two simultaneous reconciliations
Duplicate advance jobs
Duplicate webhook events
Duplicate recovery requests
Repeated idempotency keys
```

## Critical Tests

### Concurrent Withdrawal

```text
Initial Balance = ₹1000

Request A = ₹800
Request B = ₹800
```

Expected:

```text
Only one succeeds
One fails due to insufficient available funds
```

The final balance must never be negative.

---

### Concurrent Reconciliation

```text
Sale = PENDING
```

Two administrators reconcile simultaneously.

Expected:

```text
One financial transition
One ledger effect
```

---

### Duplicate Advance

```text
Worker A
Worker B
```

Both process the same sale.

Expected:

```text
One advance payout
One ledger entry
```

---

### Duplicate Recovery

```text
Webhook A
Webhook B
Webhook C
```

All represent the same provider failure.

Expected:

```text
One recovery
```

---

# 20. Phase 17 — Integration & End-to-End Testing

## Objective

Verify complete financial workflows.

### Scenario 1 — Approved Sale

```text
Sale Created
    ↓
Pending
    ↓
Advance Paid
    ↓
Admin Approves
    ↓
Final Settlement
    ↓
Balance Updated
```

Expected:

```text
Advance = 10%
Final = Remaining 90%
```

---

### Scenario 2 — Rejected Sale

```text
Sale Created
    ↓
Pending
    ↓
Advance Paid
    ↓
Admin Rejects
    ↓
Negative Adjustment
```

Expected:

```text
Advance Recovered
```

---

### Scenario 3 — Successful Withdrawal

```text
Available Balance
    ↓
Withdrawal Requested
    ↓
Funds Reserved
    ↓
Provider Success
```

Expected:

```text
Funds remain settled
```

---

### Scenario 4 — Failed Withdrawal

```text
Available Balance
    ↓
Withdrawal Requested
    ↓
Funds Reserved
    ↓
Provider Failed
    ↓
Recovery
```

Expected:

```text
Funds restored
Recovery available
```

---

### Scenario 5 — Provider Timeout

```text
Withdrawal
    ↓
Provider Request
    ↓
Network Timeout
```

Expected:

```text
Payment remains PROCESSING / UNKNOWN
```

No automatic recovery occurs.

---

# 21. Phase 18 — Observability

## Objective

Make financial workflows traceable.

Every request should have:

```text
request_id
correlation_id
```

Financial operations should log:

```text
user_id
sale_id
withdrawal_id
payment_attempt_id
ledger_entry_id
```

Logs must not contain secrets.

## Metrics

Track:

```text
Withdrawal Success Rate
Withdrawal Failure Rate
Provider Timeout Rate
Webhook Failure Rate
Advance Processing Rate
Recovery Rate
Reconciliation Rate
```

## Alerts

Alert on:

```text
High provider failures
High webhook failures
Repeated reconciliation errors
Unexpected recovery spikes
Database constraint violations
Worker failures
```

---

# 22. Phase 19 — Docker & Deployment

## Objective

Create a reproducible production deployment.

Minimum production components:

```text
Application
PostgreSQL
Background Worker
```

Optional:

```text
Redis
Reverse Proxy
Monitoring
Log Aggregation
```

## Deployment Requirements

The deployment must support:

```text
Environment-specific configuration
Secret management
Database migrations
Health checks
Graceful shutdown
Application logging
Worker monitoring
```

## Database Migration Strategy

Migrations must be version-controlled.

Deployment flow:

```text
Deploy
    ↓
Run Migration
    ↓
Start Application
    ↓
Health Check
```

Migration failures must stop deployment.

---

# 23. Phase 20 — Final Verification

Before declaring the project complete, verify:

### Business Rules

```text
Advance = 10%
Advance exactly once
Approved settlement correct
Rejected adjustment correct
One withdrawal per rolling 24 hours
Failed payout recovery exactly once
Recovery withdrawal exception works
```

### Financial Integrity

```text
Ledger immutable
Account projection consistent
No negative withdrawable balance
No duplicate financial operations
```

### Concurrency

```text
Concurrent withdrawal safe
Concurrent reconciliation safe
Concurrent workers safe
Duplicate webhook safe
```

### Security

```text
Authentication works
Authorization works
Ownership isolation works
Webhook verification works
Secrets protected
```

### Reliability

```text
Provider timeout safe
Provider retry safe
Worker retry safe
Webhook retry safe
Database rollback safe
```

### Operational Readiness

```text
Logging works
Correlation IDs work
Metrics work
Health checks work
Docker deployment works
```

---

# 24. Definition of Done

The project is considered complete only when:

1. All approved requirements are implemented.
2. All financial invariants are enforced.
3. Database constraints protect critical invariants.
4. Financial operations are transactionally safe.
5. Concurrent requests are handled correctly.
6. Duplicate requests are idempotent.
7. Payment-provider failures are recoverable.
8. Unknown provider outcomes are not incorrectly treated as failures.
9. Authentication and authorization are implemented.
10. User data is properly isolated.
11. Webhooks are authenticated and idempotent.
12. Automated tests cover critical financial workflows.
13. Integration tests cover end-to-end scenarios.
14. Logs contain correlation identifiers.
15. Secrets are securely managed.
16. The application runs reproducibly using documented setup instructions.
17. Production deployment is documented.
18. The final implementation matches the approved architecture documents.

---

# 25. Recommended Implementation Milestones

The implementation should be divided into milestones.

## Milestone 1 — Foundation

```text
Repository
Project Setup
Docker
PostgreSQL
Migrations
Testing
CI
```

Deliverable:

```text
Running application + database
```

---

## Milestone 2 — Financial Core

```text
Domain
Money
Ledger
Account Projection
Transactions
```

Deliverable:

```text
Correct financial accounting engine
```

---

## Milestone 3 — Sales

```text
Sales
Advance Payout
Reconciliation
Settlement
Rejection Adjustment
```

Deliverable:

```text
Complete sale-to-ledger lifecycle
```

---

## Milestone 4 — Withdrawals

```text
Withdrawal
Fund Reservation
24-Hour Rule
Idempotency
```

Deliverable:

```text
Safe withdrawal workflow
```

---

## Milestone 5 — Payment Integration

```text
Provider Adapter
Payment Attempts
Webhooks
Provider Status
```

Deliverable:

```text
External payment integration
```

---

## Milestone 6 — Recovery

```text
Failed Payout
Recovery
Recovery Withdrawal
Exactly-Once Processing
```

Deliverable:

```text
Complete failure recovery workflow
```

---

## Milestone 7 — API & Security

```text
REST API
Authentication
Authorization
RBAC
Ownership
Validation
```

Deliverable:

```text
Secure client-facing application
```

---

## Milestone 8 — Production Readiness

```text
Concurrency Tests
Integration Tests
Observability
Docker
Deployment
Documentation
```

Deliverable:

```text
Production-ready system
```

---

# 26. Recommended Coding Order

The actual coding order should be:

```text
1. Project Bootstrap
2. Docker + PostgreSQL
3. Database Migrations
4. Money Value Object
5. Domain Entities
6. Repository Interfaces
7. PostgreSQL Repositories
8. Transaction Manager
9. Ledger Service
10. Account Projection Service
11. Sale Reconciliation Service
12. Advance Payout Service
13. Withdrawal Service
14. Payment Provider Adapter
15. Payment Attempt Service
16. Webhook Service
17. Recovery Service
18. Authentication
19. Authorization
20. REST Controllers
21. Background Workers
22. Integration Tests
23. Concurrency Tests
24. Observability
25. Deployment
```

The order is intentional.

Do not begin with:

```text
Frontend
```

or:

```text
REST Controllers
```

or:

```text
Payment Provider Integration
```

before the financial core is stable.

---

# 27. First Implementation Sprint

The first sprint should be deliberately small.

### Sprint Goal

> Establish a production-quality development foundation and verify that the application can reliably persist data in PostgreSQL.

### Tasks

```text
[ ] Initialize repository
[ ] Configure TypeScript
[ ] Configure ESLint
[ ] Configure Prettier
[ ] Configure test runner
[ ] Create src/ structure
[ ] Create docs/ structure
[ ] Create .env.example
[ ] Create Dockerfile
[ ] Create docker-compose.yml
[ ] Start PostgreSQL
[ ] Connect application to PostgreSQL
[ ] Create health endpoint
[ ] Create database migration system
[ ] Create first migration
[ ] Add database integration test
[ ] Add CI pipeline
```

### Sprint Exit Criteria

The following commands should succeed:

```text
npm install
npm run lint
npm run format:check
npm test
npm run build
docker compose up
```

The application must expose a health endpoint.

The database connection must be verified by an automated test.

No financial business logic should be implemented yet.

---

# 28. Engineering Rule for the Entire Project

Every implementation phase must answer three questions before moving forward:

### 1. What invariant are we protecting?

Example:

```text
A sale receives at most one advance.
```

### 2. Where is that invariant enforced?

Example:

```text
Application Service
+
Database Unique Constraint
```

### 3. How do we prove it works?

Example:

```text
Unit Test
+
Integration Test
+
Concurrency Test
```

This becomes the standard engineering loop:

```text
Requirement
    ↓
Invariant
    ↓
Design
    ↓
Implementation
    ↓
Database Constraint
    ↓
Automated Test
    ↓
Verification
```

The project should not be considered complete merely because the API returns the expected response.

The implementation is complete only when the financial invariants remain true under:

```text
Normal Requests
Concurrent Requests
Duplicate Requests
Retries
Worker Restarts
Webhook Retries
Provider Failures
Network Timeouts
Database Errors
```

---

# 29. Final Implementation Strategy

The system will be built from the inside out:

```text
                    ┌───────────────────┐
                    │   REST API        │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Application Layer │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │   Domain Layer    │
                    └─────────┬─────────┘
                              │
             ┌────────────────▼────────────────┐
             │       Financial Core            │
             │                                │
             │ Ledger + Account Projection    │
             │ Sale + Payout + Withdrawal     │
             └────────────────┬────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Repository Layer  │
                    └─────────┬─────────┘
                              │
                    ┌─────────▼─────────┐
                    │    PostgreSQL     │
                    └───────────────────┘
```

External systems connect only through controlled boundaries:

```text
Payment Provider
       ↓
Provider Adapter
       ↓
Application Layer

Background Jobs
       ↓
Application Services
```

The core financial logic remains independent of:

```text
HTTP
Payment Provider
Framework
Database Driver
```

This architecture allows the system to be tested and evolved without compromising financial correctness.

---

# 30. Final Principle

The implementation follows one fundamental rule:

> **Build the financial correctness first, then expose it through APIs, then integrate external systems, and finally optimize for production scale.**

The correct sequence is:

```text
Correctness
    ↓
Consistency
    ↓
Concurrency Safety
    ↓
Idempotency
    ↓
Security
    ↓
Observability
    ↓
Performance
    ↓
Scale
```

This order ensures that the system does not become a fast, scalable, highly available system that incorrectly moves money.
