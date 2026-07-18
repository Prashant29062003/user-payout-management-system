import { advancePayoutRepository } from '../repository/advance-payout.repository.js';
import { NotFoundError, BusinessRuleViolationError } from '../../../shared/errors/index.js';
import { AdvancePayoutStatus } from '../../../shared/constants/index.js';

function validateStatus(status) {
  const validStatuses = Object.values(AdvancePayoutStatus);
  if (!validStatuses.includes(status)) {
    throw new BusinessRuleViolationError(`Invalid advance payout status: ${status}`);
  }
}

function validateStatusTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  const validTransitions = {
    [AdvancePayoutStatus.PENDING]: [AdvancePayoutStatus.PROCESSING, AdvancePayoutStatus.SUCCESS, AdvancePayoutStatus.FAILED],
    [AdvancePayoutStatus.PROCESSING]: [AdvancePayoutStatus.SUCCESS, AdvancePayoutStatus.FAILED],
    [AdvancePayoutStatus.FAILED]: [AdvancePayoutStatus.PROCESSING],
    [AdvancePayoutStatus.SUCCESS]: [],
  };

  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessRuleViolationError(`Cannot transition advance payout from ${currentStatus} to ${nextStatus}`);
  }
}

export class AdvancePayoutService {
  constructor(repository = advancePayoutRepository) {
    this.repository = repository;
  }

  async createAdvancePayout(attributes) {
    const status = attributes.status ?? AdvancePayoutStatus.PENDING;
    validateStatus(status);

    const existingSuccess = await this.repository.findSuccessfulBySaleId(attributes.saleId);
    if (existingSuccess) {
      throw new BusinessRuleViolationError(`A successful advance payout already exists for sale ${attributes.saleId}`);
    }

    return this.repository.create({ ...attributes, status });
  }

  async getAdvancePayoutById(advancePayoutId) {
    const payout = await this.repository.findById(advancePayoutId);
    if (!payout) {
      throw new NotFoundError(`Advance payout with id ${advancePayoutId} not found`);
    }
    return payout;
  }

  async findAdvancePayoutsBySaleId(saleId) {
    return this.repository.findBySaleId(saleId);
  }

  async findSuccessfulAdvanceForSale(saleId) {
    return this.repository.findSuccessfulBySaleId(saleId);
  }

  async isEligibleForSale(saleId) {
    const existingSuccess = await this.repository.findSuccessfulBySaleId(saleId);
    return !existingSuccess;
  }

  async markProcessing(advancePayoutId) {
    return this.changeStatus(advancePayoutId, AdvancePayoutStatus.PROCESSING);
  }

  async markSucceeded(advancePayoutId) {
    return this.changeStatus(advancePayoutId, AdvancePayoutStatus.SUCCESS);
  }

  async markFailed(advancePayoutId) {
    return this.changeStatus(advancePayoutId, AdvancePayoutStatus.FAILED);
  }

  async changeStatus(advancePayoutId, nextStatus) {
    validateStatus(nextStatus);

    const payout = await this.repository.findById(advancePayoutId);
    if (!payout) {
      throw new NotFoundError(`Advance payout with id ${advancePayoutId} not found`);
    }

    validateStatusTransition(payout.status, nextStatus);

    if (payout.status === nextStatus) {
      return payout;
    }

    return this.repository.updateStatus(advancePayoutId, nextStatus);
  }
}

export const advancePayoutService = new AdvancePayoutService();
