# API Design

## 1. Purpose

This document defines the HTTP API contract for the User Payout Management System.

The API provides controlled access to:

* Affiliate user payout operations
* User balance and ledger information
* Withdrawal creation
* Withdrawal recovery
* Administrator sale reconciliation
* Background advance payout processing
* Payment provider callbacks/webhooks

The API is designed around the following principles:

1. Financial operations must be atomic.
2. Financial operations must be idempotent where retries are possible.
3. Clients must never directly modify balances.
4. The ledger must remain the source of financial history.
5. Authentication and authorization must be enforced at API boundaries.
6. External payment providers must never directly manipulate internal balances.
7. API responses must expose business state without exposing internal implementation details.

---

# 2. API Style

The system exposes a REST-style HTTP API.

Base path:

```text
/api/v1
```

Example:

```text
GET /api/v1/accounts/:accountId
```

All API responses use JSON.

Example:

```json
{
  "data": {},
  "meta": {}
}
```

For errors, the API returns the standard response envelope with `success: false` and an `errors` list.

```json
{
  "success": false,
  "message": "Insufficient withdrawable balance.",
  "errors": [
    {
      "code": "INSUFFICIENT_BALANCE",
      "message": "Insufficient withdrawable balance."
    }
  ],
  "statusCode": 409,
  "meta": {}
}
```

---

# 3. API Versioning

The API uses URL-based versioning:

```text
/api/v1
```

Future breaking changes may introduce:

```text
/api/v2
```

Existing versions should remain backward compatible for their supported lifecycle.

Non-breaking changes such as adding optional response fields may be introduced without changing the API version.

---

# 4. Authentication

The API is designed for authenticated requests. In the current implementation, protected endpoints are documented as requiring authentication, even though authentication middleware is not yet included.

Example:

```http
Authorization: Bearer <access_token>
```

Authentication is responsible for identifying:

* Affiliate user
* Administrator
* Internal scheduler
* Payment provider

Different actors use different authentication mechanisms.

---

# 5. Authorization Model

The API is designed around role-based authorization. In the current implementation, actor boundaries are documented, and authorization is expected to be enforced once middleware is added.

Conceptually:

```text
AFFILIATE_USER
ADMIN
INTERNAL_SERVICE
PAYMENT_PROVIDER
```

Authorization must be enforced at the server.

The client must never be trusted to determine its own role.

---

# 6. API Actor Boundaries

The API is divided according to actors.

```text
Affiliate User
    |
    +---- Account
    +---- Ledger
    +---- Withdrawal

Administrator
    |
    +---- Sale Reconciliation

Scheduler
    |
    +---- Advance Processing

Payment Provider
    |
    +---- Payment Status Callback
```

---

# 7. Current Implemented API Endpoints

The API exposes workflow-oriented operations and financial read models. Controllers are intentionally thin: they validate requests, invoke domain workflows, and return standardized JSON responses.

### Base path

```text
/api/v1
```

### Implemented endpoints

```text
GET  /api/v1/accounts/:accountId
GET  /api/v1/accounts/:accountId/ledger
POST /api/v1/workflows/advance-payouts/run
POST /api/v1/workflows/sales/:saleId/reconcile
POST /api/v1/workflows/withdrawals
POST /api/v1/webhooks/payment-provider
```

These routes represent business operations, not generic CRUD resources.

---

# 8. Workflow-Oriented API

The service exposes business workflows rather than direct data mutations. Financial operations are coordinated inside workflow services with explicit transaction boundaries, ledger writes, and projection updates.

Example workflows:

- `POST /api/v1/workflows/advance-payouts/run`
- `POST /api/v1/workflows/sales/:saleId/reconcile`
- `POST /api/v1/workflows/withdrawals`

This keeps controllers thin and prevents business rules from being duplicated at the HTTP layer.

---

# 9. Get Current Account Projection

### Endpoint

```http
GET /api/v1/accounts/:accountId
```

### Authentication

Required.

Role:

```text
AFFILIATE_USER
```

### Purpose

Returns the account projection for an affiliate user, including withdrawable and recovery balances.

### Response

```json
{
  "success": true,
  "message": "Account fetched",
  "data": {
    "id": "acc_123",
    "currency": "INR",
    "withdrawableBalance": "68.00",
    "recoveryBalance": "0.00"
  },
  "meta": {}
}
```

Monetary values are returned as strings to avoid precision loss in clients.

---

# 10. Get Account Ledger History

### Endpoint

```http
GET /api/v1/accounts/:accountId/ledger
```

### Authentication

Required.

Role:

```text
AFFILIATE_USER
```

### Query Parameters

```text
page
limit
entryType
from
to
```

### Response

```json
{
  "success": true,
  "message": "Account ledger fetched",
  "data": [
    {
      "id": "ledger_123",
      "type": "ADVANCE",
      "amount": "4.00",
      "currency": "INR",
      "createdAt": "2026-07-18T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

Ledger entries are immutable and read-only.

---

# 11. Advance Payout Workflow

### Endpoint

```http
POST /api/v1/workflows/advance-payouts/run
```

### Authentication

Required.

Role:

```text
ADMIN
```

### Request

```json
{
  "saleId": "sale_123"
}
```

### Response

```json
{
  "success": true,
  "message": "Advance payout processed",
  "data": {
    "sale": {
      "id": "sale_123",
      "status": "PENDING"
    },
    "advancePayout": {
      "id": "advance_123",
      "saleId": "sale_123",
      "amount": "4.00",
      "currency": "INR",
      "status": "SUCCESS"
    },
    "ledgerEntry": {
      "id": "ledger_123",
      "type": "ADVANCE",
      "amount": "4.00",
      "currency": "INR",
      "referenceId": "sale_123"
    }
  },
  "meta": {}
}
```

This workflow creates a successful advance payout and records the corresponding ledger entry atomically.

---

# 12. Sale Reconciliation Workflow

### Endpoint

```http
POST /api/v1/workflows/sales/:saleId/reconcile
```

### Authentication

Required.

Role:

```text
ADMIN
```

### Request

```json
{
  "action": "approve"
}
```

or

```json
{
  "action": "reject"
}
```

### Response

```json
{
  "success": true,
  "message": "Sale approved successfully",
  "data": {
    "sale": {
      "id": "sale_123",
      "status": "APPROVED"
    },
    "ledgerEntry": {
      "id": "ledger_456",
      "type": "SETTLEMENT",
      "amount": "36.00",
      "currency": "INR",
      "referenceId": "sale_123"
    },
    "advanceAmount": "4.00",
    "settlementAmount": "36.00"
  },
  "meta": {}
}
```

For rejected sales, the response message becomes `Sale rejected successfully` and `ledgerEntry.type` is `REJECTION_ADJUSTMENT`.

The workflow enforces that only `PENDING` sales can be reconciled.

---

# 13. Create Withdrawal

### Endpoint

```http
POST /api/v1/workflows/withdrawals
```

### Authentication

Required.

Role:

```text
AFFILIATE_USER
```

### Request

```json
{
  "accountId": "acc_123",
  "userId": "user_123",
  "amount": "500.00",
  "currency": "INR",
  "idempotencyKey": "9a1f6c1e-8f0d-4d6e-9a00-123456789abc"
}
```

### Request Notes

- `accountId` and `userId` identify the withdrawal owner.
- `idempotencyKey` is provided in the body to support safe retries.
- The endpoint creates a withdrawal and a payment attempt in a single transaction.
- Final payment settlement is confirmed later by the payment provider webhook.

---

# 14. Payment Provider Webhook

### Endpoint

```http
POST /api/v1/webhooks/payment-provider
```

### Authentication

Provider-specific signature or API authentication is required.

### Request

```json
{
  "paymentAttemptId": "payment_attempt_123",
  "status": "SUCCESS",
  "failureReason": null
}
```

or

```json
{
  "paymentAttemptId": "payment_attempt_123",
  "status": "FAILED",
  "failureReason": "INSUFFICIENT_FUNDS"
}
```

### Response

```json
{
  "success": true,
  "message": "Payment succeeded",
  "data": {
    "paymentAttempt": {
      "id": "payment_attempt_123",
      "status": "SUCCESS"
    },
    "withdrawal": {
      "id": "withdrawal_123",
      "status": "SUCCESS"
    },
    "ledgerEntry": {
      "id": "ledger_789",
      "type": "WITHDRAWAL",
      "amount": "500.00"
    }
  },
  "meta": {}
}
```

Successful payment updates withdrawal state and idempotently records the withdrawal ledger entry when needed.

For failed payment attempts, the response is:

```json
{
  "success": true,
  "message": "Recovery processed",
  "data": {
    "paymentAttempt": { ... },
    "withdrawal": { ... },
    "recoveryLedgerEntry": { ... }
  },
  "meta": {}
}
```

Failed events invoke the Recovery Workflow to restore the withdrawn amount safely and only once.

### Idempotency

Webhook payloads may arrive more than once. The system ensures success and recovery effects are applied exactly once.

---

# 15. Current API Coverage

The current implementation does not include direct user profile routes or generic admin CRUD endpoints. The API surface is intentionally limited to the workflows and account read models required for the financial engine.

# 16. Future Planned Endpoints

These may be added later but are not implemented yet:

- [ ] Authenticated user profile endpoints
- [ ] Admin sales listing and detail endpoints
- [ ] Scheduler management and reporting
- [ ] Authentication middleware
- [ ] OpenAPI / Swagger documentation
- [ ] Metrics and observability

---

# 17. Error Response Contract

All errors should follow a consistent format.

Example:

```json
{
  "success": false,
  "message": "The requested withdrawal exceeds the available balance.",
  "errors": [
    {
      "code": "INSUFFICIENT_BALANCE",
      "message": "The requested withdrawal exceeds the available balance.",
      "details": {
        "requested": "500.00",
        "available": "100.00"
      }
    }
  ],
  "statusCode": 409,
  "meta": {
    "requestId": "req_123"
  }
}
```

The `requestId` allows support and engineering teams to trace failures through logs.

---

# 18. Business Error Codes

Recommended error codes include:

```text
INVALID_REQUEST
UNAUTHENTICATED
FORBIDDEN
RESOURCE_NOT_FOUND

INSUFFICIENT_BALANCE
WITHDRAWAL_LIMIT_EXCEEDED
INVALID_AMOUNT
INVALID_CURRENCY

SALE_ALREADY_RECONCILED
INVALID_SALE_STATUS
INVALID_STATE_TRANSITION

IDEMPOTENCY_KEY_REUSED
DUPLICATE_OPERATION

PAYMENT_PROVIDER_ERROR
PAYMENT_FAILED
PAYMENT_REJECTED
PAYMENT_CANCELLED

RECOVERY_ALREADY_PROCESSED
```

---

# 19. Pagination

List endpoints should support pagination.

Recommended parameters:

```text
page
limit
```

Example:

```http
?page=1&limit=20
```

The server should enforce a maximum page size.

Example:

```text
limit <= 100
```

Clients should not be allowed to request unlimited data.

---

# 20. Rate Limiting

Public endpoints should be rate limited.

Especially:

```text
POST /api/v1/workflows/withdrawals
```

and:

```text
POST /api/v1/workflows/sales/:saleId/reconcile
```

Rate limiting protects against:

* Accidental duplicate requests
* Abuse
* Brute-force attacks
* Excessive provider calls

Rate limiting is not a replacement for idempotency.

Both mechanisms are required.

---

# 21. API Security Rules

The API must enforce:

```text
Authentication
Authorization
Input Validation
Rate Limiting
Request Size Limits
HTTPS
Webhook Signature Verification
Sensitive Data Protection
Audit Logging
```

Users must never be allowed to submit:

```json
{
  "withdrawableBalance": "1000000"
}
```

The balance must always be calculated by trusted server-side logic.

---

# 24. Financial Data Exposure

The API should expose:

```text
withdrawableBalance
recoveryBalance
ledger history
withdrawal status
```

It should not expose internal implementation details such as:

```text
database transaction IDs
internal lock information
SQL queries
provider credentials
internal service tokens
```

---

# 25. API Request Lifecycle

A typical authenticated request follows:

```text
HTTP Request
     |
     v
API Gateway / Server
     |
     v
Authentication
     |
     v
Authorization
     |
     v
Request Validation
     |
     v
Application Service
     |
     v
Domain Rules
     |
     v
Database Transaction
     |
     v
Ledger + Projection
     |
     v
Response
```

External provider calls should occur outside database transactions unless the provider explicitly supports transactional coordination.

---

# 26. Withdrawal Architecture

The recommended withdrawal flow is:

```text
Client
  |
  | POST /withdrawals
  v
API
  |
  v
Withdrawal Service
  |
  +---- Lock Account
  |
  +---- Validate Balance
  |
  +---- Create Withdrawal
  |
  +---- Ledger: -₹500
  |
  +---- Balance: ₹1000 → ₹500
  |
  +---- COMMIT
  |
  v
Payment Provider
  |
  v
Webhook
  |
  +---- SUCCESS
  |
  +---- FAILED
  |
  +---- CANCELLED
  |
  +---- REJECTED
```

This separates internal financial commitment from unreliable external execution.

---

# 27. Advance Payout Architecture

```text
Scheduler
    |
    v
Internal API
    |
    v
Advance Service
    |
    v
Check Sale Eligibility
    |
    v
Check Successful Advance
    |
    +---- Exists → Skip
    |
    +---- Missing
            |
            v
        Create Advance
            |
            v
        Ledger: +10%
            |
            v
        Update Balance
            |
            v
        Payment Attempt
            |
            v
        Provider
```

The unique database constraint guarantees that duplicate scheduler executions cannot create duplicate successful advance financial effects.

---

# 28. Reconciliation Architecture

```text
Admin
  |
  | POST /sales/{id}/reconcile
  v
API
  |
  v
Reconciliation Service
  |
  v
Lock Sale
  |
  v
Verify PENDING
  |
  v
Calculate Adjustment
  |
  +---- APPROVED
  |       |
  |       +---- Total - Advance
  |
  +---- REJECTED
          |
          +---- -Advance
  |
  v
Create Ledger Entry
  |
  v
Update Balance Projection
  |
  v
Update Sale Status
  |
  v
COMMIT
```

---

# 29. API Idempotency Matrix

| Operation           | Idempotency Mechanism                |
| ------------------- | ------------------------------------ |
| Create Withdrawal   | Client `Idempotency-Key`             |
| Advance Processing  | Unique successful advance constraint |
| Sale Reconciliation | Sale row lock + state check          |
| Withdrawal Recovery | Unique recovery ledger entry         |
| Provider Webhook    | Unique provider event ID             |
| Payment Attempt     | Unique provider idempotency key      |

This ensures every retryable operation has a defined duplicate-protection mechanism.

---

# 22. API Responsibility Boundaries

The API layer is responsible for:

```text
Authentication
Authorization
Input Validation
HTTP Mapping
Error Mapping
Request Idempotency
```

The application service layer is responsible for:

```text
Business Rules
Transaction Coordination
State Transitions
Ledger Operations
Balance Projection
```

The repository layer is responsible for:

```text
Database Queries
Locks
Constraints
Persistence
```

The payment integration layer is responsible for:

```text
Provider API Calls
Provider Authentication
Provider Response Mapping
Provider Webhook Verification
```

This prevents business logic from leaking into HTTP controllers.

---

# 23. Recommended API Endpoint Summary

```text
AFFILIATE USER

GET  /api/v1/accounts/:accountId
GET  /api/v1/accounts/:accountId/ledger
POST /api/v1/workflows/withdrawals

ADMIN

POST /api/v1/workflows/advance-payouts/run
POST /api/v1/workflows/sales/:saleId/reconcile

PAYMENT PROVIDER

POST /api/v1/webhooks/payment-provider
```

---

# 30. Final API Design Principles

The API follows these rules:

```text
1. Clients request business operations.
2. Clients never directly modify financial state.
3. Financial state changes happen inside application services.
4. Financial changes are recorded in the ledger.
5. Balance projections are updated atomically.
6. Every retryable operation has an idempotency mechanism.
7. External payment providers are treated as unreliable.
8. Webhooks are authenticated and idempotently processed.
9. Concurrent operations are protected by database locking.
10. Invalid state transitions are rejected.
11. Authorization is enforced server-side.
12. Monetary values are returned as precise strings.
13. API contracts remain independent of database implementation.
14. Internal implementation details are never exposed to clients.
```

The final API architecture is therefore:

```text
                     HTTP API
                        |
                        v
                    Controllers
                        |
                        v
                     Workflows
                        |
                        v
               Application / Domain Services
                        |
                        v
                   Repositories / ORM
                        |
          +-------------+-------------+
          |                           |
          v                           v
      PostgreSQL                Payment Provider
          |                           |
          v                           v
        Ledger                    Webhooks
          |
          v
    Account Projection
```

The API acts as the **boundary of the system**, while the application service layer owns the business operations and the database enforces the financial invariants.

This separation allows the system to evolve internally without breaking the external API contract.

