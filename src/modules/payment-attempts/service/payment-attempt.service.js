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

  async startAttempt(attributes, tx = null) {
    const status = attributes.status ?? PaymentStatus.PROCESSING;
    validateStatus(status);

    const repository = tx ? new this.repository.constructor(tx) : this.repository;

    if (attributes.idempotencyKey) {
      const existing = await repository.findByIdempotencyKey(attributes.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    return repository.create({ ...attributes, status });
  }

  async getAttemptById(attemptId, tx = null) {
    const repository = tx ? new this.repository.constructor(tx) : this.repository;
    const attempt = await repository.findById(attemptId);
    if (!attempt) {
      throw new NotFoundError(`Payment attempt with id ${attemptId} not found`);
    }
    return attempt;
  }

  async getAttemptByIdempotencyKey(idempotencyKey, tx = null) {
    const repository = tx ? new this.repository.constructor(tx) : this.repository;
    return repository.findByIdempotencyKey(idempotencyKey);
  }

  async attachProviderDetails(attemptId, provider, providerReference, tx = null) {
    const repository = tx ? new this.repository.constructor(tx) : this.repository;
    return repository.update(attemptId, { provider, providerReference });
  }

  async findAttemptsByWithdrawalId(withdrawalId, tx = null) {
    const repository = tx ? new this.repository.constructor(tx) : this.repository;
    return repository.findByWithdrawalId(withdrawalId);
  }

  async findLatestAttempt(withdrawalId, tx = null) {
    const repository = tx ? new this.repository.constructor(tx) : this.repository;
    return repository.findLatestAttempt(withdrawalId);
  }

  async markProcessing(attemptId, tx = null) {
    return this.changeStatus(attemptId, PaymentStatus.PROCESSING, tx);
  }

  async markSucceeded(attemptId, tx = null) {
    return this.changeStatus(attemptId, PaymentStatus.SUCCESS, tx);
  }

  async markFailed(attemptId, tx = null) {
    return this.changeStatus(attemptId, PaymentStatus.FAILED, tx);
  }

  async markCancelled(attemptId, tx = null) {
    return this.changeStatus(attemptId, PaymentStatus.CANCELLED, tx);
  }

  async markRejected(attemptId, tx = null) {
    return this.changeStatus(attemptId, PaymentStatus.REJECTED, tx);
  }

  async changeStatus(attemptId, nextStatus, tx = null) {
    validateStatus(nextStatus);

    const repository = tx ? new this.repository.constructor(tx) : this.repository;
    const attempt = await repository.findById(attemptId);
    if (!attempt) {
      throw new NotFoundError(`Payment attempt with id ${attemptId} not found`);
    }

    validateStatusTransition(attempt.status, nextStatus);

    if (attempt.status === nextStatus) {
      return attempt;
    }

    return repository.updateStatus(attemptId, nextStatus);
  }
}

export const paymentAttemptService = new PaymentAttemptService();
