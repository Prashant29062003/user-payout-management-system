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
GET /api/v1/users/me/account
```

All API responses use JSON.

Example:

```json
{
  "data": {},
  "meta": {}
}
```

For errors:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient withdrawable balance."
  }
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

All authenticated endpoints require a valid authentication token.

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

The API uses role-based authorization.

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

# 7. Affiliate User APIs

Affiliate users can:

* View account balance
* View ledger history
* View their sales
* Create withdrawals
* View withdrawal status

Users cannot:

* Modify balances directly
* Create ledger entries directly
* Approve sales
* Reject sales
* Trigger arbitrary advance payouts
* Mark payment attempts successful

---

# 8. Get Current Account

### Endpoint

```http
GET /api/v1/users/me/account
```

### Authentication

Required.

Role:

```text
AFFILIATE_USER
```

### Purpose

Returns the user's current financial account projection.

### Response

```json
{
  "data": {
    "accountId": "acc_123",
    "currency": "INR",
    "withdrawableBalance": "68.00",
    "recoveryBalance": "0.00"
  }
}
```

The API returns monetary values as strings to avoid precision loss in clients.

---

# 9. Get Ledger History

### Endpoint

```http
GET /api/v1/users/me/ledger
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

Example:

```http
GET /api/v1/users/me/ledger?page=1&limit=20
```

### Response

```json
{
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

Ledger entries are read-only.

Users cannot modify or delete ledger records.

---

# 10. Get User Sales

### Endpoint

```http
GET /api/v1/users/me/sales
```

### Authentication

Required.

Role:

```text
AFFILIATE_USER
```

### Query Parameters

```text
status
page
limit
```

Example:

```http
GET /api/v1/users/me/sales?status=PENDING
```

### Response

```json
{
  "data": [
    {
      "id": "sale_123",
      "totalEarnings": "40.00",
      "currency": "INR",
      "status": "PENDING",
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

Users can only access their own sales.

The API must never allow:

```http
GET /api/v1/users/other-user-id/sales
```

unless explicitly authorized for administrative use.

---

# 11. Create Withdrawal

### Endpoint

```http
POST /api/v1/users/me/withdrawals
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
  "amount": "500.00",
  "currency": "INR"
}
```

### Required Headers

```http
Authorization: Bearer <access_token>
Idempotency-Key: <unique-request-key>
```

---

# 12. Withdrawal Validation

The server validates:

1. User is authenticated.
2. User owns the account.
3. Currency matches account currency.
4. Amount is positive.
5. Amount does not exceed withdrawable balance.
6. User has not violated the 24-hour withdrawal restriction.
7. Request is not already processed using the same idempotency key.

The client cannot bypass any of these checks.

---

# 13. Withdrawal Creation Flow

The withdrawal API performs:

```text
Request
   |
   v
Authenticate User
   |
   v
Validate Request
   |
   v
Lock Account
   |
   v
Validate Balance
   |
   v
Validate 24-Hour Rule
   |
   v
Create Withdrawal
   |
   v
Create Withdrawal Ledger Entry
   |
   v
Decrease Withdrawable Balance
   |
   v
Commit Transaction
   |
   v
Create / Trigger Payment Attempt
   |
   v
Return Response
```

The account lock and financial ledger operation must occur in one database transaction.

---

# 14. Withdrawal Response

Successful creation:

```http
HTTP 201 Created
```

Example:

```json
{
  "data": {
    "withdrawalId": "withdrawal_123",
    "amount": "500.00",
    "currency": "INR",
    "status": "PROCESSING"
  }
}
```

The API must not claim success before the external payment provider confirms successful transfer.

---

# 15. Withdrawal Idempotency

The `Idempotency-Key` header is mandatory for withdrawal creation.

Example:

```http
Idempotency-Key: 9a1f6c1e-8f0d-4d6e-9a00-123456789abc
```

If the same key is submitted again:

```text
Same User
Same Idempotency Key
Same Request
```

the API must return the original operation result instead of creating another withdrawal.

Example:

```text
Request A
    |
    +---- Withdrawal W1


Request B
    |
    +---- Same Idempotency-Key
    |
    +---- Return W1
```

No second ledger entry is created.

No second withdrawal is created.

---

# 16. Idempotency-Key Rules

An idempotency key must be unique within the scope of the authenticated user and operation.

Conceptually:

```text
(user_id, operation_type, idempotency_key)
```

must be unique.

The system should also store a request fingerprint.

Example:

```text
User
Operation
Idempotency Key
Request Body Hash
Response
```

If a client reuses the same key with a different amount:

```json
{
  "amount": "1000.00"
}
```

the API should return:

```http
409 Conflict
```

with:

```json
{
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSED",
    "message": "The idempotency key was already used with a different request."
  }
}
```

---

# 17. Get Withdrawal

### Endpoint

```http
GET /api/v1/users/me/withdrawals/{withdrawalId}
```

### Authentication

Required.

### Authorization

The user must own the withdrawal.

### Response

```json
{
  "data": {
    "id": "withdrawal_123",
    "amount": "500.00",
    "currency": "INR",
    "status": "PROCESSING",
    "createdAt": "2026-07-18T10:00:00Z"
  }
}
```

---

# 18. Get Withdrawal History

### Endpoint

```http
GET /api/v1/users/me/withdrawals
```

### Query Parameters

```text
status
page
limit
from
to
```

### Response

```json
{
  "data": [
    {
      "id": "withdrawal_123",
      "amount": "500.00",
      "currency": "INR",
      "status": "SUCCESS",
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

---

# 19. Administrator APIs

Administrators can:

* View pending sales
* View sale details
* Approve sales
* Reject sales
* Reconcile sales

Administrators cannot:

* Directly modify account balances
* Directly create ledger entries
* Manually mark withdrawals successful
* Bypass ledger transactions

---

# 20. List Pending Sales

### Endpoint

```http
GET /api/v1/admin/sales?status=PENDING
```

### Authentication

Required.

Role:

```text
ADMIN
```

### Response

```json
{
  "data": [
    {
      "id": "sale_123",
      "userId": "user_123",
      "totalEarnings": "40.00",
      "currency": "INR",
      "status": "PENDING",
      "createdAt": "2026-07-18T10:00:00Z"
    }
  ]
}
```

---

# 21. Get Sale Details

### Endpoint

```http
GET /api/v1/admin/sales/{saleId}
```

### Authentication

Required.

Role:

```text
ADMIN
```

The response may include:

* Sale information
* User information
* Advance payout information
* Payment attempt information
* Current reconciliation state

---

# 22. Reconcile Sale

### Endpoint

```http
POST /api/v1/admin/sales/{saleId}/reconcile
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
  "status": "APPROVED"
}
```

or:

```json
{
  "status": "REJECTED"
}
```

---

# 23. Reconciliation Rules

The API accepts only:

```text
APPROVED
REJECTED
```

The current sale must be:

```text
PENDING
```

If the sale is already:

```text
APPROVED
```

or:

```text
REJECTED
```

the API must reject the request.

Example:

```http
409 Conflict
```

Response:

```json
{
  "error": {
    "code": "SALE_ALREADY_RECONCILED",
    "message": "This sale has already been reconciled."
  }
}
```

---

# 24. Reconciliation Concurrency

Two administrators may attempt to reconcile the same sale concurrently.

Example:

```text
Admin A
   |
   +---- APPROVE


Admin B
   |
   +---- REJECT
```

The system must guarantee that only one operation succeeds.

The implementation uses:

```text
SELECT ... FOR UPDATE
```

The first transaction locks the sale.

The second transaction waits.

After the first transaction commits:

```text
Sale Status != PENDING
```

The second transaction fails safely.

---

# 25. Approved Sale Response

Example:

```json
{
  "data": {
    "saleId": "sale_123",
    "status": "APPROVED",
    "totalEarnings": "40.00",
    "advancePaid": "4.00",
    "finalAdjustment": "36.00"
  }
}
```

The financial operation must be completed atomically before returning success.

---

# 26. Rejected Sale Response

Example:

```json
{
  "data": {
    "saleId": "sale_123",
    "status": "REJECTED",
    "totalEarnings": "40.00",
    "advancePaid": "4.00",
    "recoveryAmount": "4.00"
  }
}
```

The API does not expose internal implementation details about how the recovery is applied.

---

# 27. Scheduler APIs

The scheduler is an internal system component.

It must not use public user authentication.

A dedicated internal authentication mechanism should be used.

Possible options include:

```text
Internal API Key
Service-to-Service JWT
mTLS
Private Network Authentication
```

For the assignment, a service-to-service API key is sufficient.

---

# 28. Process Advance Payouts

### Endpoint

```http
POST /api/v1/internal/advance-payouts/process
```

### Authentication

Required.

Role:

```text
INTERNAL_SERVICE
```

### Purpose

Processes eligible pending sales.

The scheduler should not directly calculate arbitrary balances.

The application service determines eligibility.

---

# 29. Scheduler Processing Flow

```text
Scheduler
   |
   v
Find Eligible Pending Sales
   |
   v
For Each Sale
   |
   v
Check Successful Advance Exists
   |
   +---- YES ---> Skip
   |
   +---- NO ----> Create Advance
                      |
                      v
                 Create Ledger Entry
                      |
                      v
                 Update Balance
                      |
                      v
                 Create Payment Attempt
```

The advance operation must be idempotent.

The database constraint remains the final protection against duplicate advances.

---

# 30. Scheduler Response

Example:

```json
{
  "data": {
    "processed": 100,
    "successful": 95,
    "skipped": 4,
    "failed": 1
  }
}
```

The scheduler should process failures independently.

One failed sale must not cause the entire batch to fail.

---

# 31. Payment Provider Webhook

### Endpoint

```http
POST /api/v1/webhooks/payment-provider
```

### Authentication

Provider-specific signature verification is required.

The API must verify:

* Signature
* Timestamp
* Provider event ID
* Event authenticity

---

# 32. Webhook Request

Example:

```json
{
  "eventId": "evt_123",
  "paymentReference": "pay_123",
  "status": "FAILED",
  "reason": "INSUFFICIENT_FUNDS",
  "occurredAt": "2026-07-18T10:00:00Z"
}
```

The actual provider payload may differ.

The application should normalize provider-specific payloads into an internal event model.

---

# 33. Webhook Idempotency

Payment providers may send the same webhook multiple times.

Example:

```text
Webhook A
    |
    +---- FAILED


Webhook B
    |
    +---- FAILED


Webhook C
    |
    +---- FAILED
```

The system must process the financial effect exactly once.

The provider event ID should be persisted.

Conceptually:

```text
provider
event_id
processed_at
```

must be unique.

---

# 34. Failed Withdrawal Recovery

When a withdrawal receives:

```text
FAILED
CANCELLED
REJECTED
```

the system must:

```text
1. Lock withdrawal
2. Verify current state
3. Update payment attempt
4. Mark withdrawal failed
5. Check recovery already processed
6. Create WITHDRAWAL_RECOVERY ledger entry
7. Restore available funds
8. Update account projection
9. Commit
```

The recovery operation must be idempotent.

---

# 35. Webhook Success

If the provider reports:

```text
SUCCESS
```

the system must:

```text
1. Lock payment attempt
2. Verify current state
3. Mark payment attempt SUCCESS
4. Mark withdrawal SUCCESS
5. Do not create another withdrawal ledger entry
6. Commit
```

The original withdrawal ledger entry already represents the debit.

The provider's success notification does not create another financial debit.

---

# 36. Invalid State Transitions

The API must reject invalid state transitions.

Examples:

```text
APPROVED → REJECTED
REJECTED → APPROVED
SUCCESS → FAILED
FAILED → SUCCESS
```

unless explicitly supported by the state machine.

Invalid transitions should return:

```http
409 Conflict
```

Example:

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "The requested state transition is not allowed."
  }
}
```

---

# 37. Standard HTTP Status Codes

The API uses:

| Status | Meaning                              |
| ------ | ------------------------------------ |
| `200`  | Successful read/update               |
| `201`  | Resource created                     |
| `202`  | Accepted for asynchronous processing |
| `400`  | Invalid request                      |
| `401`  | Unauthenticated                      |
| `403`  | Unauthorized                         |
| `404`  | Resource not found                   |
| `409`  | Business rule or state conflict      |
| `422`  | Validation failure                   |
| `429`  | Rate limit exceeded                  |
| `500`  | Internal server error                |
| `502`  | External provider failure            |
| `503`  | Service unavailable                  |

---

# 38. Error Response Contract

All errors should follow a consistent format.

Example:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "The requested withdrawal exceeds the available balance.",
    "details": {
      "requested": "500.00",
      "available": "100.00"
    },
    "requestId": "req_123"
  }
}
```

The `requestId` allows support and engineering teams to trace failures through logs.

---

# 39. Business Error Codes

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

# 40. Pagination

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

# 41. Rate Limiting

Public endpoints should be rate limited.

Especially:

```text
POST /users/me/withdrawals
```

and:

```text
POST /admin/sales/{id}/reconcile
```

Rate limiting protects against:

* Accidental duplicate requests
* Abuse
* Brute-force attacks
* Excessive provider calls

Rate limiting is not a replacement for idempotency.

Both mechanisms are required.

---

# 42. API Security Rules

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

# 43. Financial Data Exposure

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

# 44. API Request Lifecycle

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

# 45. Withdrawal Architecture

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

# 46. Advance Payout Architecture

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

# 47. Reconciliation Architecture

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

# 48. API Idempotency Matrix

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

# 49. API Responsibility Boundaries

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

# 50. Recommended API Endpoint Summary

```text
AFFILIATE USER

GET    /api/v1/users/me/account
GET    /api/v1/users/me/ledger
GET    /api/v1/users/me/sales
GET    /api/v1/users/me/withdrawals
GET    /api/v1/users/me/withdrawals/{id}
POST   /api/v1/users/me/withdrawals


ADMIN

GET    /api/v1/admin/sales
GET    /api/v1/admin/sales/{id}
POST   /api/v1/admin/sales/{id}/reconcile


INTERNAL SCHEDULER

POST   /api/v1/internal/advance-payouts/process


PAYMENT PROVIDER

POST   /api/v1/webhooks/payment-provider
```

---

# 51. Final API Design Principles

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
          +------------+------------+
          |            |            |
          v            v            v
       Affiliate      Admin      Internal
          |            |          Scheduler
          |            |            |
          +------------+------------+
                       |
                       v
              Application Services
                       |
          +------------+------------+
          |                         |
          v                         v
      PostgreSQL              Payment Provider
          |                         |
          v                         v
       Ledger                   Webhooks
          |
          v
    Account Projection
```

The API acts as the **boundary of the system**, while the application service layer owns the business operations and the database enforces the financial invariants.

This separation allows the system to evolve internally without breaking the external API contract.
