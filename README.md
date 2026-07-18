# User Payout Management System

A backend system for managing affiliate user earnings, advance payouts, final settlements, withdrawals, and payout failure recovery.

## Overview

The User Payout Management System manages the complete financial lifecycle of affiliate sales.

When an affiliate sale is created, it initially enters a `PENDING` state. Eligible pending sales may receive an advance payout equal to 10% of their total earnings. Later, an administrator reconciles the sale as either `APPROVED` or `REJECTED`.

For approved sales, the system pays the remaining eligible earnings after accounting for the advance already paid. For rejected sales, the system creates a negative adjustment to recover any advance that was previously issued.

Affiliate users can withdraw their available balance, subject to a rolling 24-hour withdrawal restriction. If an external payment provider reports that a withdrawal has failed, been cancelled, or rejected, the system restores the withdrawn amount exactly once and makes the recovered funds available again.

The system is designed with a focus on **financial correctness, auditability, idempotency, concurrency safety, and reliable failure recovery**.

---

## Core Features

* Affiliate user and account management
* Affiliate sale management
* Pending, approved, and rejected sale lifecycle
* 10% advance payout processing
* Idempotent advance payout handling
* Administrator-driven sale reconciliation
* Final settlement calculation
* Negative adjustment for rejected sales
* Immutable append-only financial ledger
* Centralized balance projection service
* Withdrawable balance projection
* One withdrawal per rolling 24-hour window
* Concurrent withdrawal protection
* External payment provider integration
* Payment attempt history and idempotent retries
* Payment failure handling
* Failed payout recovery
* Transactional financial operations
* Audit-friendly financial history

---

## Business Flow

The high-level financial lifecycle is:

```text
Affiliate Sale
      |
      v
   PENDING
      |
      +----------------------+
      |                      |
      v                      v
Advance Payout         Administrator
   (10%)               Reconciliation
                              |
                    +---------+---------+
                    |                   |
                    v                   v
                APPROVED             REJECTED
                    |                   |
                    v                   v
             Final Settlement    Negative Adjustment
                    |                   |
                    +---------+---------+
                              |
                              v
                    User Account Balance
                              |
                              v
                         Withdrawal
                              |
                              v
                     Payment Provider
                              |
                    +---------+---------+
                    |                   |
                    v                   v
                 SUCCESS          FAILED/CANCELLED/
                                  REJECTED
                                      |
                                      v
                              Balance Recovery
```

---

## Financial Model

The system uses an **append-only ledger** as the source of truth for financial movements.

A user's account balance is maintained as a materialized balance projection for efficient reads.

The general model is:

```text
Immutable Ledger
       |
       v
Financial History
       |
       v
Balance Projection
       |
       v
Withdrawable Balance
```

Financial records are never modified or deleted to correct previous transactions. Instead, the system creates a new compensating ledger entry.

For example:

```text
ADVANCE
+₹4

REJECTION_ADJUSTMENT
-₹4
```

The original advance remains part of the permanent financial history.

---

## Key Business Rules

### Advance Payout

* Every eligible `PENDING` sale can receive an advance equal to 10% of its earnings.
* A sale can have at most one successful advance payout.
* Repeated background job execution must not create duplicate successful advances.
* Failed payment attempts may be retried.
* A successful financial ledger entry is recorded only for a successfully completed advance payout.

### Sale Reconciliation

For an approved sale:

```text
Final Settlement
= Total Earnings - Successful Advance Paid
```

For a rejected sale:

```text
Final Adjustment
= -Successful Advance Paid
```

Example:

| Sale Status | Earnings | Advance | Final Adjustment |
| ----------- | -------: | ------: | ---------------: |
| Approved    |      ₹40 |      ₹4 |             +₹36 |
| Rejected    |      ₹40 |      ₹4 |              -₹4 |

A sale can be reconciled only once.

### Withdrawals

* A user can withdraw only available withdrawable funds.
* Withdrawal amount must be greater than zero.
* A withdrawal cannot exceed the available balance.
* A user is limited to one withdrawal within a rolling 24-hour window.
* An active `PROCESSING` withdrawal prevents another withdrawal.
* Failed, cancelled, or rejected withdrawals can be recovered and retried.

### Failed Payout Recovery

When a withdrawal fails, is cancelled, or is rejected:

1. The withdrawal is marked with the appropriate terminal failure status.
2. The withdrawn amount is restored.
3. A compensating recovery ledger entry is created.
4. The account balance projection is updated.
5. The recovery operation is performed exactly once.

Repeated webhook notifications must not restore the same amount multiple times.

---

## Architecture

The system follows a **Modular Monolith** architecture.

```text
                         Client
                           |
                           v
                    REST API Layer
                           |
          +----------------+----------------+
          |                |                |
          v                v                v
      Sale Module     Payout Module    Withdrawal Module
          |                |                |
          +----------------+----------------+
                           |
                           v
                     Ledger Module
                           |
                           v
                      PostgreSQL
                           ^
                           |
                  Payment Provider
```

The major logical modules are:

* **User Module** — manages affiliate users.
* **Account Module** — manages financial accounts and balance projections.
* **Sale Module** — manages sale creation and lifecycle.
* **Advance Payout Module** — manages advance payout eligibility and lifecycle.
* **Withdrawal Module** — manages withdrawal requests and restrictions.
* **PaymentAttempt Module** — manages provider attempt history and idempotent retries.
* **Ledger Module** — manages immutable financial records and projection updates.
* **Projection Service** — centralizes withdrawable and recovery balance routing.
* **Workflows Layer** — composes domain services into business processes such as advance payout.

---

## Technology Stack

The planned technology stack is:

* **Runtime:** Node.js
* **Framework:** Express.js
* **Language:** JavaScript
* **Database:** PostgreSQL
* **API Style:** REST
* **Testing:** Jest
* **Containerization:** Docker
* **Database Migrations:** Migration-based schema management

---

## Project Structure

```text
user-payout-management-system/
│
├── README.md
│
├── docs/
│   ├── 01-requirements.md
│   ├── 02-domain-model.md
│   ├── 03-system-design.md
│   ├── 04-database-design.md
│   ├── 05-api-design.md
│   ├── 06-state-machines.md
│   ├── 07-financial-and-ledger-flows.md
│   ├── 08-concurrency-and-idempotency.md
│   ├── 09-error-handling-and-failure-recovery.md
│   ├── 10-security-and-access-control.md
│   ├── 11-implementation-plan.md
│   ├── 12-testing-strategy.md
│   ├── 13-local-development.md
│   ├── 14-deployment-and-operations.md
│   └── 15-observability-and-monitoring.md
│
├── src/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── modules/
│   │   ├── accounts/
│   │   ├── advance-payouts/
│   │   ├── ledger/
│   │   ├── payment-attempts/
│   │   ├── sales/
│   │   ├── users/
│   │   ├── workflows/
│   │   └── withdrawals/
│   ├── shared/
│   ├── app.js
│   └── index.js
│
├── tests/
│   └── modules/
│
├── prisma/
│
├── .env.example
├── .gitignore
├── package.json
└── Dockerfile
```

---

## Documentation

The detailed design and implementation decisions are documented separately:

| Document                                        | Description                                                     |
| ----------------------------------------------- | --------------------------------------------------------------- |
| [Requirements](docs/01-requirements.md)         | Functional requirements, actors, business rules, and invariants |
| [Domain Model](docs/02-domain-model.md)         | Core entities, responsibilities, relationships, and lifecycles  |
| [System Design](docs/03/system-design.md)       | Architecture, modules, transactions, and concurrency strategy   |
| [Database Design](docs/04-database-design.md)   | Database schema, relationships, constraints, and indexes        |
| [API Design](docs/05-api-design.md)             | REST API endpoints, requests, responses, and errors             |
| [State Machines](docs/06-state-machines.md)     | Lifecycle and valid state transitions for domain entities      |
| [Financial & Ledger Flows](docs/07-financial-and-ledger-flows.md) | Ledger and balance projection flows                          |
| [Concurrency & Idempotency](docs/08-concurrency-and-idempotency.md) | Race conditions, retries, and idempotency                    |
| [Error Handling & Failure Recovery](docs/09-error-handling-and-failure-recovery.md) | Failure scenarios and recovery logic    |
| [Security & Access Control](docs/10-security-and-access-control.md) | Authentication, authorization, and access control          |
| [Implementation Plan](docs/11-implementation-plan.md) | Roadmap, phases, and development strategy                     |
| [Testing Strategy](docs/12-testing-strategy.md) | Test plan, coverage, and verification strategy                  |
| [Local Development](docs/13-local-development.md) | Local setup and developer workflow                            |
| [Deployment & Operations](docs/14-deployment-and-operations.md) | Deployment and production operations                         |
| [Observability & Monitoring](docs/15-observability-and-monitoring.md) | Logging, metrics, and monitoring                              |

---

## Getting Started

### Prerequisites

Install the following:

* Node.js 20+
* PostgreSQL 15+
* npm
* Docker (optional)

### Installation

Clone the repository and install dependencies:

```bash
npm install
```

### Environment Configuration

Create a local environment file:

```bash
cp .env.example .env
```

Configure the required environment variables.

Example:

```env
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/payout_db
PAYMENT_PROVIDER_URL=
PAYMENT_PROVIDER_API_KEY=
```

### Database Setup

Configure your environment with a PostgreSQL-compatible `DATABASE_URL`, for example using Neon.

Then run the Prisma migrations:

```bash
npm run db:migrate
```

### Start the Application

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

### Run Tests

```bash
npm test
```

---

## Testing Strategy

The system should be tested at multiple levels.

### Unit Tests

Test individual business rules:

* Advance calculation
* Settlement calculation
* Rejection adjustment
* Withdrawal eligibility
* 24-hour restriction
* Idempotency checks

### Integration Tests

Test interactions between:

* Services and repositories
* Database transactions
* Ledger and balance projection
* Payment provider adapter

### End-to-End Tests

Test complete business workflows:

```text
Sale Creation
    ↓
Advance Payout
    ↓
Sale Reconciliation
    ↓
Final Settlement
    ↓
Withdrawal
    ↓
Payment Result
    ↓
Recovery if Required
```

### Critical Concurrency Tests

The system must verify:

* Two workers processing the same advance.
* Two concurrent withdrawals.
* Duplicate payment webhooks.
* Duplicate recovery attempts.
* Concurrent sale reconciliation.

---

## Design Principles

### 1. Financial History Is Immutable

Existing ledger records are never edited or deleted.

### 2. Ledger Is the Source of Truth

Financial history is represented through append-only ledger entries.

### 3. Balance Is a Projection

The account balance is maintained for fast access but must remain consistent with ledger transactions.

### 4. Idempotency Is Mandatory

Operations that may be retried must produce the same financial result when executed multiple times.

### 5. Database Constraints Protect Invariants

Critical business rules should be enforced at both application and database levels where possible.

### 6. Financial Operations Are Transactional

Related ledger and balance updates must succeed or fail together.

### 7. External Integrations Are Isolated

Payment provider-specific logic is separated from core business logic through an adapter/interface.

### 8. Concurrency Must Be Explicitly Handled

Financial operations must remain correct when multiple requests or workers execute simultaneously.

---

## Future Improvements

The current design intentionally uses a modular monolith suitable for the assignment.

Possible future improvements include:

* Authentication and authorization
* Role-based access control
* Production payment provider integration
* Outbox pattern for reliable event delivery
* Message queue for background processing
* Double-entry accounting
* Dedicated reconciliation service
* Observability and distributed tracing
* Audit event stream
* Automated financial reconciliation
* Microservice decomposition if scale requires it

---

## Assignment Scope

This project demonstrates the design and implementation of a production-oriented payout management system with emphasis on:

* Low-Level Design
* Database Design
* API Design
* Financial correctness
* Idempotency
* Concurrency control
* Failure recovery
* Auditability
* Clean architecture
* Testability
