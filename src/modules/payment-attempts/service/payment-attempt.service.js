import { paymentAttemptRepository } from '../repository/payment-attempt.repository.js';
import { NotFoundError, BusinessRuleViolationError } from '../../../shared/errors/index.js';
import { PaymentStatus } from '../../../shared/constants/index.js';

function validateStatus(status) {
  const validStatuses = Object.values(PaymentStatus);
  if (!validStatuses.includes(status)) {
    throw new BusinessRuleViolationError(`Invalid payment attempt status: ${status}`);
  }
}

function validateStatusTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  const transitions = {
    PENDING: [PaymentStatus.PROCESSING, PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.REJECTED],
    PROCESSING: [PaymentStatus.SUCCESS, PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.REJECTED],
    FAILED: [PaymentStatus.PROCESSING, PaymentStatus.CANCELLED],
    SUCCESS: [],
    CANCELLED: [],
    REJECTED: [],
  };

  const allowed = transitions[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessRuleViolationError(`Cannot transition payment attempt from ${currentStatus} to ${nextStatus}`);
  }
}

export class PaymentAttemptService {
  constructor(repository = paymentAttemptRepository) {
    this.repository = repository;
  }

  async startAttempt(attributes) {
    const status = attributes.status ?? PaymentStatus.PROCESSING;
    validateStatus(status);

    if (attributes.idempotencyKey) {
      const existing = await this.repository.findByIdempotencyKey(attributes.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    return this.repository.create({ ...attributes, status });
  }

  async getAttemptById(attemptId) {
    const attempt = await this.repository.findById(attemptId);
    if (!attempt) {
      throw new NotFoundError(`Payment attempt with id ${attemptId} not found`);
    }
    return attempt;
  }

  async getAttemptByIdempotencyKey(idempotencyKey) {
    return this.repository.findByIdempotencyKey(idempotencyKey);
  }

  async findAttemptsByWithdrawalId(withdrawalId) {
    return this.repository.findByWithdrawalId(withdrawalId);
  }

  async findLatestAttempt(withdrawalId) {
    return this.repository.findLatestAttempt(withdrawalId);
  }

  async markProcessing(attemptId) {
    return this.changeStatus(attemptId, PaymentStatus.PROCESSING);
  }

  async markSucceeded(attemptId) {
    return this.changeStatus(attemptId, PaymentStatus.SUCCESS);
  }

  async markFailed(attemptId) {
    return this.changeStatus(attemptId, PaymentStatus.FAILED);
  }

  async markCancelled(attemptId) {
    return this.changeStatus(attemptId, PaymentStatus.CANCELLED);
  }

  async markRejected(attemptId) {
    return this.changeStatus(attemptId, PaymentStatus.REJECTED);
  }

  async changeStatus(attemptId, nextStatus) {
    validateStatus(nextStatus);

    const attempt = await this.repository.findById(attemptId);
    if (!attempt) {
      throw new NotFoundError(`Payment attempt with id ${attemptId} not found`);
    }

    validateStatusTransition(attempt.status, nextStatus);

    if (attempt.status === nextStatus) {
      return attempt;
    }

    return this.repository.updateStatus(attemptId, nextStatus);
  }
}

export const paymentAttemptService = new PaymentAttemptService();
