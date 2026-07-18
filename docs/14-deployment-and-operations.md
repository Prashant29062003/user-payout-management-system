# Deployment and Operations

## 1. Purpose

This document defines the deployment and operational strategy for the User Payout Management System.

The system handles financial operations, therefore deployment and operations must prioritize:

* Financial consistency
* Availability
* Data durability
* Safe deployments
* Observability
* Disaster recovery
* Secure configuration
* Controlled failure handling

The primary operational principle is:

> **A deployment must never compromise the correctness of financial data.**

Application availability is important, but financial correctness is more important.

---

# 2. Production Architecture

The production environment consists of:

```text
                    Internet
                       │
                       ▼
                 Load Balancer
                       │
                       ▼
              ┌─────────────────┐
              │   API Instances  │
              └─────────────────┘
                 │          │
                 │          │
                 ▼          ▼
            PostgreSQL    Job Queue
                 │          │
                 │          ▼
                 │     Background Workers
                 │
                 ▼
          Payment Provider
                 │
                 ▼
             Webhooks
                 │
                 ▼
             API Layer
```

The exact infrastructure may differ, but the following responsibilities must remain separated:

* API request processing
* Background job processing
* Database persistence
* External payment integration

---

# 3. Deployment Components

The production deployment contains the following logical components.

## API Server

Responsible for:

* HTTP requests
* Authentication
* Authorization
* Business operations
* Webhook ingestion

---

## Background Worker

Responsible for:

* Advance payout processing
* Retryable background operations
* Asynchronous financial workflows

Workers must be safe to execute more than once.

---

## Scheduler

Responsible for triggering recurring jobs.

Examples:

```text
Advance payout scanning
Reconciliation tasks
Operational reconciliation
```

The scheduler should enqueue jobs rather than directly performing large financial workflows.

---

## PostgreSQL

The database stores:

* Users
* Accounts
* Sales
* Ledger entries
* Withdrawals
* Payment attempts
* Recovery operations

PostgreSQL is the source of truth for transactional state.

---

## Payment Provider

The payment provider performs external money transfers.

The application must treat the provider as an unreliable external dependency.

---

# 4. Deployment Strategy

The preferred deployment strategy is:

```text
Build
  ↓
Run Automated Tests
  ↓
Build Immutable Artifact
  ↓
Deploy to Staging
  ↓
Run Smoke Tests
  ↓
Deploy to Production
  ↓
Monitor
```

Production deployments must not be performed directly from a developer's local machine.

---

# 5. CI/CD Pipeline

The CI/CD pipeline should execute:

```text
1. Checkout Code
2. Install Dependencies
3. Run Lint
4. Run Type Checks
5. Run Unit Tests
6. Run Integration Tests
7. Run Security Checks
8. Build Application
9. Build Container Image
10. Deploy to Staging
11. Run Smoke Tests
12. Deploy to Production
```

The pipeline must fail if any mandatory step fails.

---

# 6. Build Artifacts

Production deployments should use immutable artifacts.

For example:

```text
payout-service:1.4.2
```

or:

```text
payout-service:<git-commit-sha>
```

The production environment must run the exact artifact that passed CI.

This prevents:

```text
"Works in CI but different code was deployed."
```

---

# 7. Containerization

The application should be packaged as a container.

Example logical image:

```text
payout-api
```

The worker may use:

```text
payout-worker
```

The API and worker can share the same application image while using different startup commands.

Example:

```text
API:
npm run start

Worker:
npm run worker
```

---

# 8. Environment Configuration

Production configuration must be injected through environment configuration or a secure secret-management system.

The application must never contain production secrets in:

* Source code
* Git history
* Docker images
* Documentation
* Logs

Examples of secrets:

```text
DATABASE_URL
JWT_SECRET
PAYMENT_PROVIDER_API_KEY
WEBHOOK_SECRET
```

---

# 9. Database Migrations

Database migrations must be executed as a controlled deployment step.

Recommended flow:

```text
Deploy Migration Job
       ↓
Run Migration
       ↓
Verify Success
       ↓
Deploy Application
```

For backward-compatible changes, the preferred sequence is:

```text
Add New Schema
       ↓
Deploy Compatible Application
       ↓
Migrate Data
       ↓
Switch Application Behavior
       ↓
Remove Deprecated Schema Later
```

Avoid destructive migrations during the same deployment as application changes that still depend on the old schema.

---

# 10. Zero-Downtime Migration Strategy

Database migrations should follow the expand-and-contract pattern.

## Phase 1 — Expand

Add new schema without removing old schema.

```text
Old Application
      +
New Database Structure
```

---

## Phase 2 — Migrate

Deploy code capable of supporting both versions.

Move or backfill data.

---

## Phase 3 — Switch

Deploy the application that uses the new schema.

---

## Phase 4 — Contract

After verifying the new application is stable:

```text
Remove Old Columns
Remove Deprecated Constraints
Remove Old Code
```

This prevents deployment failures when multiple API instances run different application versions during rolling deployment.

---

# 11. Financial Safety During Deployment

Deployments must not interrupt financial operations in a way that causes inconsistent state.

Before deployment:

```text
Check Active Jobs
Check Processing Withdrawals
Check Pending Provider Operations
```

During deployment:

```text
Graceful Shutdown
No New Requests
Finish Safe In-Flight Operations
Stop Workers Safely
```

After deployment:

```text
Restart API
Restart Workers
Verify Health
Verify Queue Processing
```

---

# 12. Graceful Shutdown

The API must handle termination signals.

When shutdown begins:

```text
Receive SIGTERM
      ↓
Stop Accepting New Requests
      ↓
Finish Safe In-Flight Requests
      ↓
Close Database Connections
      ↓
Exit
```

Workers should:

```text
Stop Fetching New Jobs
      ↓
Finish Current Safe Operation
      ↓
Acknowledge Completed Job
      ↓
Exit
```

If a worker crashes before acknowledging a job, the queue should make the job available for retry.

Financial idempotency guarantees must ensure the retry does not create duplicate financial effects.

---

# 13. Worker Deployment

Workers should be deployed separately from API instances.

Example:

```text
API Deployment
    ├── API Instance 1
    ├── API Instance 2
    └── API Instance 3

Worker Deployment
    ├── Worker 1
    └── Worker 2
```

This allows API and background workloads to scale independently.

---

# 14. Scheduler Deployment

The scheduler must avoid duplicate job creation.

If multiple scheduler instances are possible, the system must use:

* Distributed locking
* Leader election
* Database locking
* Queue-level deduplication

The exact mechanism depends on infrastructure.

Even with scheduler-level protection, downstream jobs must remain idempotent.

The system must assume:

> **A scheduled job may execute more than once.**

---

# 15. Health Checks

The API should expose health endpoints.

## Liveness

Example:

```http
GET /health
```

Purpose:

```text
Is the process alive?
```

The liveness check should be lightweight.

It should not fail simply because an external payment provider is temporarily unavailable.

---

## Readiness

Example:

```http
GET /ready
```

Purpose:

```text
Can this instance safely receive traffic?
```

The readiness check may verify:

* Database connectivity
* Required infrastructure

---

# 16. Dependency Health

External dependency failures must be handled carefully.

For example:

```text
Payment Provider Down
```

does not necessarily mean:

```text
Application Down
```

The API may remain operational while:

```text
Withdrawal Execution
```

is temporarily unavailable.

The system should distinguish:

```text
Application Health
Database Health
Queue Health
Payment Provider Health
```

---

# 17. Observability

The production system must provide:

```text
Logs
Metrics
Traces
Alerts
```

The objective is to answer:

```text
What happened?
When did it happen?
Which user was affected?
Which financial operation was involved?
What is the current state?
Was money moved?
```

---

# 18. Structured Logging

Logs must be structured.

Example:

```json
{
  "timestamp": "2026-07-18T12:00:00Z",
  "level": "info",
  "event": "withdrawal.failed",
  "withdrawalId": "wd_123",
  "userId": "usr_123",
  "paymentAttemptId": "pa_123",
  "correlationId": "req_123"
}
```

Financial events should include identifiers but never sensitive financial credentials.

---

# 19. Correlation IDs

Every request must have a correlation ID.

The ID should be propagated through:

```text
API Request
    ↓
Application Service
    ↓
Database Logs
    ↓
Background Job
    ↓
Payment Provider Request
    ↓
Webhook
```

This allows engineers to trace a financial operation across distributed components.

---

# 20. Metrics

Important metrics include:

## API

```text
Request Rate
Error Rate
Latency
5xx Rate
```

## Financial Operations

```text
Advance Payout Count
Settlement Count
Rejection Adjustment Count
Withdrawal Count
Withdrawal Failure Count
Recovery Count
```

## Provider

```text
Provider Success Rate
Provider Failure Rate
Provider Timeout Rate
Provider Latency
```

## Queue

```text
Queue Depth
Job Processing Time
Job Retry Count
Dead Letter Count
```

## Database

```text
Connection Pool Usage
Query Latency
Lock Wait Time
Transaction Rollback Rate
```

---

# 21. Financial Monitoring

Financial systems require business-level monitoring in addition to infrastructure monitoring.

Important alerts include:

```text
Unexpected Increase in Failed Withdrawals
Unexpected Increase in Recovery Operations
Duplicate Idempotency Violations
Large Number of Processing Payments
Ledger/Projection Mismatch
Unusual Negative Adjustments
Large Queue Backlog
```

---

# 22. Payment Provider Monitoring

Monitor:

```text
Provider Availability
Provider Latency
Timeout Rate
Failure Rate
Webhook Delivery Rate
Webhook Processing Failure Rate
```

A high timeout rate should trigger investigation.

However:

> **Provider timeout must never automatically be treated as financial failure.**

The payment state must remain unresolved until definitive information is available.

---

# 23. Alert Severity

Alerts should have severity levels.

## Critical

Examples:

```text
Ledger corruption detected
Ledger/projection mismatch
Database unavailable
Unexpected duplicate financial operation
```

Immediate investigation required.

---

## High

Examples:

```text
Payment provider unavailable
Large withdrawal failure spike
Recovery processing failure
Queue backlog growing rapidly
```

Prompt investigation required.

---

## Medium

Examples:

```text
Increased API latency
Elevated error rate
Worker retries increasing
```

Investigate during operational hours.

---

# 24. Database Backups

PostgreSQL must have automated backups.

The backup strategy should define:

```text
Backup Frequency
Retention Period
Storage Location
Encryption
Access Control
Recovery Procedure
```

Backups must be stored separately from the primary database environment.

---

# 25. Point-in-Time Recovery

Where supported, PostgreSQL should use:

```text
Base Backups
+
Write-Ahead Log Archiving
```

This enables point-in-time recovery.

The target recovery objectives should be defined as:

```text
RPO — Recovery Point Objective
RTO — Recovery Time Objective
```

Example:

```text
RPO = 5 minutes
RTO = 30 minutes
```

The exact targets depend on business requirements.

---

# 26. Backup Testing

A backup is not considered reliable until it has been restored successfully.

Recovery tests should periodically verify:

```text
Create Backup
      ↓
Restore Backup
      ↓
Verify Database
      ↓
Run Application
      ↓
Verify Financial Data
```

Restoration tests must confirm that:

* Ledger entries are intact
* Account projections can be rebuilt
* Financial relationships remain valid

---

# 27. Disaster Recovery

In a database disaster:

```text
Detect Failure
      ↓
Stop Financial Writes if Required
      ↓
Restore Database
      ↓
Verify Ledger Integrity
      ↓
Rebuild Projections if Required
      ↓
Verify Payment Operations
      ↓
Resume Traffic
```

The ledger must remain the source of truth.

If account projections are lost or corrupted, they must be recalculated from ledger history.

---

# 28. Ledger Reconciliation

The system should provide an internal reconciliation process.

Conceptually:

```text
Ledger
   ↓
Recalculate Expected Account State
   ↓
Compare With Projection
   ↓
Detect Difference
```

If:

```text
Expected Projection
        ≠
Stored Projection
```

the system must raise an alert.

The system must not silently overwrite financial data.

---

# 29. Projection Repair

If an account projection becomes inconsistent:

```text
1. Freeze affected financial operations if necessary
2. Identify discrepancy
3. Recalculate from ledger
4. Compare expected state
5. Apply controlled correction
6. Record operational audit information
7. Resume operations
```

Any correction must be auditable.

---

# 30. Incident Response

For a financial incident:

```text
Detect
  ↓
Contain
  ↓
Investigate
  ↓
Preserve Evidence
  ↓
Correct
  ↓
Reconcile
  ↓
Verify
  ↓
Resume
  ↓
Postmortem
```

The priority order is:

```text
1. Stop further financial damage
2. Preserve ledger integrity
3. Determine actual financial state
4. Recover affected operations
5. Restore normal service
```

---

# 31. Example Incident: Duplicate Withdrawal Risk

Suppose monitoring detects suspicious duplicate withdrawal attempts.

Immediate actions:

```text
1. Disable new withdrawal initiation if necessary
2. Keep existing provider processing state intact
3. Inspect ledger
4. Inspect withdrawal records
5. Inspect payment attempts
6. Check provider transaction IDs
7. Determine actual transferred amounts
8. Reconcile internal state
```

Do not blindly issue refunds or recovery credits before confirming the provider outcome.

---

# 32. Example Incident: Provider Outage

If the payment provider becomes unavailable:

```text
API
  ↓
Withdrawal Request
  ↓
Reserve Funds
  ↓
Provider Unavailable
```

The system must:

```text
Keep Funds Reserved
Mark Operation Processing/Unknown
Avoid Automatic Recovery
Retry or Reconcile According to Provider Rules
```

Users should not be credited back until the system has definitive evidence that the provider did not complete the transfer.

---

# 33. Example Incident: Database Outage

If PostgreSQL becomes unavailable:

```text
API Requests
      ↓
Database Failure
```

The system should fail safely.

Financial operations must not partially execute.

No external payment request should be made unless the required internal financial reservation has been committed successfully.

---

# 34. Deployment Rollback

Rollback must distinguish between:

```text
Application Rollback
```

and:

```text
Database Rollback
```

Application rollback:

```text
Deploy Previous Application Artifact
```

Database rollback should not blindly reverse financial migrations.

For financial systems, destructive database rollbacks are dangerous.

Prefer:

```text
Forward-Compatible Migration
+
Corrective Migration
```

over destructive rollback.

---

# 35. Financial Operation Rollback

Financial transactions must never be "rolled back" by deleting history.

Incorrect:

```text
Delete Ledger Entry
```

Correct:

```text
Original Ledger Entry
        +
Corrective Ledger Entry
```

The ledger remains append-only.

---

# 36. Deployment Verification

After deployment:

```text
1. Check API Health
2. Check Readiness
3. Check Database Connectivity
4. Check Worker Health
5. Check Queue Processing
6. Check Scheduler
7. Check Payment Provider Connectivity
8. Run Smoke Tests
9. Monitor Error Rate
10. Monitor Financial Metrics
```

---

# 37. Smoke Tests

Production smoke tests should verify non-destructive operations.

Examples:

```text
GET /health
GET /ready
Authenticated API Request
Database Read
```

Do not perform real money movement as part of automated deployment smoke tests unless the provider explicitly supports a safe sandbox transaction.

---

# 38. Deployment Monitoring Window

After deployment, monitor:

```text
API Error Rate
Latency
Database Errors
Transaction Rollbacks
Queue Backlog
Worker Failures
Payment Provider Errors
Webhook Failures
Recovery Operations
```

The first monitoring period after deployment should receive increased attention.

---

# 39. Operational Runbooks

The repository should contain runbooks for common incidents.

Recommended:

```text
docs/runbooks/
├── database-outage.md
├── payment-provider-outage.md
├── duplicate-withdrawal.md
├── ledger-projection-mismatch.md
├── queue-backlog.md
├── webhook-failure.md
└── deployment-rollback.md
```

Each runbook should explain:

```text
Detection
Impact
Immediate Actions
Investigation
Recovery
Verification
Post-Incident Actions
```

---

# 40. Operational Access Control

Production access must follow least privilege.

Separate roles should exist for:

```text
Application Runtime
Developer
Operations
Database Administrator
Security Administrator
```

Not every engineer should have direct production database write access.

Financial data modifications must be tightly controlled.

---

# 41. Production Database Access

Direct production database modifications should be avoided.

Normal financial operations must go through application workflows.

If emergency database access is required:

```text
1. Incident Created
2. Access Approved
3. Action Logged
4. Change Executed
5. Result Verified
6. Access Revoked
```

Any financial correction must preserve auditability.

---

# 42. Secrets Management

Secrets should be stored in a dedicated secret-management solution.

Examples include:

```text
Cloud Secret Manager
Vault
Managed Key Management System
```

Secrets should support:

```text
Rotation
Access Control
Audit Logging
Revocation
```

---

# 43. Secret Rotation

Rotating secrets must not cause unnecessary downtime.

For example:

```text
Generate New Secret
      ↓
Deploy Application Supporting New Secret
      ↓
Rotate Provider Configuration
      ↓
Verify
      ↓
Revoke Old Secret
```

The exact strategy depends on the external provider.

---

# 44. Scaling Strategy

The API should scale horizontally:

```text
API 1
API 2
API 3
```

The application must remain stateless wherever practical.

State should be stored in:

```text
PostgreSQL
Queue
Object Storage
```

rather than local application memory.

---

# 45. Worker Scaling

Workers can scale independently.

Example:

```text
Low Load
2 Workers

High Load
10 Workers
```

Scaling workers must not violate financial invariants.

The system must remain correct even if:

```text
Worker A
Worker B
Worker C
```

process the same logical operation concurrently.

Database constraints and transaction boundaries remain the final protection.

---

# 46. Database Scaling

PostgreSQL is the primary transactional system.

Scaling strategies may include:

```text
Connection Pooling
Read Replicas
Query Optimization
Indexing
Partitioning
```

However, financial writes must continue to use the authoritative primary database.

Read replicas must not be used for decisions where stale data could cause financial inconsistency.

For example:

```text
Can User Withdraw ₹500?
```

must be determined using authoritative transactional state.

---

# 47. Queue Backpressure

If background jobs grow faster than workers can process them:

```text
Queue Depth ↑
```

The system should:

```text
Monitor
Alert
Scale Workers
Investigate Slow Jobs
```

The system must not bypass transactional safeguards simply to reduce queue size.

---

# 48. Graceful Degradation

When a non-critical dependency fails, the system should continue serving unaffected functionality.

Example:

```text
Payment Provider Down
```

The system may still allow:

```text
View Account
View Ledger
View Sales
Admin Reconciliation
```

while temporarily restricting:

```text
New Withdrawal Execution
```

The exact behavior must follow business requirements.

---

# 49. Operational Definition of Done

Production deployment is considered successful when:

```text
[ ] Application deployed
[ ] Database migrations successful
[ ] Health checks pass
[ ] Readiness checks pass
[ ] Workers running
[ ] Scheduler running
[ ] Queue processing normally
[ ] Payment provider connectivity verified
[ ] Webhooks functioning
[ ] Error rates normal
[ ] Financial metrics normal
[ ] No ledger/projection mismatch
[ ] Monitoring active
[ ] Alerts active
```

---

# 50. Final Operational Principle

The system must always prioritize:

```text
Financial Correctness
        ↓
Data Durability
        ↓
Security
        ↓
Availability
        ↓
Performance
```

The system must never sacrifice financial correctness to achieve availability or performance.

The core operational rule is:

> **When the system does not know whether money moved, it must preserve the uncertain state until the truth can be established.**

Therefore:

```text
Timeout ≠ Failure
Unknown ≠ Failure
Retry ≠ Duplicate Financial Operation
Rollback ≠ Delete Financial History
Recovery ≠ Automatic Guess
```

The architecture is successful when the system can survive:

```text
Application Crashes
Database Failures
Worker Retries
Duplicate Webhooks
Concurrent Requests
Provider Timeouts
Provider Outages
Deployment Failures
```

while preserving the integrity of the financial ledger.

That is the ultimate operational requirement of this system.
