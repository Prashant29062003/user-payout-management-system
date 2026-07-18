# Error Handling and Failure Recovery

## 1. Purpose

This document defines the error-handling and failure-recovery strategy for the User Payout Management System.

The system handles financial operations where failures can occur at multiple boundaries:

* Client requests
* Application validation
* Authentication and authorization
* Database transactions
* Concurrent operations
* Background jobs
* External payment providers
* Provider webhooks
* Network communication
* Infrastructure failures

The primary objective is:

> **A failure must never result in an inconsistent financial state, duplicate financial effect, silent loss of funds, or irreversible loss of transaction history.**

The system must distinguish between:

```text
Business Failure
Technical Failure
Transient Failure
Permanent Failure
Unknown Outcome
```

Each category requires a different response.

---

# 2. Core Error Handling Principles

The system follows these principles:

1. Never silently ignore financial errors.
2. Never delete financial history to recover from an error.
3. Never assume an external timeout means payment failure.
4. Never retry an operation blindly.
5. Never retry a non-idempotent financial operation without protection.
6. Database transactions must rollback completely on failure.
7. External payment operations must use stable idempotency keys.
8. Unknown payment outcomes must remain in an unresolved state.
9. Failed withdrawals must be recovered exactly once.
10. All unexpected failures must be observable and auditable.

The system must always prefer:

```text
Safe Incomplete State
```

over:

```text
Incorrect Financial State
```

For example:

```text
PROCESSING
```

is safer than incorrectly marking a payment:

```text
FAILED
```

when the provider's actual result is unknown.

---

# 3. Error Categories

Errors are divided into the following categories:

```text
1. Validation Errors
2. Authentication Errors
3. Authorization Errors
4. Business Rule Errors
5. State Transition Errors
6. Concurrency Errors
7. Database Errors
8. External Provider Errors
9. Network Errors
10. Webhook Errors
11. Background Job Errors
12. Infrastructure Errors
13. Unknown / Unclassified Errors
```

Each category must have a defined handling strategy.

---

# 4. Validation Errors

Validation errors occur when the request itself is invalid.

Examples:

```text
Withdrawal amount = ₹0
Withdrawal amount = negative
Invalid UUID
Missing required field
Malformed idempotency key
Invalid request format
```

These errors must be rejected before any financial transaction begins.

Example:

```text
POST /withdrawals

{
    "amount": "-500"
}
```

Response:

```text
400 Bad Request
```

No database mutation should occur.

---

# 5. Validation Error Response

The API should return a consistent structure.

Example:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "amount",
        "code": "INVALID_AMOUNT",
        "message": "Amount must be greater than zero"
      }
    ]
  }
}
```

The response should provide enough information for the client to correct the request.

It must not expose:

* SQL errors
* Stack traces
* Internal implementation details
* Database structure
* Provider credentials
* Sensitive financial information belonging to another user

---

# 6. Authentication Errors

Authentication errors occur when the request does not represent a valid authenticated user.

Examples:

```text
Missing token
Invalid token
Expired token
Invalid session
```

Response:

```text
401 Unauthorized
```

Example:

```json
{
  "error": {
    "code": "UNAUTHENTICATED",
    "message": "Authentication is required"
  }
}
```

The system must not reveal whether a specific user account exists when such information could create a security issue.

---

# 7. Authorization Errors

Authorization errors occur when an authenticated user does not have permission to perform an operation.

Example:

```text
Affiliate User
    ↓
Attempts to reconcile sale
```

This is not allowed.

Response:

```text
403 Forbidden
```

Example:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this operation"
  }
}
```

Authorization must be enforced before executing financial operations.

---

# 8. Business Rule Errors

Business rule errors occur when a request is valid technically but violates a business invariant.

Examples:

```text
Withdrawal amount exceeds balance
Withdrawal attempted within 24 hours
Sale cannot be reconciled
Advance already processed
Recovery already issued
```

These should return a business-specific error.

Example:

```text
409 Conflict
```

or:

```text
422 Unprocessable Entity
```

The exact status should be standardized across the API.

Recommended approach:

```text
400
Malformed request

401
Not authenticated

403
Not authorized

404
Resource not found

409
Resource state conflict

422
Business validation failure

500
Unexpected internal error

502/503/504
External dependency failure
```

---

# 9. State Transition Errors

A state transition error occurs when an operation attempts an invalid transition.

Example:

```text
Sale:
APPROVED
```

Request:

```text
Reject Sale
```

The transition:

```text
APPROVED → REJECTED
```

is not allowed.

The API should return:

```text
409 Conflict
```

Example:

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Sale cannot be rejected because it is already approved"
  }
}
```

No financial mutation should occur.

---

# 10. Resource Not Found

If a requested resource does not exist:

```text
GET /sales/unknown-id
```

return:

```text
404 Not Found
```

Example:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Sale not found"
  }
}
```

The system must avoid leaking information about resources the caller is not authorized to access.

---

# 11. Database Transaction Failure

Any unexpected error during a financial transaction must cause a rollback.

Example:

```text
BEGIN

Create Ledger Entry
        ↓
Update Account
        ↓
Database Error

ROLLBACK
```

The final state must be:

```text
No Ledger Entry
No Account Update
```

The application must never continue execution as though the transaction succeeded.

---

# 12. Financial Transaction Atomicity

For every financial operation:

```text
Ledger Entry
+
Account Projection
+
Business State
```

must be treated as one atomic unit.

If any component fails:

```text
ROLLBACK ALL
```

Example:

```text
Advance Processing

Ledger Insert     SUCCESS
Account Update    FAILURE
```

Final result:

```text
Ledger Insert     ROLLED BACK
Account Update    ROLLED BACK
Advance           NOT COMPLETED
```

The scheduler can safely retry because no partial financial effect was committed.

---

# 13. Database Deadlocks

A database deadlock is a transient technical failure.

Example:

```text
Transaction A
    ↓
Locks Sale
    ↓
Waits for Account

Transaction B
    ↓
Locks Account
    ↓
Waits for Sale
```

The database may terminate one transaction.

The application should:

```text
1. Detect deadlock
2. Rollback transaction
3. Wait briefly
4. Retry entire transaction
```

The retry must use the same logical operation.

The application must not manually recreate only part of the failed financial transaction.

---

# 14. Transaction Retry Policy

Only transient database errors should be automatically retried.

Potential retryable errors:

```text
Deadlock
Serialization failure
Temporary connection failure
Temporary database unavailability
```

Non-retryable errors:

```text
Constraint violation
Invalid state transition
Insufficient balance
Invalid input
Unauthorized operation
Duplicate operation
```

The retry count should be limited.

Example:

```text
Maximum attempts = 3
```

After all retries fail:

```text
Return error
Log failure
Create alert if financially significant
```

The system must avoid infinite retries.

---

# 15. Exponential Backoff

Retries should use exponential backoff.

Example:

```text
Attempt 1
Immediate

Attempt 2
100ms

Attempt 3
250ms

Attempt 4
500ms
```

The exact values depend on the infrastructure.

A small amount of jitter should be added to prevent synchronized retry storms.

---

# 16. External Payment Provider Errors

External provider errors must be classified carefully.

Possible outcomes:

```text
SUCCESS
FAILED
REJECTED
CANCELLED
TIMEOUT
UNKNOWN
UNAVAILABLE
```

These outcomes must not all be treated identically.

---

# 17. Provider Success

If the provider definitively confirms success:

```text
PROCESSING
    ↓
SUCCESS
```

The system must not create recovery.

The withdrawal remains financially settled.

Example:

```text
Ledger:
-₹500 WITHDRAWAL
```

No additional credit is created.

---

# 18. Provider Failed

If the provider definitively confirms failure:

```text
PROCESSING
    ↓
FAILED
```

The system must initiate recovery.

Example:

```text
Original:
-₹500 WITHDRAWAL

Recovery:
+₹500 WITHDRAWAL_RECOVERY
```

The recovery must be processed exactly once.

---

# 19. Provider Rejected

If the provider definitively rejects the withdrawal:

```text
PROCESSING
    ↓
REJECTED
```

The system must recover the reserved amount exactly once.

---

# 20. Provider Cancelled

If the provider definitively cancels the withdrawal:

```text
PROCESSING
    ↓
CANCELLED
```

The system must recover the reserved amount exactly once.

---

# 21. Provider Timeout

A timeout is not equivalent to failure.

The system must keep:

```text
Withdrawal = PROCESSING
```

unless the provider can definitively confirm failure.

The system may:

```text
1. Retry using the same idempotency key
2. Query provider status
3. Wait for webhook
4. Run reconciliation
```

It must not immediately:

```text
Create Recovery
```

because the provider may have successfully processed the payment.

---

# 22. Unknown Provider Result

An unknown result is treated as an unresolved operation.

Example:

```text
Application:
Request sent

Provider:
Unknown

Network:
Connection lost
```

State:

```text
PROCESSING
```

The system must not:

```text
Mark FAILED
```

or:

```text
Create Recovery
```

until the result is resolved.

This is a critical financial invariant.

> **Unknown is not failure.**

---

# 23. Provider Unavailability

If the provider is unavailable before the request is sent:

```text
Provider:
UNAVAILABLE
```

the system may retry the operation using the same provider idempotency key.

If the system cannot determine whether the provider received the request, the withdrawal must remain:

```text
PROCESSING
```

until resolved.

---

# 24. Provider Retry Rules

Provider retries must follow these rules:

```text
Same Withdrawal ID
Same Provider Idempotency Key
Limited Retry Count
Exponential Backoff
```

Never:

```text
Create New Withdrawal
```

for a retry of the same logical operation.

---

# 25. Provider Retry Example

Initial:

```text
Withdrawal:
wd_123

Provider Key:
wd_123
```

First attempt:

```text
Timeout
```

Retry:

```text
Withdrawal:
wd_123

Provider Key:
wd_123
```

Second attempt:

```text
Success
```

Final state:

```text
wd_123 = SUCCESS
```

Only one withdrawal exists.

---

# 26. Webhook Failure

Webhook processing may fail because of:

```text
Database unavailable
Temporary network issue
Deadlock
Unexpected application error
```

The provider may retry the webhook.

The webhook handler must therefore be idempotent.

If processing fails before commit:

```text
ROLLBACK
```

The provider retries the webhook.

If processing succeeds:

```text
COMMIT
```

A duplicate webhook produces no additional financial effect.

---

# 27. Webhook Response Strategy

The webhook endpoint should acknowledge the provider only when the event has been safely processed or safely recognized as already processed.

Successful processing:

```text
200 OK
```

Duplicate already-processed event:

```text
200 OK
```

Temporary internal failure:

```text
5xx
```

The provider can then retry.

The system must not return:

```text
200 OK
```

if the financial state was not safely committed.

---

# 28. Webhook Authentication Failure

Invalid webhook signatures must be rejected.

Example:

```text
401 Unauthorized
```

or:

```text
403 Forbidden
```

depending on the authentication mechanism.

The system must not process the financial event.

No ledger entry should be created.

No recovery should occur.

---

# 29. Webhook Event Processing

The recommended flow is:

```text
Webhook Received
        ↓
Verify Signature
        ↓
Validate Payload
        ↓
Check Event ID
        ↓
Already Processed?
    /          \
  YES           NO
   |             |
Return 200     Begin TX
                 |
                 v
          Lock Withdrawal
                 |
                 v
          Validate State
                 |
                 v
          Update Withdrawal
                 |
                 v
        Create Recovery
          if required
                 |
                 v
       Update Account
                 |
                 v
      Mark Event Processed
                 |
                 v
               COMMIT
                 |
                 v
              200 OK
```

---

# 30. Recovery Failure

A failed withdrawal may be successfully marked:

```text
FAILED
```

but recovery may temporarily fail.

The system must not lose the recovery obligation.

The recovery process should therefore be retryable.

Example:

```text
Withdrawal:
FAILED

Recovery:
PENDING
```

A background recovery worker may retry.

Because recovery is protected by:

```text
UNIQUE(withdrawal_id, WITHDRAWAL_RECOVERY)
```

retries cannot create duplicate credits.

---

# 31. Recovery Processing

The recovery process should be:

```text
Find Failed Withdrawal
        ↓
Check Recovery Already Exists
        ↓
If Exists:
    Stop
        ↓
If Not Exists:
    BEGIN
        Lock Withdrawal
        Verify terminal failure
        Create Recovery Ledger
        Update Account Projection
    COMMIT
```

This guarantees exactly-once financial recovery.

---

# 32. Recovery Worker Failure

If the recovery worker crashes:

```text
Before Transaction Commit
```

the transaction rolls back.

The recovery remains pending.

The worker retries.

If the crash occurs:

```text
After Commit
```

the retry finds:

```text
Recovery Already Exists
```

and performs no additional financial effect.

This is the desired behavior.

---

# 33. Background Job Errors

Background jobs must distinguish between:

```text
Retryable
Non-Retryable
```

### Retryable

```text
Database unavailable
Deadlock
Temporary provider outage
Network timeout
```

### Non-Retryable

```text
Invalid sale state
Malformed data
Missing required relationship
Business rule violation
```

Non-retryable errors should be logged and moved to an error state or dead-letter workflow where appropriate.

They should not be retried indefinitely.

---

# 34. Dead-Letter Handling

Jobs that repeatedly fail should be moved to a dead-letter or failed-job queue.

Example:

```text
Job
 ↓
Attempt 1 → Failed
 ↓
Attempt 2 → Failed
 ↓
Attempt 3 → Failed
 ↓
Dead Letter
```

The system should retain:

```text
Job ID
Entity ID
Error Code
Error Message
Attempt Count
Last Attempt Time
Stack Trace
```

Financially significant failed jobs must trigger an operational alert.

---

# 35. Manual Recovery

Some failures require human intervention.

Examples:

```text
Provider permanently unavailable
Provider reports inconsistent status
Database corruption detected
Unexpected financial mismatch
```

Manual intervention must never directly modify balances.

Instead, administrators should execute controlled operations that create auditable ledger entries.

The rule is:

> **Manual recovery must use the same financial invariants as automated recovery.**

No administrator should be allowed to simply edit:

```text
withdrawable_balance
```

to fix an accounting issue.

---

# 36. Financial Reconciliation

The system should support periodic reconciliation between:

```text
Ledger
```

and:

```text
Account Projection
```

The reconciliation process verifies:

```text
Ledger History
        ↓
Projection Calculation
        ↓
Stored Account Projection
```

If a mismatch is detected:

```text
ALERT
```

The system should not silently overwrite the balance.

Instead:

```text
1. Identify mismatch
2. Preserve existing history
3. Investigate root cause
4. Generate corrective ledger entry if required
5. Rebuild projection if necessary
```

---

# 37. Ledger Corruption Policy

Ledger entries are immutable.

The following is prohibited:

```text
UPDATE ledger_entry
DELETE ledger_entry
```

to hide or correct a financial mistake.

Instead:

```text
Incorrect Entry
      ↓
Corrective Entry
```

Example:

```text
Original:
+₹100

Correction:
-₹100

Correct Entry:
+₹80
```

The ledger history remains complete.

---

# 38. Error Logging

Every unexpected error must be logged with sufficient context.

Recommended fields:

```text
request_id
correlation_id
user_id
operation_type
entity_type
entity_id
error_code
error_message
stack_trace
timestamp
service
environment
```

Sensitive information must not be logged.

Never log:

```text
Passwords
Authentication Tokens
API Secrets
Payment Credentials
Full Sensitive Financial Data
```

---

# 39. Correlation IDs

Every incoming request should have a correlation ID.

Example:

```text
X-Correlation-ID: req_123
```

If not provided by the client, the system generates one.

The same ID should appear in:

```text
Application Logs
Database Operation Logs
Background Job Logs
Provider Request Logs
Webhook Logs
```

This allows an engineer to trace:

```text
User Request
    ↓
Withdrawal
    ↓
Provider Request
    ↓
Provider Webhook
    ↓
Recovery
```

---

# 40. Structured Logging

Logs should be structured rather than free-form text.

Example:

```json
{
  "level": "ERROR",
  "event": "withdrawal_provider_timeout",
  "withdrawal_id": "wd_123",
  "user_id": "user_456",
  "correlation_id": "req_789",
  "provider": "payment-provider",
  "timestamp": "2026-07-18T10:30:00Z"
}
```

This allows logs to be searched and aggregated.

---

# 41. Error Codes

Errors should use stable machine-readable codes.

Examples:

```text
VALIDATION_ERROR
UNAUTHENTICATED
FORBIDDEN
RESOURCE_NOT_FOUND
INVALID_STATE_TRANSITION
INSUFFICIENT_BALANCE
WITHDRAWAL_LIMIT_EXCEEDED
ADVANCE_ALREADY_PROCESSED
RECOVERY_ALREADY_PROCESSED
IDEMPOTENCY_KEY_REUSED
PROVIDER_TIMEOUT
PROVIDER_UNAVAILABLE
PROVIDER_REJECTED
INTERNAL_ERROR
```

Clients should rely on:

```text
error.code
```

rather than parsing human-readable messages.

---

# 42. Standard API Error Format

All API errors should follow one consistent format.

Example:

```json
{
  "error": {
    "code": "INSUFFICIENT_BALANCE",
    "message": "Insufficient withdrawable balance",
    "requestId": "req_123",
    "details": {}
  }
}
```

For validation:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "req_123",
    "details": {
      "amount": "Amount must be greater than zero"
    }
  }
}
```

---

# 43. HTTP Error Mapping

| Condition                    | HTTP Status |
| ---------------------------- | ----------: |
| Invalid request              |         400 |
| Authentication failure       |         401 |
| Authorization failure        |         403 |
| Resource not found           |         404 |
| State conflict               |         409 |
| Idempotency key conflict     |         409 |
| Business validation failure  |         422 |
| Rate limited                 |         429 |
| Unexpected application error |         500 |
| External provider failure    |         502 |
| Dependency unavailable       |         503 |
| External timeout             |         504 |

The exact mapping should remain consistent across the API.

---

# 44. Internal Error Exposure

Internal errors must not be returned directly to clients.

Bad:

```json
{
  "error": "duplicate key value violates unique constraint users_pkey"
}
```

Correct:

```json
{
  "error": {
    "code": "DUPLICATE_OPERATION",
    "message": "This operation has already been processed"
  }
}
```

Database-specific details belong in internal logs.

---

# 45. Rate Limiting

Financial endpoints should be rate-limited.

Examples:

```text
POST /api/v1/workflows/withdrawals
POST /api/v1/workflows/sales/:saleId/reconcile
```

Rate limiting protects against:

```text
Abuse
Accidental request storms
Malicious automation
Excessive provider calls
```

Rate limiting must not replace idempotency.

Both are required.

---

# 46. Retry Policy Matrix

| Failure                   | Automatic Retry   | Strategy             |
| ------------------------- | ----------------- | -------------------- |
| Database deadlock         | Yes               | Retry transaction    |
| Serialization failure     | Yes               | Retry transaction    |
| Temporary DB outage       | Limited           | Exponential backoff  |
| Validation error          | No                | Fix request          |
| Invalid state             | No                | Correct state        |
| Insufficient balance      | No                | User action          |
| Provider timeout          | Carefully         | Same idempotency key |
| Provider unavailable      | Yes               | Limited retry        |
| Provider failed           | No provider retry | Recovery             |
| Provider rejected         | No provider retry | Recovery             |
| Provider cancelled        | No provider retry | Recovery             |
| Webhook duplicate         | No                | Return success       |
| Webhook temporary failure | Yes               | Provider retry       |
| Recovery failure          | Yes               | Background retry     |

---

# 47. What Must Never Be Automatically Retried

The following operations must not be blindly retried:

```text
Create new withdrawal
Create new payment operation
Create new recovery without idempotency protection
Create new financial ledger entry without unique constraints
Change approved sale to rejected
Change rejected sale to approved
```

Retrying these operations without protection may create duplicate financial effects.

---

# 48. Safe Retry Decision Tree

Before retrying any operation:

```text
Is this operation idempotent?
        |
       NO
        |
Can it be made idempotent?
        |
       YES
        |
Use idempotency key / unique constraint
        |
        v
Retry
```

If the operation cannot safely be retried:

```text
Do Not Retry Automatically
```

---

# 49. Failure Recovery Architecture

The complete failure recovery model is:

```text
                Financial Operation
                        |
                        v
                 BEGIN TRANSACTION
                        |
              +---------+---------+
              |                   |
           SUCCESS              FAILURE
              |                   |
              v                   v
           COMMIT              ROLLBACK
              |                   |
              v                   v
       External Operation    Retry if Safe
              |
              v
       Provider Response
              |
       +------+------+------+
       |      |      |      |
    SUCCESS FAILED REJECTED TIMEOUT
       |      |      |      |
       v      +------+------+ 
    Complete       |
                  v
             Recovery
                  |
                  v
         Idempotent Recovery
```

---

# 50. Operational Invariants

The following must always remain true:

### No Partial Financial Transactions

```text
Ledger + Projection + State
```

must commit atomically.

### No Duplicate Advances

```text
One Sale → Maximum One Advance
```

### No Duplicate Recovery

```text
One Withdrawal → Maximum One Recovery
```

### No Double Spending

```text
Reserved Withdrawals
≤ Available Funds
```

### No Unknown-State Recovery

```text
TIMEOUT
≠
FAILURE
```

### No History Deletion

```text
Financial History = Append Only
```

### No Silent Errors

Every unexpected financial failure must be:

```text
Logged
Tracked
Alerted when necessary
```

---

# 51. Error Handling Decision Tree

The application should follow this decision process:

```text
Operation Fails
      |
      v
Is it a validation/business error?
      |
   YES → Return 4xx
      |
      NO
      |
      v
Is it a transient technical error?
      |
   YES → Retry if safe
      |
      NO
      |
      v
Is external result unknown?
      |
   YES → Keep PROCESSING / unresolved
      |
      NO
      |
      v
Is external operation definitively failed?
      |
   YES → Mark failure + recover
      |
      NO
      |
      v
Log + Alert + Manual Investigation
```

---

# 52. Final Design Principles

The system follows five fundamental rules.

### Rule 1: Rollback on Internal Failure

If a database transaction fails:

```text
Rollback Everything
```

### Rule 2: Retry Only Safe Operations

A retry is allowed only when:

```text
Idempotency
+
Transaction Safety
+
Bounded Retry
```

are guaranteed.

### Rule 3: Unknown Is Not Failure

For external payments:

```text
Timeout
≠
Failure
```

### Rule 4: Recover With Ledger Entries

Never repair financial balances by directly editing projections.

Use:

```text
Corrective Ledger Entry
```

and update the projection atomically.

### Rule 5: Preserve Evidence

Every financial event must remain auditable.

Never delete or overwrite:

```text
Ledger Entries
Withdrawal History
Provider Events
Recovery History
```

---

# 53. Final Failure Handling Contract

The system must guarantee:

```text
Internal Failure
    ↓
Rollback

Transient Failure
    ↓
Bounded Retry

External Timeout
    ↓
PROCESSING / Resolve Later

Definitive Payment Failure
    ↓
Recovery Exactly Once

Duplicate Request
    ↓
Idempotent Response

Duplicate Webhook
    ↓
No Additional Financial Effect

Financial Error
    ↓
Append-Only Corrective Entry

Unexpected Failure
    ↓
Log + Trace + Alert
```

The ultimate invariant is:

> **A failure may delay a financial operation, but it must never cause the system to lose track of money, pay the same money twice, recover the same money twice, or erase the history required to explain what happened.**

This document establishes the error-handling and failure-recovery contract for the User Payout Management System.
