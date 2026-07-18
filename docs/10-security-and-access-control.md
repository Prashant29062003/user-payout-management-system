# Security and Access Control

## 1. Purpose

This document defines the security model for the User Payout Management System.

The system handles:

* User identity
* Financial balances
* Sales and commission information
* Payout operations
* Payment-provider integrations
* Administrative reconciliation
* Financial recovery operations

Security is therefore treated as a core system invariant rather than an additional feature.

The primary objective is:

> **No user or system component may perform a financial operation beyond the permissions explicitly granted to it.**

The security architecture must protect against:

* Unauthorized access
* Privilege escalation
* Cross-user data access
* Unauthorized financial operations
* Duplicate requests
* Replay attacks
* Webhook forgery
* Credential theft
* Sensitive-data leakage
* Abuse and excessive requests

---

# 2. Security Principles

The system follows these principles:

1. Authenticate every protected request.
2. Authorize every sensitive operation.
3. Enforce authorization on the server.
4. Never trust client-provided ownership information.
5. Apply least-privilege access.
6. Separate user and administrator permissions.
7. Protect all financial operations with database constraints.
8. Treat external webhooks as untrusted until verified.
9. Never expose secrets to clients.
10. Never log sensitive credentials.
11. Preserve an audit trail for privileged financial actions.
12. Fail closed when authorization cannot be determined.

The system must prefer:

```text
DENY
```

over:

```text
ALLOW
```

when security information is incomplete or unavailable.

---

# 3. Actors and Security Boundaries

The system contains four primary actors.

```text
Affiliate User
Administrator
Background Job
Payment Provider
```

Each actor operates within a different security boundary.

### Affiliate User

Can:

* View their own account
* View their own sales
* View their own ledger
* View their own withdrawals
* Initiate withdrawals within business rules

Cannot:

* View another user's financial data
* Reconcile sales
* Create ledger entries
* Modify account balances
* Trigger recovery
* Change payment-provider results

---

### Administrator

Can:

* View authorized operational data
* Reconcile sales
* Approve sales
* Reject sales
* Investigate payout failures
* Perform authorized operational actions

Cannot:

* Directly modify balances
* Delete ledger entries
* Bypass financial invariants
* Create arbitrary financial adjustments without an auditable operation

---

### Background Job

Can:

* Process eligible advances
* Process scheduled reconciliation tasks
* Process recovery tasks
* Run financial reconciliation

Cannot:

* Bypass database constraints
* Create arbitrary financial operations
* Modify data outside its assigned responsibility

---

### Payment Provider

Can:

* Receive payment requests
* Return payment results
* Send authenticated webhook events

Cannot:

* Directly access the application's database
* Modify balances directly
* Create arbitrary ledger entries

---

# 4. Authentication

All protected API endpoints require authentication.

The authentication mechanism may use:

```text
JWT
Session-based authentication
OAuth/OIDC
```

The exact implementation is outside the domain model, but the application must expose a normalized authenticated identity to the authorization layer.

Example:

```text
Request
   ↓
Authentication Middleware
   ↓
Verify Credentials
   ↓
Resolve User Identity
   ↓
Attach Authenticated Principal
   ↓
Authorization
   ↓
Controller
```

Authentication must happen before authorization.

---

# 5. Authenticated Principal

The application should represent the authenticated caller as a normalized principal.

Example:

```text
Principal
├── userId
├── role
├── permissions
└── authenticationContext
```

Business logic should not directly depend on raw JWT claims or session internals.

Instead:

```text
HTTP Request
      ↓
Authentication Layer
      ↓
Authenticated Principal
      ↓
Authorization Layer
      ↓
Application Service
```

This keeps authentication implementation separate from business logic.

---

# 6. Role-Based Access Control

The system uses Role-Based Access Control.

Primary roles:

```text
AFFILIATE_USER
ADMIN
SYSTEM_WORKER
WEBHOOK_PROVIDER
```

Roles define broad permissions.

Fine-grained authorization should still be applied at the resource level.

---

# 7. Permission Matrix

| Operation                       | Affiliate User |          Admin | System Worker | Payment Provider |
| ------------------------------- | -------------: | -------------: | ------------: | ---------------: |
| View own account                |            Yes | No/Operational |            No |               No |
| View own sales                  |            Yes |            Yes |            No |               No |
| View own ledger                 |            Yes |    Operational |            No |               No |
| Create withdrawal               |            Yes |             No |            No |               No |
| View withdrawal                 |       Own only |            Yes |           Yes |               No |
| Reconcile sale                  |             No |            Yes |            No |               No |
| Process advance                 |             No |             No |           Yes |               No |
| Process recovery                |             No |             No |           Yes |               No |
| Send payment result             |             No |             No |            No |              Yes |
| Modify ledger directly          |             No |             No |            No |               No |
| Modify account balance directly |             No |             No |            No |               No |

The exact permission set may evolve, but financial invariants must remain unchanged.

---

# 8. Resource-Level Authorization

Role checks alone are insufficient.

Example:

```text
User A
   ↓
GET /api/v1/accounts/:accountId/ledger
```

Even if User A is authenticated, the request must be rejected.

The application must verify:

```text
requestedUserId == authenticatedUserId
```

unless the caller has an explicitly authorized administrative role.

This prevents horizontal privilege escalation.

---

# 9. Ownership Enforcement

The server must derive resource ownership from authenticated identity.

Unsafe:

```text
POST /api/v1/workflows/withdrawals

{
    "userId": "user_B",
    "amount": "500"
}
```

The server must not trust the `userId` supplied by the client.

Instead:

```text
Authenticated Principal
        ↓
userId = user_A
        ↓
Create Withdrawal
        ↓
Withdrawal.userId = user_A
```

The client should not control ownership of financial resources.

---

# 10. User Data Isolation

Affiliate users may access only their own financial information.

Protected resources include:

```text
Account
Sales
Ledger Entries
Withdrawals
Payment Attempts
```

Every query must enforce ownership.

Conceptually:

```sql
SELECT *
FROM withdrawals
WHERE id = :withdrawalId
AND user_id = :authenticatedUserId;
```

Not:

```sql
SELECT *
FROM withdrawals
WHERE id = :withdrawalId;
```

followed by authorization checks that may be forgotten elsewhere.

Authorization should be enforced as close to the data access boundary as practical.

---

# 11. Preventing IDOR

The system must protect against Insecure Direct Object Reference attacks.

Example attack:

```text
User A:
GET /api/v1/accounts/:accountId/ledger
```

The API must not return User B's withdrawal.

The response should preferably avoid revealing whether the resource belongs to another user.

Depending on the API contract:

```text
404 Not Found
```

may be returned to avoid resource enumeration.

---

# 12. Administrator Authorization

Administrative operations require explicit administrative permissions.

Examples:

```text
Reconcile Sale
View All Users
Investigate Failed Withdrawals
View Operational Financial Data
```

The system must not rely solely on frontend controls.

Unsafe:

```text
Frontend:
Hide "Reject Sale" button
```

Secure:

```text
Backend:
Verify ADMIN permission
```

Frontend restrictions improve user experience.

Backend authorization provides security.

---

# 13. Admin Financial Boundaries

Administrators must not directly manipulate financial state.

Forbidden:

```text
UPDATE accounts
SET withdrawable_balance = 100000
```

Forbidden:

```text
DELETE FROM ledger_entries
```

If a financial correction is required, the administrator must trigger an approved business operation.

Example:

```text
Admin Action
    ↓
Authorized Application Service
    ↓
Validation
    ↓
Ledger Entry
    ↓
Account Projection
    ↓
Audit Log
```

This preserves financial integrity.

---

# 14. Background Worker Security

Background workers are trusted internal components but must still follow least privilege.

A worker should have only the permissions required for its task.

For example:

```text
Advance Worker
```

should not automatically have permission to:

```text
Change User Roles
Delete Users
Modify Authentication
```

Worker credentials must be separate from user credentials.

---

# 15. Payment Provider Webhook Security

Payment-provider webhooks are external requests and must be treated as untrusted.

Every webhook must be authenticated.

Recommended mechanisms include:

```text
HMAC Signature
Asymmetric Signature
Provider-Signed Headers
```

The system must verify:

```text
Signature
Timestamp
Event ID
Provider Identifier
```

before processing the event.

---

# 16. Webhook Signature Verification

The verification process should be:

```text
Webhook Request
       ↓
Read Raw Payload
       ↓
Extract Signature
       ↓
Verify Signature
       ↓
Validate Timestamp
       ↓
Validate Event Structure
       ↓
Process Event
```

The application must verify the signature against the raw request body where required by the provider.

Parsing or transforming the payload before signature verification may invalidate the signature.

---

# 17. Replay Attack Protection

A valid webhook may still be maliciously replayed.

The system must protect against duplicate or old events.

Recommended protections:

```text
Provider Event ID
+
Unique Database Constraint
+
Timestamp Validation
```

Example:

```text
UNIQUE(provider, provider_event_id)
```

If the same event is received twice:

```text
First Event
    ↓
Process
    ↓
Mark Processed

Second Event
    ↓
Already Exists
    ↓
No Financial Effect
```

---

# 18. Webhook Idempotency

Webhook processing must be idempotent.

Example:

```text
Webhook:
withdrawal.failed
```

Received:

```text
1st time → Recovery created
2nd time → No new recovery
3rd time → No new recovery
```

The database must enforce the invariant.

Application-level checks alone are insufficient.

---

# 19. Idempotency Key Security

Idempotency keys are used to protect client financial operations.

Example:

```text
Idempotency-Key:
wd_request_123
```

The key must be associated with:

```text
Authenticated User
Endpoint
Operation
Request Payload
```

A key generated by User A must not be usable by User B.

---

# 20. Idempotency Key Reuse

If the same idempotency key is reused with a different request:

```text
First:
amount = ₹500

Second:
amount = ₹1000
```

the system must reject the second request.

Example:

```text
409 Conflict
```

Error:

```json
{
  "error": {
    "code": "IDEMPOTENCY_KEY_REUSED",
    "message": "The idempotency key was already used with a different request"
  }
}
```

This prevents accidental or malicious key reuse.

---

# 21. Idempotency Response Handling

For a repeated request with the same:

```text
User
+
Endpoint
+
Idempotency Key
+
Equivalent Request
```

the API should return the original operation result.

Example:

```text
First Request
     ↓
Withdrawal Created
     ↓
Response Stored

Second Request
     ↓
Same Idempotency Key
     ↓
Return Original Response
```

No second withdrawal is created.

---

# 22. Authorization Before Idempotency Replay

The system must verify that the caller is authorized before returning an idempotent response.

This prevents one user from using another user's idempotency key to retrieve financial information.

Correct order:

```text
Authenticate
    ↓
Authorize
    ↓
Resolve Idempotency Key
    ↓
Return Existing Result
```

Not:

```text
Idempotency Key
    ↓
Return Result
```

---

# 23. Input Validation

All external input must be validated.

Validation applies to:

```text
Request Body
Query Parameters
Path Parameters
Headers
Webhook Payloads
```

Validation must occur before business logic.

The system should reject:

```text
Unexpected fields
Invalid formats
Invalid amounts
Invalid identifiers
Oversized payloads
Malformed JSON
```

---

# 24. Monetary Input Validation

Money must never be represented internally using floating-point numbers.

Use:

```text
Decimal
```

or:

```text
Integer Minor Units
```

Example:

```text
₹500.00
```

may be represented as:

```text
50000 paise
```

or an exact decimal type.

API responses should use strings:

```json
{
  "amount": "500.00"
}
```

This prevents precision errors.

---

# 25. Amount Validation

The system must validate:

```text
Amount > 0
Amount has valid precision
Amount is within allowed limits
Currency is supported
```

Example:

```text
₹500.123
```

should be rejected if the supported currency uses two decimal places.

---

# 26. SQL Injection Protection

The system must never construct SQL using raw user input.

Unsafe:

```text
"SELECT * FROM users WHERE id = '" + userId + "'"
```

Use:

```text
Parameterized Queries
Prepared Statements
ORM Query Parameters
```

The database layer must treat all external values as data.

---

# 27. Mass Assignment Protection

The application must explicitly define which fields clients can modify.

Unsafe:

```json
{
  "role": "ADMIN",
  "withdrawableBalance": "1000000"
}
```

The API must ignore or reject protected fields.

Financial and security-sensitive fields must never be directly client-writable.

Examples:

```text
role
withdrawable_balance
recovery_balance
ledger entries
payment status
sale status
```

These must only change through authorized application workflows.

---

# 28. Secrets Management

Secrets must never be stored in source code.

Examples:

```text
Database Password
JWT Secret
Payment Provider API Key
Webhook Secret
Encryption Keys
```

Secrets should be provided through:

```text
Environment Variables
Secret Manager
Vault
Cloud Secret Management
```

The exact mechanism depends on deployment infrastructure.

---

# 29. Secret Rotation

Secrets should support rotation.

The system should have a process for rotating:

```text
Payment Provider Keys
Webhook Secrets
Database Credentials
Authentication Secrets
```

Rotation must not require exposing secrets in source code.

---

# 30. Payment Provider Credentials

Provider credentials must be stored securely.

The frontend must never receive:

```text
Provider API Secret
Provider Private Key
Webhook Secret
```

Only the backend may communicate with the provider using privileged credentials.

---

# 31. Encryption

Sensitive data should be protected:

```text
In Transit
At Rest
```

All external communication must use:

```text
HTTPS / TLS
```

Database encryption at rest should be enabled where supported by the infrastructure.

---

# 32. Sensitive Data Minimization

The system should store only data required for business operations.

Avoid storing unnecessary:

```text
Payment credentials
Card data
Authentication secrets
Personal information
```

If payment details are required, use provider tokenization rather than storing raw financial credentials.

---

# 33. Logging Security

Logs must not contain secrets.

Never log:

```text
Passwords
JWT Tokens
API Keys
Webhook Secrets
Private Keys
```

Avoid logging complete sensitive financial data unless required for auditing.

Use identifiers instead:

```text
user_id
withdrawal_id
sale_id
correlation_id
```

---

# 34. Audit Logging

Privileged actions must generate audit records.

Examples:

```text
Admin reconciles sale
Admin rejects sale
Admin approves sale
Recovery manually triggered
Security configuration changed
```

Audit records should include:

```text
actor_id
actor_role
action
entity_type
entity_id
timestamp
request_id
result
```

Example:

```text
Admin:
admin_123

Action:
RECONCILE_SALE

Sale:
sale_456

Result:
APPROVED

Request:
req_789
```

Audit logs must be append-only.

---

# 35. Audit Log vs Financial Ledger

These serve different purposes.

### Financial Ledger

Answers:

```text
What happened to the money?
```

### Audit Log

Answers:

```text
Who performed the action?
```

Example:

```text
Audit:
Admin 123 rejected Sale 456

Ledger:
-₹4 REJECTION_ADJUSTMENT
```

Both may be required.

They must not be treated as interchangeable.

---

# 36. Security Event Monitoring

The system should monitor suspicious events.

Examples:

```text
Repeated failed authentication
Multiple withdrawal attempts
High request frequency
Repeated idempotency conflicts
Invalid webhook signatures
Unauthorized admin access attempts
```

Security alerts should be generated when thresholds are exceeded.

---

# 37. Rate Limiting

Sensitive endpoints must be rate-limited.

Examples:

```text
POST /api/v1/workflows/withdrawals
POST /api/v1/workflows/sales/:saleId/reconcile
POST /api/v1/webhooks/payment-provider
```

Rate limits should be applied based on appropriate identifiers:

```text
IP
Authenticated User
API Key
Endpoint
```

Rate limiting must not replace authentication or authorization.

---

# 38. Withdrawal Abuse Prevention

The withdrawal flow must enforce:

```text
One withdrawal per rolling 24 hours
```

The restriction must be enforced server-side.

The client cannot bypass it by:

```text
Changing device
Changing browser
Changing IP
Changing request ID
```

The server determines eligibility using the user's account and withdrawal history.

---

# 39. Recovery Withdrawal Exception

A failed withdrawal recovery may allow the user to withdraw recovered funds without waiting for the normal 24-hour window.

This exception must be explicitly controlled.

Example:

```text
Normal Withdrawal
    ↓
24-hour restriction applies

Failed Withdrawal Recovery
    ↓
Recovery Credit
    ↓
Eligible Recovery Withdrawal
    ↓
24-hour restriction bypassed
```

The bypass must apply only to the recovered amount.

It must not allow unlimited withdrawals.

---

# 40. Recovery Authorization

The system must ensure the recovered amount is linked to the original failed withdrawal.

Example:

```text
Withdrawal:
wd_123

Recovery:
₹500

Recovery Withdrawal:
Maximum = ₹500
```

The user must not be able to claim:

```text
₹500 recovered
```

and then withdraw:

```text
₹1000
```

The recovery amount must be enforced by the server.

---

# 41. Session Security

If sessions are used:

```text
Secure Cookies
HttpOnly Cookies
SameSite Protection
Session Expiration
Session Revocation
```

should be configured appropriately.

If JWT authentication is used:

```text
Short-lived access tokens
Secure refresh-token handling
Token rotation where appropriate
Revocation strategy
```

should be considered.

---

# 42. CSRF Protection

If authentication uses cookies, state-changing requests require CSRF protection.

Examples:

```text
POST /api/v1/workflows/withdrawals
POST /api/v1/workflows/sales/:saleId/reconcile
```

Possible mechanisms:

```text
CSRF Tokens
SameSite Cookies
Origin Validation
```

If authentication uses Authorization headers rather than cookies, the CSRF risk profile differs, but other threats still require consideration.

---

# 43. CORS

Cross-Origin Resource Sharing must be explicitly configured.

The API must not use:

```text
Access-Control-Allow-Origin: *
```

for authenticated financial APIs unless there is a specific security justification.

Only trusted frontend origins should be allowed.

---

# 44. Security Headers

The application should configure appropriate HTTP security headers.

Examples:

```text
Content-Security-Policy
Strict-Transport-Security
X-Content-Type-Options
Referrer-Policy
```

The exact configuration depends on the frontend and deployment environment.

---

# 45. API Versioning and Security

API versioning should be maintained for controlled evolution.

Example:

```text
/api/v1/workflows/withdrawals
```

Security-sensitive behavior must not silently change between versions.

Breaking changes should require explicit version changes.

---

# 46. Database Access Security

The application database user should use least privilege.

The application should not run with unrestricted database administrator privileges.

Separate roles may be used for:

```text
Application Runtime
Migration Tool
Read-only Analytics
Administrative Operations
```

Production credentials must be separate from development credentials.

---

# 47. Database Constraints as Security Controls

Application-level authorization is necessary but insufficient.

The database should also enforce financial invariants.

Examples:

```text
Unique advance per sale
Unique recovery per withdrawal
Non-negative withdrawable balance
Valid ledger references
Valid state constraints
```

This creates defense in depth.

---

# 48. Security Failure Policy

If authorization cannot be determined:

```text
DENY
```

If webhook authenticity cannot be verified:

```text
REJECT
```

If identity cannot be established:

```text
REJECT
```

If a financial operation cannot be safely determined:

```text
DO NOT GUESS
```

If payment status is unknown:

```text
KEEP PROCESSING
```

Security and financial safety both follow the same principle:

> **Fail closed.**

---

# 49. Security Invariants

The following must always remain true.

### Identity

```text
Every protected request has an authenticated principal.
```

### Authorization

```text
Every sensitive operation is authorized server-side.
```

### Ownership

```text
Users can access only their own financial resources.
```

### Financial Integrity

```text
No client can directly modify balances or ledger entries.
```

### Webhook Authenticity

```text
Unverified provider events never affect financial state.
```

### Idempotency

```text
Duplicate requests cannot create duplicate financial effects.
```

### Auditability

```text
Privileged actions are traceable to an authenticated actor.
```

### Secrets

```text
Secrets never appear in source code, API responses, or logs.
```

---

# 50. Security Threat Summary

| Threat                 | Protection                     |
| ---------------------- | ------------------------------ |
| Unauthorized access    | Authentication                 |
| Privilege escalation   | RBAC                           |
| Cross-user access      | Resource ownership             |
| IDOR                   | Server-side ownership checks   |
| Duplicate withdrawals  | Idempotency                    |
| Webhook forgery        | Signature verification         |
| Webhook replay         | Event ID uniqueness            |
| SQL injection          | Parameterized queries          |
| Mass assignment        | Explicit writable fields       |
| Credential leakage     | Secret management              |
| Sensitive log exposure | Structured secure logging      |
| Withdrawal abuse       | Rate limiting + business rules |
| Financial manipulation | Ledger + DB constraints        |
| Admin abuse            | RBAC + audit logging           |
| CSRF                   | CSRF protection                |
| XSS                    | Output encoding + CSP          |
| API abuse              | Rate limiting                  |
| Provider timeout       | PROCESSING state               |
| Duplicate recovery     | Unique constraints             |

---

# 51. Security Architecture

The complete security flow is:

```text
                    Incoming Request
                           |
                           v
                  TLS / HTTPS Layer
                           |
                           v
                  Rate Limiting
                           |
                           v
                 Authentication
                           |
                           v
              Resolve Authenticated User
                           |
                           v
                  Authorization
                           |
                           v
               Resource Ownership
                           |
                           v
                 Input Validation
                           |
                           v
                Idempotency Check
                           |
                           v
               Application Service
                           |
                           v
              Database Constraints
                           |
                           v
                  Audit Logging
                           |
                           v
                     Response
```

For webhooks:

```text
Provider Webhook
       |
       v
TLS
       |
       v
Signature Verification
       |
       v
Timestamp Validation
       |
       v
Event ID Idempotency
       |
       v
State Validation
       |
       v
Financial Transaction
       |
       v
Commit
```

---

# 52. Final Security Contract

The system must guarantee:

```text
Unauthenticated Request
    ↓
Rejected

Unauthorized Request
    ↓
Rejected

Cross-User Access
    ↓
Rejected

Invalid Webhook
    ↓
Rejected

Duplicate Request
    ↓
Idempotently Handled

Duplicate Webhook
    ↓
No Additional Financial Effect

Admin Financial Correction
    ↓
Audited Business Operation

Direct Balance Modification
    ↓
Forbidden

Provider Timeout
    ↓
No Premature Recovery

Secret Exposure
    ↓
Prevented

Financial Invariant Violation
    ↓
Blocked by Application + Database
```

The ultimate security principle is:

> **No external actor—including an authenticated user or administrator—should be able to bypass the business rules that protect the financial integrity of the system.**

Security is therefore enforced in multiple layers:

```text
Authentication
        +
Authorization
        +
Resource Ownership
        +
Application Validation
        +
Database Constraints
        +
Audit Logging
        +
Operational Monitoring
```

No single layer is trusted to provide complete protection.
