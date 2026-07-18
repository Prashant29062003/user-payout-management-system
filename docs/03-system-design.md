# System Design

## 1. Purpose

This document defines the high-level and low-level architectural design of the User Payout Management System.

The system is designed as a **modular monolith** with PostgreSQL as the primary transactional database.

The architecture prioritizes:

* Financial correctness
* Strong consistency
* Idempotency
* Concurrency safety
* Immutable financial history
* Reliable external payment integration
* Failure recovery
* Auditability
* Testability
* Clear separation of responsibilities

The system is intentionally designed as a modular monolith for the current assignment.

The architecture should allow individual modules to evolve independently without prematurely introducing the operational complexity of microservices.

---

# 2. Architectural Style

The application follows a:

> **Modular Monolith + Layered Architecture + Domain-Oriented Module Boundaries**

The system runs as one deployable application but is internally divided into independent business modules.

```text
                         ┌─────────────────────┐
                         │       Client        │
                         └──────────┬──────────┘
                                    │
                                    v
                         ┌─────────────────────┐
                         │    REST API Layer   │
                         └──────────┬──────────┘
                                    │
                                    v
              ┌─────────────────────────────────────────┐
              │            Application Layer            │
              │                                         │
              │  Use Cases / Services / Orchestration   │
              └──────────────────────┬──────────────────┘
                                     │
                                     v
              ┌─────────────────────────────────────────┐
              │              Domain Layer               │
              │                                         │
              │  Business Rules / Entities / Policies  │
              └──────────────────────┬──────────────────┘
                                     │
                                     v
              ┌─────────────────────────────────────────┐
              │          Infrastructure Layer           │
              │                                         │
              │ Database │ Payment Provider │ Scheduler │
              └─────────────────────────────────────────┘
```

The key architectural principle is:

```text
HTTP
  |
  v
Application Use Case
  |
  v
Domain Rules
  |
  +---------> Repository
  |
  +---------> External Adapter
```

The domain should not depend directly on:

* Express
* PostgreSQL drivers
* Payment provider SDKs
* HTTP request objects
* Background job frameworks

---

# 3. Why Modular Monolith?

A modular monolith is appropriate for this assignment because the system currently has:

* A relatively small domain.
* Strong transactional requirements.
* Highly coupled financial operations.
* A single primary database.
* No demonstrated need for independent service scaling.

The financial workflows frequently require atomic operations across multiple domain concepts.

For example:

```text
Sale Reconciliation
      |
      +---- Update Sale
      |
      +---- Create Ledger Entry
      |
      +---- Update Balance
```

Keeping these operations within one application and one database transaction significantly simplifies consistency.

A microservice architecture would introduce additional complexity:

* Distributed transactions
* Eventual consistency
* Message delivery guarantees
* Cross-service idempotency
* Distributed tracing
* Operational overhead

Therefore:

```text
Current Architecture
        |
        v
Modular Monolith
        |
        v
Strong Database Transactions
```

If future scale requires decomposition, individual modules can later become services.

---

# 4. Module Boundaries

The application is divided into the following modules:

```text
src/modules/

├── users/
├── accounts/
├── sales/
├── payouts/
├── withdrawals/
├── ledger/
└── payment-provider/
```

There is also infrastructure for:

```text
src/

├── database/
├── jobs/
├── middleware/
├── config/
└── shared/
```

---

# 5. User Module

## Responsibility

The User module manages affiliate users.

It provides:

* User creation
* User retrieval
* User ownership relationships

The module does not directly perform financial calculations.

---

## Dependencies

The User module may be referenced by:

```text
Sales
Accounts
Withdrawals
```

It should not directly depend on:

```text
Payment Provider
Ledger
```

Financial operations should be initiated by the appropriate business modules.

---

# 6. Account Module

## Responsibility

The Account module manages the user's financial account and balance projection.

It is responsible for:

* Account ownership
* Withdrawable balance
* Balance reservation
* Balance restoration
* Financial consistency

The Account module works closely with the Ledger module.

---

## Financial Principle

The Account balance is a projection.

The Ledger is the financial source of truth.

```text
             Ledger
               |
               | Financial History
               v
       +-------------------+
       | Balance Projection|
       +-------------------+
               |
               v
          Fast Reads
```

The system should never silently modify the balance without a corresponding financial ledger operation.

---

# 7. Sales Module

## Responsibility

The Sales module manages the sale lifecycle.

It handles:

* Sale creation
* Pending sales
* Sale retrieval
* Sale reconciliation
* Sale state transitions

The valid lifecycle is:

```text
PENDING
   |
   +---- APPROVED
   |
   +---- REJECTED
```

The Sales module should not directly manipulate the account balance.

Instead, reconciliation is coordinated through an application-level use case that interacts with:

```text
Sales
Ledger
Accounts
```

within a single transaction.

---

# 8. Payout Module

The Payout module manages advance payouts and final sale settlements.

It includes:

* Advance payout eligibility
* Advance calculation
* Advance payout execution
* Final settlement
* Rejection adjustment

The module interacts with:

```text
Sales
Ledger
Accounts
Payment Provider
```

---

# 9. Withdrawal Module

The Withdrawal module manages user-initiated withdrawals.

It is responsible for:

* Withdrawal validation
* Withdrawal eligibility
* 24-hour restriction
* Fund reservation
* External payout initiation
* Withdrawal state transitions
* Failed withdrawal recovery

The module interacts with:

```text
Accounts
Ledger
Payment Provider
```

---

# 10. Ledger Module

The Ledger module is responsible for immutable financial records.

It provides:

* Ledger entry creation
* Financial reference tracking
* Idempotency enforcement
* Financial history retrieval

The module must enforce the append-only principle.

```text
Allowed:

INSERT Ledger Entry


Not Allowed:

UPDATE Ledger Entry
DELETE Ledger Entry
```

The Ledger module should be the only module responsible for creating financial ledger records.

Other modules request financial movements through the Ledger module.

---

# 11. Payment Provider Module

The Payment Provider module isolates the external payment system.

The application should depend on an internal interface rather than directly depending on a provider SDK.

Example conceptual interface:

```text
PaymentProvider
    |
    +-- createPayout()
    +-- getPayoutStatus()
    +-- handleWebhook()
```

The implementation can then use:

```text
PaymentProviderAdapter
        |
        v
External Payment API
```

This allows the provider to be replaced without changing core business logic.

For example:

```text
Application
     |
     v
PaymentProvider Interface
     |
     +---- Provider A Adapter
     |
     +---- Provider B Adapter
```

---

# 12. Layered Architecture

Each module follows a consistent internal structure.

Example:

```text
payouts/

├── controllers/
├── services/
├── domain/
├── repositories/
├── dto/
└── routes/
```

The conceptual dependency direction is:

```text
Controller
    |
    v
Application Service
    |
    v
Domain Logic
    |
    +------> Repository
    |
    +------> External Adapter
```

---

# 13. Controller Layer

Controllers are responsible for HTTP concerns.

They handle:

* Request parsing
* Input validation
* Authentication context
* Calling application services
* HTTP response formatting

Controllers must not contain financial business rules.

Bad:

```text
Controller
   |
   +-- Calculate 10% advance
   +-- Update balance
   +-- Insert ledger
```

Good:

```text
Controller
   |
   v
AdvancePayoutService
   |
   +---- Business Logic
   +---- Transaction
   +---- Ledger
   +---- Balance
```

---

# 14. Application Service Layer

Application services coordinate complete business use cases.

Examples:

```text
ProcessAdvancePayout
ReconcileSale
CreateWithdrawal
HandlePayoutFailure
```

An application service is responsible for coordinating multiple domain operations.

For example:

```text
ReconcileSale
      |
      +---- Validate Sale
      |
      +---- Lock Sale
      |
      +---- Determine Advance
      |
      +---- Calculate Adjustment
      |
      +---- Create Ledger Entry
      |
      +---- Update Balance
      |
      +---- Update Sale Status
      |
      +---- Commit
```

Application services define transaction boundaries.

---

# 15. Repository Layer

Repositories abstract persistence operations.

Examples:

```text
SaleRepository
AccountRepository
LedgerRepository
WithdrawalRepository
PaymentAttemptRepository
```

Repositories are responsible for:

* Reading entities
* Persisting entities
* Executing transactional queries
* Applying database-level locking when required

Repositories should not contain business decisions.

For example:

```text
Repository:
"Find pending sale."

Application Service:
"Should this sale be reconciled?"
```

---

# 16. Transaction Manager

Financial workflows require explicit transaction boundaries.

The application should provide a transaction abstraction.

Conceptually:

```text
transactionManager.execute(async (tx) => {

    // Business operation

});
```

All operations participating in the transaction must use the same database transaction context.

Example:

```text
Transaction
    |
    +---- Update Sale
    |
    +---- Insert Ledger Entry
    |
    +---- Update Account Balance
    |
    +---- Commit
```

If any operation fails:

```text
ROLLBACK
```

---

# 17. Financial Transaction Principle

Every financial movement follows:

```text
Business Decision
       |
       v
Financial Ledger Entry
       |
       v
Balance Projection Update
```

For example, an approved sale:

```text
Sale APPROVED
      |
      v
Create SETTLEMENT Ledger
      |
      v
Increase Account Balance
```

The ledger and balance projection must be updated atomically.

---

# 18. Ledger + Balance Projection Strategy

The system uses a hybrid model.

```text
                 SOURCE OF TRUTH
                       |
                       v
               +---------------+
               |     Ledger    |
               |   Append-only |
               +-------+-------+
                       |
                       v
               +---------------+
               |    Account    |
               |    Balance    |
               |   Projection  |
               +---------------+
                       |
                       v
                 Fast Balance
                    Reads
```

The ledger provides:

* Auditability
* Financial history
* Reconstruction capability

The balance projection provides:

* Fast reads
* Efficient withdrawal validation

---

# 19. Financial Write Ordering

For financial operations, the application should conceptually follow:

```text
1. Validate business operation
2. Acquire required locks
3. Check idempotency
4. Create ledger entry
5. Update balance projection
6. Update business state
7. Commit transaction
```

The exact order may vary depending on the workflow, but all related operations must occur within the same transaction.

The most important invariant is:

```text
Ledger Entry
      +
Balance Projection
      +
Business State
```

must remain consistent.

---

# 20. Advance Payout Architecture

Advance payouts are processed by a background worker.

```text
Scheduler
    |
    v
Find Eligible Pending Sales
    |
    v
Process Sale
    |
    v
Check Existing Successful Advance
    |
    +---- Exists ---> Skip
    |
    +---- Not Exists
              |
              v
        Create Payout
              |
              v
       Payment Provider
              |
        +-----+-----+
        |           |
        v           v
     SUCCESS      FAILURE
        |           |
        v           v
     Ledger       Retry
        |
        v
     Balance
```

---

# 21. Advance Payout Idempotency

The system must protect against:

```text
Worker A
    |
    +---- Sale #123

Worker B
    |
    +---- Sale #123
```

Both workers may execute simultaneously.

The system must guarantee:

```text
Sale #123
    |
    +---- One successful advance
```

The preferred strategy is a database-level uniqueness invariant.

Conceptually:

```text
Unique:
Sale + Successful Advance
```

The exact database implementation is defined in the Database Design document.

The application should also check existing state before initiating the payment.

Application-level checks improve efficiency.

Database-level constraints provide the final correctness guarantee.

---

# 22. Sale Reconciliation Architecture

The reconciliation flow is:

```text
Administrator
      |
      v
API Request
      |
      v
Reconciliation Service
      |
      v
Begin Transaction
      |
      v
Lock Sale
      |
      v
Verify PENDING
      |
      v
Determine Advance
      |
      +------------------+
      |                  |
      v                  v
   APPROVED           REJECTED
      |                  |
      v                  v
Total - Advance     -Advance
      |                  |
      +--------+---------+
               |
               v
        Create Ledger
               |
               v
        Update Balance
               |
               v
        Update Sale
               |
               v
             COMMIT
```

The sale row must be protected against concurrent reconciliation requests.

---

# 23. Concurrent Reconciliation

Consider:

```text
Admin A
    |
    +---- APPROVE Sale #123


Admin B
    |
    +---- REJECT Sale #123
```

The system must not allow both operations to succeed.

The recommended strategy is:

```text
BEGIN TRANSACTION

SELECT Sale
FOR UPDATE

Verify status = PENDING

Perform reconciliation

COMMIT
```

The first transaction acquires the row lock.

The second transaction waits.

After the first transaction commits:

```text
Sale Status = APPROVED
```

The second transaction re-checks the current state and fails because the sale is no longer pending.

---

# 24. Withdrawal Architecture

A withdrawal follows:

```text
User
 |
 v
Withdrawal API
 |
 v
Withdrawal Service
 |
 v
Begin Transaction
 |
 v
Lock Account
 |
 v
Validate Balance
 |
 v
Validate 24h Rule
 |
 v
Reserve Funds
 |
 v
Create Withdrawal
 |
 v
Create Ledger Entry
 |
 v
Update Balance
 |
 v
Commit
 |
 v
Initiate Payment
 |
 v
Payment Provider
```

The key principle is that funds are reserved before the external payment request is considered successful.

This prevents multiple concurrent withdrawals from spending the same funds.

---

# 25. Withdrawal Concurrency

Consider:

```text
Balance = ₹500
```

Two requests arrive simultaneously:

```text
Request A → ₹400
Request B → ₹300
```

The application must lock the account during balance validation and reservation.

Conceptually:

```text
Transaction A
    |
    +---- Lock Account
    |
    +---- Balance = ₹500
    |
    +---- Reserve ₹400
    |
    +---- Balance = ₹100
    |
    +---- Commit


Transaction B
    |
    +---- Wait for Account Lock
    |
    +---- Read Balance = ₹100
    |
    +---- Reject ₹300
```

This guarantees that the account cannot be overspent.

---

# 26. External Payment Processing

External payment calls should not be assumed to be transactional with the database.

The system has two separate systems:

```text
Our Database
      |
      | Transaction
      v
Internal Financial State


External Provider
      |
      | Independent Operation
      v
External Payment State
```

Therefore:

```text
Database Transaction ≠ Payment Provider Transaction
```

This is a critical architectural constraint.

---

# 27. Payment State Synchronization

The system should model payment execution independently.

Example:

```text
Withdrawal
    |
    v
PROCESSING
    |
    v
Payment Attempt
    |
    v
External Provider
    |
    v
Provider Status
    |
    v
Webhook / Polling
    |
    v
Internal Status Update
```

The system should treat provider responses as external events that must be safely processed.

---

# 28. Webhook Architecture

Payment provider webhooks are handled through a dedicated endpoint.

```text
Payment Provider
      |
      v
Webhook Endpoint
      |
      v
Validate Signature
      |
      v
Extract Provider Event ID
      |
      v
Check Idempotency
      |
      +---- Already Processed ---> Return Success
      |
      +---- New Event
               |
               v
         Begin Transaction
               |
               v
       Update Payment Attempt
               |
               v
       Update Withdrawal/Payout
               |
               v
       Create Recovery if Needed
               |
               v
             COMMIT
```

Webhook processing must be idempotent.

The same provider event may be delivered multiple times.

---

# 29. Failed Withdrawal Recovery

When a withdrawal fails:

```text
Provider
    |
    v
FAILED
    |
    v
Webhook
    |
    v
Recovery Service
    |
    v
Begin Transaction
    |
    v
Check Recovery Already Created
    |
    +---- YES ---> No-op
    |
    +---- NO
          |
          v
   Create Recovery Ledger
          |
          v
   Restore Balance
          |
          v
   Mark Recovery Complete
          |
          v
        COMMIT
```

The recovery operation must be idempotent.

A unique business reference should prevent duplicate recovery entries.

---

# 30. Rolling 24-Hour Withdrawal Rule

The withdrawal restriction is based on a rolling time window.

The system must determine whether the user has an eligible previous withdrawal within the previous 24 hours.

Conceptually:

```text
Current Request
      |
      v
Find Latest Relevant Withdrawal
      |
      v
Was it within 24 hours?
      |
   +--+--+
   |     |
  YES    NO
   |     |
 Reject  Allow
```

The rule must use timestamps rather than calendar dates.

For example:

```text
Previous Withdrawal:
10 July 10:00

Current Time:
11 July 09:59

Result:
REJECT
```

At:

```text
11 July 10:00
```

the user becomes eligible again.

---

# 31. Background Scheduler

The scheduler is responsible for identifying eligible pending sales.

Conceptually:

```text
Scheduler
    |
    v
Query Eligible Sales
    |
    v
Batch
    |
    v
Process Each Sale
```

The scheduler should be designed so that repeated execution is safe.

For example:

```text
Run 1
    |
    +---- Sale A
    +---- Sale B


Run 2
    |
    +---- Sale A
    +---- Sale B
```

The second execution must not duplicate successful financial effects.

---

# 32. Scheduler Concurrency

If multiple scheduler workers are introduced:

```text
Worker A
    |
    +---- Sale #123


Worker B
    |
    +---- Sale #123
```

the system must prevent duplicate processing.

Possible strategies include:

### Strategy A: Database Locking

Use row-level locks when claiming work.

### Strategy B: Job Queue

Use a queue with job-level deduplication.

### Strategy C: Database Idempotency

Allow duplicate execution but guarantee that only one financial operation can succeed.

For this assignment, the recommended approach is:

```text
Database Idempotency
        +
Optional Row Locking
```

This provides correctness even if the scheduler behaves incorrectly.

---

# 33. Idempotency Strategy

Idempotency is implemented at multiple levels.

```text
                Idempotency
                     |
        +------------+------------+
        |            |            |
        v            v            v
 Application     Database      Webhook
    Check         Constraint    Event ID
```

Application checks provide early exits.

Database constraints provide the final guarantee.

Webhook event IDs prevent repeated provider events from being processed multiple times.

---

# 34. Database as Final Consistency Boundary

The database is the final authority for critical financial invariants.

Application code can contain:

```text
if (!alreadyProcessed) {
    process();
}
```

But this alone is unsafe under concurrency.

Two requests may both observe:

```text
alreadyProcessed = false
```

Therefore:

```text
Application Check
        +
Database Constraint
```

is required.

The database must enforce uniqueness and transactional guarantees for critical financial operations.

---

# 35. Error Handling Strategy

Errors are divided into categories.

## Business Errors

Examples:

```text
Sale already reconciled
Insufficient balance
Withdrawal restricted
Invalid sale status
```

These should return meaningful client errors.

---

## External Provider Errors

Examples:

```text
Provider timeout
Provider rejected payout
Provider unavailable
```

These should be represented in payment attempt state.

---

## System Errors

Examples:

```text
Database unavailable
Unexpected application failure
Transaction failure
```

These should trigger transaction rollback and appropriate retry or alerting mechanisms.

---

# 36. Transaction Boundaries

The following operations should be transactional.

### Sale Reconciliation

```text
Sale State
+
Ledger Entry
+
Balance Projection
```

### Withdrawal Creation

```text
Account Reservation
+
Withdrawal Record
+
Ledger Entry
+
Balance Projection
```

### Failed Withdrawal Recovery

```text
Withdrawal Failure State
+
Recovery Ledger Entry
+
Balance Restoration
```

### Advance Completion

```text
Advance Success State
+
Ledger Entry
+
Balance Projection
```

---

# 37. External Provider Boundary

External payment calls should be isolated behind an adapter.

```text
Application
     |
     v
PaymentProvider Interface
     |
     v
PaymentProviderAdapter
     |
     v
External API
```

The core domain should not know:

* Provider SDK classes
* HTTP response formats
* Provider-specific error codes

Instead, the adapter converts provider-specific behavior into normalized domain states.

---

# 38. Reliability Strategy

The system must assume that failures can occur at any point.

Examples:

```text
Database succeeds
Payment fails


Payment succeeds
Application crashes


Webhook arrives twice


Scheduler runs twice


Network timeout occurs
but provider processed payment
```

Therefore, correctness must rely on:

* Idempotency
* Persistent state
* Database constraints
* Transaction boundaries
* Provider reference IDs
* Webhook processing
* Retry-safe operations

---

# 39. Critical Failure Scenario

Consider:

```text
Application
    |
    v
Payment Provider
    |
    v
Payment SUCCESS
    |
    X
Application crashes
```

The application may not know that the payment succeeded.

Therefore, the system must not blindly retry the payment and risk duplication.

Instead, it should use:

```text
Provider Idempotency Key
        +
Provider Payment Reference
        +
Payment Status Query / Webhook
```

The exact provider implementation depends on the selected payment provider.

The architectural principle is:

> Never assume that a timeout means a payment failed.

---

# 40. Observability

The system should produce structured logs for important financial operations.

Each financial operation should be traceable using identifiers such as:

```text
userId
accountId
saleId
payoutId
withdrawalId
paymentAttemptId
ledgerEntryId
providerReferenceId
```

Example:

```text
Withdrawal Started
withdrawalId = W123
accountId = A456
amount = ₹500
```

This makes production debugging and financial dispute resolution easier.

---

# 41. Security Considerations

The system should protect:

* User financial information
* Payment provider credentials
* Webhook endpoints
* Administrative operations

Administrative reconciliation endpoints must require appropriate authorization.

Payment webhook endpoints must verify provider signatures where supported.

Secrets must be stored in environment variables or a secure secret-management system.

Sensitive information must not be written to logs.

---

# 42. Recommended Project Structure

The architectural structure is:

```text
src/
│
├── modules/
│   │
│   ├── users/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── domain/
│   │   └── routes/
│   │
│   ├── accounts/
│   │
│   ├── sales/
│   │
│   ├── payouts/
│   │
│   ├── withdrawals/
│   │
│   └── ledger/
│
├── infrastructure/
│   ├── database/
│   ├── payment-provider/
│   ├── scheduler/
│   └── logging/
│
├── shared/
│   ├── errors/
│   ├── types/
│   └── utils/
│
├── config/
│
└── app.js
```

The exact directory structure may be refined during implementation.

The important architectural constraint is that module boundaries remain clear.

---

# 43. Critical Workflow Summary

## Advance Payout

```text
Scheduler
    |
    v
Find Pending Sale
    |
    v
Check Successful Advance
    |
    v
Initiate Payment
    |
    v
Provider Success
    |
    v
Transactional Financial Update
    |
    +---- Advance Ledger
    |
    +---- Balance Projection
```

---

## Approved Reconciliation

```text
Admin
    |
    v
Lock Sale
    |
    v
Verify Pending
    |
    v
Calculate Remaining Earnings
    |
    v
Ledger + Balance
    |
    v
Mark Approved
```

---

## Rejected Reconciliation

```text
Admin
    |
    v
Lock Sale
    |
    v
Verify Pending
    |
    v
Calculate Negative Adjustment
    |
    v
Ledger + Balance
    |
    v
Mark Rejected
```

---

## Withdrawal

```text
User
    |
    v
Validate 24h Rule
    |
    v
Lock Account
    |
    v
Validate Balance
    |
    v
Reserve Funds
    |
    v
Ledger Withdrawal
    |
    v
Create Payment Attempt
    |
    v
Payment Provider
```

---

## Failed Withdrawal

```text
Payment Provider
    |
    v
Failure Webhook
    |
    v
Verify Event
    |
    v
Check Recovery Idempotency
    |
    v
Recovery Ledger
    |
    v
Restore Balance
    |
    v
Allow Future Withdrawal
```

---

# 44. Architectural Invariants

The architecture must preserve the following rules:

```text
1. Ledger is immutable and append-only.

2. Account balance is a projection, not the source of truth.

3. Every financial movement has a ledger representation.

4. Ledger and balance updates are atomic.

5. A sale has at most one successful advance.

6. A sale is reconciled at most once.

7. A withdrawal cannot overspend an account.

8. Concurrent withdrawals are serialized at the account level.

9. Failed withdrawal recovery happens exactly once.

10. Duplicate webhooks are safe.

11. Background job retries are safe.

12. External payment operations are treated as unreliable.

13. Provider timeouts are not automatically treated as payment failures.

14. Database constraints provide final protection for financial invariants.
```

---

# 45. Design Trade-offs

## Modular Monolith vs Microservices

### Decision

Use a modular monolith.

### Reason

The system benefits from strong local transactions and has no current scale requirement justifying distributed architecture.

---

## Ledger vs Balance-Only Model

### Decision

Use an append-only ledger with a balance projection.

### Reason

The ledger provides auditability and reliable financial reconstruction while the balance projection provides efficient reads.

---

## Database Idempotency vs Application Checks

### Decision

Use both.

### Reason

Application checks improve performance and user experience.

Database constraints guarantee correctness under concurrency.

---

## Synchronous vs Asynchronous Payment Processing

### Decision

Model payment processing as an asynchronous-capable workflow.

### Reason

External providers may return delayed results, webhooks, timeouts, or ambiguous states.

The system must support eventual provider status updates.

---

## Immediate Payment After Withdrawal

### Decision

Reserve funds transactionally before initiating the external payment.

### Reason

This prevents concurrent requests from spending the same funds.

The external payment itself remains outside the database transaction.

---

# 46. Future Scalability

The modular monolith can evolve if system scale increases.

Potential future architecture:

```text
                   API Gateway
                        |
        +---------------+---------------+
        |               |               |
        v               v               v
     Sales          Payouts        Withdrawals
        |               |               |
        +---------------+---------------+
                        |
                        v
                  Ledger Service
                        |
                        v
                    Database
```

However, service decomposition should happen only when justified by:

* Independent scaling requirements
* Team ownership boundaries
* Deployment independence
* Operational maturity
* Actual performance bottlenecks

The current system should prioritize correctness and simplicity.

---

# 47. Final Architecture

The final conceptual architecture is:

```text
                           CLIENTS
                              |
                              v
                    +-------------------+
                    |    REST API       |
                    +---------+---------+
                              |
                              v
                +---------------------------+
                |    APPLICATION SERVICES   |
                |                           |
                | Advance | Reconcile       |
                | Withdraw | Recovery       |
                +------------+--------------+
                             |
                             v
                +---------------------------+
                |       DOMAIN MODULES      |
                |                           |
                | Sales | Payouts | Account |
                | Ledger | Withdrawals      |
                +------------+--------------+
                             |
                +------------+-------------+
                |                          |
                v                          v
       +----------------+          +---------------+
       |   PostgreSQL   |          |    Payment    |
       |                |          |    Provider   |
       | Ledger         |          |               |
       | Accounts       |          | External API  |
       | Sales          |          | Webhooks      |
       | Withdrawals    |          +---------------+
       +----------------+
                ^
                |
                |
       +--------+--------+
       |   Scheduler     |
       | Background Job  |
       +-----------------+
```

The architecture establishes a clear separation between:

```text
Business Rules
      |
      v
Application Workflows
      |
      v
Financial Persistence
      |
      v
External Payment Systems
```

This design provides the foundation for implementing the system while preserving financial correctness under **concurrency, retries, external failures, duplicate events, and application crashes**.
