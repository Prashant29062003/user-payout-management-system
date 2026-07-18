# Observability and Monitoring

## 1. Purpose

This document defines the observability strategy for the User Payout Management System.

Because the system handles financial operations, observability is not limited to infrastructure health.

The system must make it possible to answer:

* What happened?
* When did it happen?
* Who initiated it?
* Which account was affected?
* Which sale or withdrawal was involved?
* Which ledger entries were created?
* Did money actually move?
* What did the external payment provider report?
* Was the operation retried?
* Was the operation recovered?
* Is the current account projection correct?

The observability architecture must support:

```text
Logs
Metrics
Traces
Correlation IDs
Audit Events
Financial Reconciliation
Alerts
Dashboards
```

The core principle is:

> **Every financial operation must be traceable from its initial request to its final financial outcome.**

---

# 2. Observability Architecture

The observability flow is:

```text
                    Application
                        │
            ┌───────────┼───────────┐
            │           │           │
            ▼           ▼           ▼
          Logs       Metrics      Traces
            │           │           │
            └───────────┼───────────┘
                        │
                        ▼
              Observability Platform
                        │
            ┌───────────┼───────────┐
            │           │           │
            ▼           ▼           ▼
        Dashboards    Alerts     Investigation
```

Financial events should additionally be traceable through:

```text
API Request
    ↓
Domain Operation
    ↓
Database Transaction
    ↓
Ledger Entry
    ↓
Account Projection
    ↓
Payment Attempt
    ↓
Provider Response
    ↓
Webhook
    ↓
Final State
```

---

# 3. Observability Goals

The system must provide enough information to:

1. Detect failures quickly.
2. Investigate financial discrepancies.
3. Trace a user's payout lifecycle.
4. Identify duplicate processing attempts.
5. Detect stuck operations.
6. Detect ledger/projection inconsistencies.
7. Monitor payment provider reliability.
8. Support customer support investigations.
9. Support post-incident analysis.

---

# 4. Correlation IDs

Every incoming API request must have a correlation ID.

If the client provides a correlation ID, the application may accept it after validation.

Otherwise, the application must generate one.

Example:

```text
correlationId = req_01JXYZ123
```

The correlation ID must be propagated through all relevant operations.

```text
HTTP Request
    │
    ▼
Application Service
    │
    ├── Database Transaction
    │
    ├── Background Job
    │
    └── Payment Provider Request
              │
              ▼
          Webhook
```

The same correlation context should be preserved wherever technically possible.

---

# 5. Correlation ID Requirements

Correlation IDs must:

* Be unique enough for operational tracing.
* Be included in structured logs.
* Be included in relevant error responses.
* Be propagated to background jobs.
* Be included in payment integration logs.
* Be associated with webhook processing.

Example API response:

```json
{
  "error": {
    "code": "WITHDRAWAL_PROCESSING",
    "message": "Withdrawal is currently being processed.",
    "correlationId": "req_01JXYZ123"
  }
}
```

The correlation ID is not a security credential and must not be treated as authentication.

---

# 6. Domain Identifiers

Correlation IDs identify a request.

They must not replace domain identifiers.

Financial logs should include relevant identifiers such as:

```text
userId
accountId
saleId
ledgerEntryId
advancePayoutId
withdrawalId
paymentAttemptId
providerTransactionId
```

Example:

```json
{
  "event": "withdrawal.payment_failed",
  "correlationId": "req_123",
  "userId": "usr_123",
  "accountId": "acc_123",
  "withdrawalId": "wd_123",
  "paymentAttemptId": "pa_123",
  "providerTransactionId": "txn_123"
}
```

---

# 7. Structured Logging

All application logs should use structured formats such as JSON.

Example:

```json
{
  "timestamp": "2026-07-18T12:00:00.000Z",
  "level": "info",
  "service": "payout-api",
  "environment": "production",
  "event": "advance_payout.created",
  "correlationId": "req_123",
  "saleId": "sale_123",
  "userId": "usr_123",
  "amount": "4.00"
}
```

Structured logging allows logs to be searched and aggregated reliably.

---

# 8. Log Levels

The application should use standard log levels.

## DEBUG

Detailed information useful during development.

Example:

```text
Database query execution details
Internal state transitions
```

Debug logging should generally be disabled or heavily restricted in production.

---

## INFO

Normal business events.

Examples:

```text
Sale approved
Advance payout created
Withdrawal created
Payment attempt started
Webhook received
```

---

## WARN

Unexpected but recoverable conditions.

Examples:

```text
Payment provider timeout
Webhook received twice
Retry scheduled
Queue processing delayed
```

---

## ERROR

Operation failed and requires investigation or recovery.

Examples:

```text
Database transaction failed
Payment attempt failed
Webhook processing failed
Ledger projection update failed
```

---

## FATAL

System cannot safely continue.

Examples:

```text
Database unavailable
Critical configuration missing
Ledger integrity violation
```

---

# 9. Financial Logging Principle

Financial logs must describe financial events without becoming a second financial ledger.

The source of truth remains:

```text
Ledger Entries
```

Logs are operational evidence.

They must not be used as the authoritative source for calculating balances.

---

# 10. Required Financial Events

The following events should be logged.

## Sale Events

```text
sale.created
sale.approved
sale.rejected
```

---

## Advance Payout Events

```text
advance_payout.eligible
advance_payout.created
advance_payout.already_processed
advance_payout.processing_failed
```

---

## Reconciliation Events

```text
sale.reconciliation_started
sale.reconciliation_completed
sale.reconciliation_failed
```

---

## Ledger Events

```text
ledger_entry.created
ledger_entry.creation_rejected
ledger_integrity_violation
```

---

## Withdrawal Events

```text
withdrawal.created
withdrawal.rejected
withdrawal.funds_reserved
withdrawal.processing
withdrawal.completed
withdrawal.failed
withdrawal.recovered
```

---

## Payment Events

```text
payment_attempt.created
payment_attempt.processing
payment_attempt.succeeded
payment_attempt.failed
payment_attempt.cancelled
payment_attempt.rejected
payment_attempt.unknown
```

---

## Webhook Events

```text
webhook.received
webhook.signature_verified
webhook.signature_rejected
webhook.duplicate
webhook.processed
webhook.processing_failed
```

---

# 11. Log Event Structure

A financial event should contain enough context to reconstruct what happened operationally.

Example:

```json
{
  "timestamp": "2026-07-18T12:00:00Z",
  "level": "info",
  "event": "withdrawal.funds_reserved",
  "correlationId": "req_123",
  "withdrawalId": "wd_123",
  "accountId": "acc_123",
  "userId": "usr_123",
  "amount": "500.00",
  "currency": "INR"
}
```

---

# 12. Sensitive Data

The following must never be logged:

```text
Passwords
JWT Tokens
API Keys
Webhook Secrets
Payment Credentials
Card Numbers
Bank Account Credentials
Authentication Secrets
```

Personal data should be minimized.

If a value is not required for debugging or auditing, it should not be logged.

---

# 13. Monetary Values in Logs

Monetary values should be represented using exact decimal strings.

Correct:

```json
{
  "amount": "36.00"
}
```

Avoid:

```json
{
  "amount": 36.00000000000001
}
```

Application-level financial calculations must use appropriate decimal or integer-minor-unit representations.

---

# 14. Financial Event Trace

A complete advance payout should be traceable as:

```text
Sale
  │
  ▼
Advance Eligibility
  │
  ▼
Advance Payout
  │
  ▼
Ledger Entry
  │
  ▼
Account Projection
```

A complete withdrawal should be traceable as:

```text
Withdrawal Request
      │
      ▼
Funds Reservation
      │
      ▼
Payment Attempt
      │
      ▼
Provider Request
      │
      ▼
Provider Response/Webhook
      │
      ▼
Final Payment State
      │
      ▼
Recovery if Required
```

---

# 15. Metrics

Metrics should be divided into four categories:

```text
System Metrics
Application Metrics
Financial Metrics
External Provider Metrics
```

---

# 16. System Metrics

Monitor:

```text
CPU Usage
Memory Usage
Container Restarts
Network Errors
Database Connections
Queue Depth
```

These indicate infrastructure health.

---

# 17. Application Metrics

Monitor:

```text
HTTP Request Rate
HTTP Error Rate
HTTP 5xx Rate
Request Latency
Request Timeout Rate
Authentication Failures
Authorization Failures
```

Recommended latency percentiles:

```text
p50
p95
p99
```

---

# 18. Financial Metrics

The following metrics are critical.

```text
Advance Payouts Created
Advance Payouts Failed
Approved Sales
Rejected Sales
Settlement Entries
Rejection Adjustments
Withdrawal Requests
Withdrawal Successes
Withdrawal Failures
Recovery Operations
```

These should be monitored over time.

Unexpected changes may indicate:

* Application bugs
* Provider problems
* Fraud
* Business process changes
* Data corruption

---

# 19. Payment Provider Metrics

Track:

```text
Provider Requests
Provider Success Rate
Provider Failure Rate
Provider Rejection Rate
Provider Cancellation Rate
Provider Timeout Rate
Provider Latency
Webhook Delivery Rate
Webhook Failure Rate
```

A sudden increase in provider timeouts should trigger an alert.

---

# 20. Queue Metrics

Background processing must be observable.

Monitor:

```text
Queue Depth
Oldest Job Age
Job Processing Time
Job Success Rate
Job Failure Rate
Retry Count
Dead Letter Count
```

A growing queue may indicate:

```text
Worker Failure
Provider Outage
Database Slowdown
Unexpected Traffic
```

---

# 21. Database Metrics

Monitor:

```text
Connection Pool Utilization
Query Latency
Transaction Duration
Transaction Rollback Rate
Lock Wait Time
Deadlock Count
Database CPU
Database Storage
```

Particular attention should be paid to:

```text
Lock Wait Time
Deadlocks
Long-Running Transactions
```

because financial operations use transactional locking.

---

# 22. Financial Reconciliation Metrics

The system should periodically calculate:

```text
Ledger Projection Mismatches
```

Example metric:

```text
financial.ledger_projection_mismatch_count
```

Expected value:

```text
0
```

Any non-zero value should generate a high-severity alert.

---

# 23. Account Projection Verification

For an account:

```text
Ledger History
      ↓
Recalculate Expected State
      ↓
Compare Projection
```

Verify:

```text
withdrawable_balance
recovery_balance
```

against the expected values.

The check must not modify the account automatically.

---

# 24. Stuck Operation Detection

Operations should have maximum expected processing times.

Examples:

```text
Payment Processing > X minutes
Webhook Pending > X minutes
Queue Job > X minutes
Withdrawal Unknown > X hours
```

A monitoring job should identify stale records.

Example:

```text
withdrawal.status = PROCESSING
AND
updated_at < now() - threshold
```

This should trigger investigation.

The system must not automatically assume that a stale operation failed.

---

# 25. Unknown State Monitoring

The system explicitly recognizes:

```text
UNKNOWN
```

or equivalent unresolved states.

Monitor:

```text
Number of Unknown Payments
Age of Unknown Payments
Total Amount in Unknown Payments
```

Example:

```text
unknown_payment_count = 10

unknown_payment_amount = ₹12,500
```

A high monetary value in unresolved states should trigger immediate operational attention.

---

# 26. Alerts

Alerts should be actionable.

A good alert should answer:

```text
What happened?
How severe is it?
Which component is affected?
What is the financial impact?
What should the operator do?
```

---

# 27. Critical Alerts

Critical alerts include:

```text
Ledger Integrity Violation
Ledger/Projection Mismatch
Database Unavailable
Unexpected Duplicate Financial Operation
Financial Transaction Consistency Failure
```

These require immediate investigation.

---

# 28. High-Severity Alerts

Examples:

```text
Payment Provider Outage
High Withdrawal Failure Rate
High Payment Timeout Rate
Large Unknown Payment Balance
Large Queue Backlog
Webhook Processing Failure Spike
```

---

# 29. Medium-Severity Alerts

Examples:

```text
Increased API Latency
Worker Retry Increase
Database Lock Wait Increase
Elevated 5xx Rate
Increased Authentication Failures
```

---

# 30. Alert Deduplication

Alerts should not flood operators.

For example:

```text
1000 payment failures
```

should generate a meaningful incident rather than:

```text
1000 individual pages
```

Alerts should be grouped by:

```text
Service
Error Type
Provider
Time Window
```

---

# 31. Alert Escalation

Critical alerts should follow an escalation path.

Example:

```text
Alert
  ↓
On-Call Engineer
  ↓
Incident Response
  ↓
Engineering Lead
  ↓
Business/Finance Team
```

The exact escalation policy depends on the organization.

---

# 32. Dashboards

The system should provide dedicated dashboards.

Recommended dashboards:

```text
1. System Health
2. API Performance
3. Background Jobs
4. Payment Provider
5. Financial Operations
6. Financial Integrity
```

---

# 33. System Health Dashboard

Display:

```text
API Availability
CPU
Memory
Database Health
Queue Health
Worker Health
```

---

# 34. API Performance Dashboard

Display:

```text
Request Rate
p50 Latency
p95 Latency
p99 Latency
4xx Rate
5xx Rate
Endpoint Error Rate
```

---

# 35. Background Job Dashboard

Display:

```text
Queue Depth
Job Processing Rate
Job Failure Rate
Retry Count
Dead Letter Count
Oldest Job Age
```

---

# 36. Payment Provider Dashboard

Display:

```text
Provider Success Rate
Failure Rate
Timeout Rate
Average Latency
Webhook Success Rate
Webhook Failure Rate
Unknown Payment Count
```

---

# 37. Financial Operations Dashboard

Display:

```text
Advances Created
Settlements
Rejection Adjustments
Withdrawals
Withdrawal Successes
Withdrawal Failures
Recoveries
```

Include financial amounts where appropriate.

Example:

```text
Total Withdrawal Amount
Total Failed Withdrawal Amount
Total Recovery Amount
Total Unknown Amount
```

---

# 38. Financial Integrity Dashboard

This is the most important financial dashboard.

Display:

```text
Ledger/Projection Mismatch Count
Accounts Requiring Reconciliation
Unknown Payments
Duplicate Event Attempts
Failed Recovery Attempts
Stuck Withdrawals
```

Expected healthy state:

```text
Ledger/Projection Mismatch = 0
Failed Recovery = 0
Unexpected Duplicate Financial Effects = 0
```

---

# 39. Distributed Tracing

Where supported, distributed tracing should be used.

A trace may look like:

```text
HTTP Request
    │
    ├── Database Transaction
    │
    ├── Ledger Insert
    │
    ├── Account Projection
    │
    └── Payment Provider Request
```

Each operation should appear as a span.

This helps identify:

* Slow database queries
* Slow provider calls
* Queue delays
* Unexpected latency

---

# 40. Trace and Log Correlation

Logs and traces should be correlated.

Example:

```text
traceId = trace_123
correlationId = req_123
```

An engineer should be able to:

```text
Find Request
    ↓
Open Trace
    ↓
Find Database Span
    ↓
Find Payment Provider Span
    ↓
Find Related Logs
```

---

# 41. Webhook Observability

Every webhook should be observable.

Track:

```text
Webhook Received
Webhook Signature Valid
Webhook Signature Invalid
Webhook Duplicate
Webhook Processed
Webhook Failed
```

Example:

```json
{
  "event": "webhook.processed",
  "providerEventId": "evt_123",
  "paymentAttemptId": "pa_123",
  "correlationId": "req_123"
}
```

---

# 42. Idempotency Observability

Idempotent operations should expose useful metrics.

Example:

```text
advance_payout_duplicate_attempts
webhook_duplicate_events
withdrawal_duplicate_requests
recovery_duplicate_attempts
```

A duplicate attempt is not necessarily an error.

However, a sudden increase may indicate:

* Client retry problems
* Provider retry behavior
* Queue instability
* Application bugs

---

# 43. Concurrency Monitoring

Monitor:

```text
Database Deadlocks
Lock Wait Time
Transaction Retries
Serialization Failures
Concurrent Operation Conflicts
```

These metrics help detect production concurrency problems.

---

# 44. Error Budget

For non-financial availability metrics, the system may define service-level objectives.

Example:

```text
API Availability: 99.9%
p95 API Latency: < 500 ms
```

However, financial correctness must have a stricter invariant:

```text
Ledger Integrity Violations: 0
```

Financial correctness is not an error-budget tradeoff.

---

# 45. Operational Investigation Workflow

When a user reports:

> "My withdrawal disappeared."

The investigation should follow:

```text
1. Identify User
        ↓
2. Identify Account
        ↓
3. Find Withdrawal
        ↓
4. Find Payment Attempt
        ↓
5. Find Provider Transaction
        ↓
6. Check Provider Status
        ↓
7. Inspect Ledger Entries
        ↓
8. Inspect Account Projection
        ↓
9. Check Recovery Entry
        ↓
10. Determine Final Financial State
```

This workflow must not rely exclusively on logs.

The ledger and database state remain authoritative.

---

# 46. Financial Discrepancy Investigation

If:

```text
Ledger ≠ Account Projection
```

the process is:

```text
Detect
  ↓
Alert
  ↓
Freeze Affected Operation if Necessary
  ↓
Identify Account
  ↓
Recalculate From Ledger
  ↓
Compare Expected Projection
  ↓
Investigate Root Cause
  ↓
Apply Controlled Correction
  ↓
Verify
```

No financial history should be deleted.

---

# 47. Observability Data Retention

Retention policies should distinguish between:

```text
Operational Logs
Metrics
Traces
Audit Records
Financial Ledger
```

The ledger has the longest retention requirement because it is financial history.

Logs may have shorter retention depending on:

* Compliance
* Cost
* Operational requirements

The exact retention periods must be defined according to applicable regulations and business policy.

---

# 48. Observability Security

Observability infrastructure must be protected.

Access should be restricted because logs may contain:

```text
User Identifiers
Financial Information
Operational Metadata
Provider Transaction IDs
```

Only authorized personnel should access production observability systems.

---

# 49. Observability Definition of Done

The observability implementation is complete when:

```text
[ ] Correlation IDs implemented
[ ] Structured logging implemented
[ ] Financial events logged
[ ] Sensitive data excluded
[ ] Metrics implemented
[ ] Provider metrics implemented
[ ] Queue metrics implemented
[ ] Database metrics implemented
[ ] Distributed tracing implemented where applicable
[ ] Financial dashboards available
[ ] Financial integrity dashboard available
[ ] Critical alerts configured
[ ] Unknown payment monitoring configured
[ ] Ledger/projection mismatch monitoring configured
[ ] Stuck operation detection configured
[ ] Runbooks linked to critical alerts
```

---

# 50. Final Principle

The purpose of observability is not simply to know whether the server is running.

For this system, observability must answer:

```text
Did the user earn the money?
        ↓
Was the money recorded?
        ↓
Was the money reserved?
        ↓
Was the provider called?
        ↓
Did the provider complete the transfer?
        ↓
If not, what is the current state?
        ↓
Was recovery performed?
        ↓
Does the ledger match the account projection?
```

The most important invariant is:

> **Every financial operation must be explainable from authoritative data, and every operational event must be traceable through the system.**

If a support engineer cannot trace a withdrawal from the API request to the final provider outcome and corresponding ledger entries, the system is not sufficiently observable.
