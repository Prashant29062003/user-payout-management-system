# Local Development Guide

## 1. Purpose

This document explains how to set up, run, test, and develop the User Payout Management System locally.

The goal is to provide a reproducible development environment for:

* Backend API
* PostgreSQL database
* Background workers
* Payment provider integration
* Webhook handling
* Automated tests

A developer following this document should be able to go from a fresh repository clone to a fully functioning local development environment.

---

# 2. Development Architecture

The local development environment consists of:

```text
Developer
    │
    ▼
API Server
    │
    ├──────────────► PostgreSQL
    │
    ├──────────────► Background Worker
    │
    └──────────────► Payment Provider
                         │
                         ▼
                      Webhooks
                         │
                         ▼
                    API Server
```

For local development, the external payment provider should be replaced with a test or sandbox environment.

---

# 3. Prerequisites

The following tools are required.

## Required

* Git
* Node.js
* npm
* PostgreSQL
* Docker
* Docker Compose

Recommended versions should be documented in the repository.

Example:

```text
Node.js >= 20
npm >= 10
PostgreSQL >= 16
Docker >= 24
Docker Compose >= 2
```

The exact versions should match the project's implementation.

---

# 4. Clone the Repository

Clone the repository:

```bash
git clone <repository-url>
```

Navigate into the project:

```bash
cd <project-directory>
```

Install dependencies:

```bash
npm install
```

---

# 5. Project Structure

The repository should follow a structure similar to:

```text
.
├── src/
│   ├── modules/
│   │   ├── users/
│   │   ├── accounts/
│   │   ├── sales/
│   │   ├── ledger/
│   │   ├── payouts/
│   │   ├── withdrawals/
│   │   └── payments/
│   │
│   ├── shared/
│   │   ├── database/
│   │   ├── errors/
│   │   ├── logging/
│   │   └── security/
│   │
│   └── app/
│
├── migrations/
├── tests/
├── docs/
├── scripts/
├── docker-compose.yml
├── .env.example
├── package.json
└── README.md
```

The exact structure may differ based on the final implementation.

The important principle is that the repository structure should reflect the architectural boundaries defined in:

```text
docs/03-system-design.md
```

---

# 6. Environment Variables

The application must never commit secrets directly to Git.

Create a local environment file:

```bash
cp .env.example .env
```

Example configuration:

```env
NODE_ENV=development

PORT=3000

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/payouts

JWT_SECRET=development-secret

PAYMENT_PROVIDER_BASE_URL=http://localhost:4000

PAYMENT_PROVIDER_API_KEY=test-api-key

WEBHOOK_SECRET=test-webhook-secret

LOG_LEVEL=debug
```

The actual variables must match the application implementation.

---

# 7. Environment Variable Rules

Environment variables must be classified into:

## Required

The application cannot start without these values.

Example:

```text
DATABASE_URL
JWT_SECRET
```

## Optional

The application can start without these values.

Example:

```text
LOG_LEVEL
```

## Development Only

Used only in local development.

Example:

```text
MOCK_PAYMENT_PROVIDER=true
```

## Production Secrets

These must never be committed.

Examples:

```text
Production database credentials
Production API keys
JWT secrets
Webhook secrets
Payment provider credentials
```

---

# 8. Start PostgreSQL

The recommended local approach is Docker.

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Verify that the container is running:

```bash
docker compose ps
```

Expected:

```text
postgres    running
```

---

# 9. Database Setup

After PostgreSQL starts, run database migrations.

Example:

```bash
npm run db:migrate
```

The migration process must be deterministic.

A new developer should be able to create the entire database schema from an empty database using migrations alone.

---

# 10. Database Migration Rules

Database schema changes must always be performed through migrations.

Do not manually modify the database schema in development and assume the application will work elsewhere.

Every schema change should include:

```text
Migration
    ↓
Migration Test
    ↓
Application Update
```

Migrations must be:

* Version-controlled
* Repeatable
* Reviewable
* Ordered
* Safe to execute in deployment environments

---

# 11. Seed Development Data

If the project provides seed data, run:

```bash
npm run db:seed
```

Seed data should include realistic examples such as:

```text
Users
Accounts
Pending Sales
Approved Sales
Rejected Sales
Advance Payouts
Settlements
Withdrawals
Payment Attempts
Ledger Entries
```

Seed data must never contain real customer information.

---

# 12. Start the API

Start the development server:

```bash
npm run dev
```

The API should become available at:

```text
http://localhost:3000
```

The actual port must match the application configuration.

---

# 13. Health Check

The application should provide a health endpoint.

Example:

```http
GET /health
```

Expected response:

```json
{
  "status": "ok"
}
```

A deeper readiness endpoint may also be provided:

```http
GET /ready
```

This should verify critical dependencies such as:

* Database connectivity
* Required infrastructure

---

# 14. Start the Background Worker

The payout system contains background jobs.

Start the worker:

```bash
npm run worker
```

The worker is responsible for tasks such as:

```text
Advance payout processing
Payment status processing
Retry processing
Reconciliation tasks
```

The exact responsibilities must follow the architecture defined in:

```text
docs/03-system-design.md
```

---

# 15. Scheduler

The advance payout process is triggered by a scheduler.

In development, the scheduler may be implemented using:

* Cron
* Application scheduler
* Queue-based delayed jobs

For local development, it should be possible to trigger the job manually.

Example:

```bash
npm run job:advance-payout
```

This makes testing easier than waiting for a scheduled execution.

---

# 16. Payment Provider

The application communicates with an external payment provider.

Local development should use either:

```text
Sandbox Provider
```

or:

```text
Mock Payment Provider
```

The application must never make real financial transfers during development.

The provider integration should support test responses such as:

```text
SUCCESS
FAILED
REJECTED
CANCELLED
PROCESSING
TIMEOUT
```

---

# 17. Local Webhook Testing

Webhook endpoints must be testable locally.

Example:

```http
POST /api/v1/webhooks/payment-provider
```

The webhook request must include the required signature headers.

For local testing, developers may use:

```text
Provider CLI
Webhook Tunnel
Local Mock Provider
```

The exact tool depends on the payment provider implementation.

The webhook flow is:

```text
Payment Provider
       │
       ▼
Webhook
       │
       ▼
Signature Verification
       │
       ▼
Event Validation
       │
       ▼
Idempotency Check
       │
       ▼
Payment State Update
       │
       ▼
Recovery if Required
```

---

# 18. Running Unit Tests

Run unit tests:

```bash
npm test
```

Unit tests should cover:

* Money calculations
* Domain rules
* State transitions
* Account projection logic
* Business invariants

---

# 19. Running Integration Tests

Integration tests require PostgreSQL.

Example:

```bash
npm run test:integration
```

Integration tests should verify:

* Database constraints
* Transactions
* Ledger operations
* Account projections
* Repository behavior
* Locking
* Idempotency

---

# 20. Running Concurrency Tests

Concurrency tests should run against a real PostgreSQL database.

Example:

```bash
npm run test:concurrency
```

These tests should verify:

```text
Concurrent Withdrawals
Concurrent Reconciliation
Concurrent Advance Processing
Concurrent Recovery
```

Concurrency tests must not rely only on mocks.

---

# 21. Running End-to-End Tests

Run:

```bash
npm run test:e2e
```

These tests should exercise complete workflows.

Example:

```text
Create Sale
    ↓
Advance Payout
    ↓
Admin Reconciliation
    ↓
Settlement
    ↓
Withdrawal
    ↓
Provider Response
    ↓
Final Account State
```

---

# 22. Run the Complete Test Suite

The complete verification command should be:

```bash
npm run test:all
```

It should execute the appropriate test layers:

```text
Unit
Integration
API
Security
Concurrency
E2E
```

The exact command should be documented in `package.json`.

---

# 23. Code Quality Checks

Before submitting changes, run:

```bash
npm run lint
```

Then:

```bash
npm run typecheck
```

Then:

```bash
npm run format:check
```

Finally:

```bash
npm run build
```

All commands must pass before creating a pull request.

---

# 24. Recommended Development Workflow

The recommended workflow is:

```text
1. Read the relevant documentation
        ↓
2. Understand the business invariant
        ↓
3. Create or update the domain model
        ↓
4. Write tests
        ↓
5. Implement the application logic
        ↓
6. Add database constraints
        ↓
7. Run unit tests
        ↓
8. Run integration tests
        ↓
9. Run concurrency tests
        ↓
10. Review financial invariants
        ↓
11. Update documentation
```

---

# 25. Working on a New Feature

Before implementing a feature, identify:

```text
Business Rule
Domain Entity
State Transition
Database Changes
API Changes
Concurrency Risks
Idempotency Requirements
Failure Scenarios
Security Requirements
Tests
```

Example:

For a new withdrawal feature:

```text
Business Rule
    ↓
Withdrawal Domain Model
    ↓
Database Tables
    ↓
Reservation Transaction
    ↓
Payment Attempt
    ↓
Provider Integration
    ↓
Webhook
    ↓
Recovery
    ↓
Concurrency Tests
```

---

# 26. Database Reset

For local development, the database may be reset when required.

Example:

```bash
npm run db:reset
```

This operation must only be available in development or test environments.

It must never be possible to accidentally reset a production database.

---

# 27. Logs

The application should emit structured logs.

Example:

```json
{
  "level": "info",
  "event": "withdrawal.created",
  "withdrawalId": "wd_123",
  "userId": "usr_123",
  "correlationId": "req_123"
}
```

Financial operations should always include enough identifiers to trace the operation.

Sensitive information must not be logged.

Never log:

```text
Passwords
Authentication tokens
Payment credentials
Full card numbers
Webhook secrets
```

---

# 28. Correlation IDs

Every incoming request should have a correlation ID.

If the client provides one, the application may validate and propagate it.

Otherwise, the application should generate one.

The same correlation ID should be propagated through:

```text
API Request
    ↓
Service
    ↓
Database Operation
    ↓
Background Job
    ↓
Payment Provider Request
    ↓
Webhook
```

This makes production debugging significantly easier.

---

# 29. Debugging a Financial Operation

When debugging a financial issue, follow this sequence:

```text
1. Find Correlation ID
        ↓
2. Identify User
        ↓
3. Identify Account
        ↓
4. Identify Business Operation
        ↓
5. Inspect Ledger Entries
        ↓
6. Inspect Account Projection
        ↓
7. Inspect Payment Attempts
        ↓
8. Inspect Provider Events
        ↓
9. Reconcile Ledger vs Projection
```

The ledger should always be treated as the financial source of truth.

---

# 30. Common Development Problems

## Database Connection Failed

Check:

```text
PostgreSQL is running
DATABASE_URL is correct
Database exists
Port is available
```

---

## Migration Failed

Check:

```text
Migration order
Database state
Previous migration errors
```

Never manually modify migration history to hide a failed migration.

---

## Tests Fail Because of Existing Data

Reset the test database.

Tests must not depend on persistent local data.

---

## Webhook Not Received

Check:

```text
Webhook URL
Tunnel configuration
Provider configuration
Signature
Application logs
```

---

## Duplicate Financial Operation During Development

Check:

```text
Idempotency Key
Database Unique Constraint
Transaction Boundary
Concurrency Lock
```

Do not simply add an application-level boolean flag without understanding the underlying race condition.

---

# 31. Docker Development

The recommended local infrastructure can be started with:

```bash
docker compose up -d
```

Stop infrastructure:

```bash
docker compose down
```

View logs:

```bash
docker compose logs -f
```

Restart:

```bash
docker compose restart
```

The exact Docker Compose services should be documented in:

```text
docker-compose.yml
```

---

# 32. Recommended Docker Services

At minimum:

```text
postgres
```

Optional services:

```text
redis
mock-payment-provider
```

The final service list depends on the implementation.

---

# 33. Git Workflow

Create a feature branch:

```bash
git checkout -b feature/withdrawal-recovery
```

Make changes.

Run:

```bash
npm run lint
npm run typecheck
npm test
```

Commit:

```bash
git add .
git commit -m "feat: add withdrawal recovery"
```

Push:

```bash
git push origin feature/withdrawal-recovery
```

Create a pull request.

---

# 34. Pull Request Checklist

Before opening a pull request:

```text
[ ] Business requirements reviewed
[ ] Relevant documentation reviewed
[ ] Tests added
[ ] Unit tests pass
[ ] Integration tests pass
[ ] Concurrency tests pass where required
[ ] Security checks completed
[ ] Database migrations included
[ ] API documentation updated
[ ] Error handling implemented
[ ] Logging added
[ ] Correlation IDs propagated
[ ] No secrets committed
[ ] No debug code committed
[ ] Build succeeds
```

---

# 35. Production Safety

The local development environment must be clearly separated from production.

Never:

```text
Use production credentials locally
Use production payment keys for testing
Run destructive database commands against production
Commit secrets to Git
Test real withdrawals during development
```

Production credentials must be managed through a secure secret-management system.

---

# 36. Development Environment Definition of Done

A developer environment is considered ready when:

```text
[ ] Repository cloned
[ ] Dependencies installed
[ ] Environment variables configured
[ ] PostgreSQL running
[ ] Migrations applied
[ ] Seed data loaded
[ ] API running
[ ] Worker running
[ ] Health check passes
[ ] Unit tests pass
[ ] Integration tests pass
[ ] Concurrency tests pass
[ ] E2E tests pass
```

---

# 37. Quick Start

For an experienced developer, the setup should be approximately:

```bash
git clone <repository-url>

cd <project-directory>

npm install

cp .env.example .env

docker compose up -d postgres

npm run db:migrate

npm run db:seed

npm run dev
```

In another terminal:

```bash
npm run worker
```

Verify:

```bash
curl http://localhost:3000/health
```

Run tests:

```bash
npm run test:all
```

The exact commands must be updated to match the final implementation.

---

# 38. Final Development Principle

The development environment should make the safe path the easy path.

A developer should be able to:

```text
Clone
  ↓
Configure
  ↓
Migrate
  ↓
Run
  ↓
Test
  ↓
Develop
```

without manually modifying financial data or database structures.

The local environment must behave as closely as practical to the production architecture while ensuring that no real financial transactions can occur.

The key principle is:

> **If the system cannot be reliably reproduced locally, it cannot be reliably maintained in production.**
