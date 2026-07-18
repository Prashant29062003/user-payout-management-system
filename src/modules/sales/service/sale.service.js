import { saleRepository } from '../repository/sale.repository.js';
import { NotFoundError, BusinessRuleViolationError } from '../../../shared/errors/index.js';
import { SaleStatus } from '../../../shared/constants/index.js';

function validateStatus(status) {
  const validStatuses = Object.values(SaleStatus);
  if (!validStatuses.includes(status)) {
    throw new BusinessRuleViolationError(`Invalid sale status: ${status}`);
  }
}

function validateStatusTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  if (currentStatus === SaleStatus.PENDING) {
    if ([SaleStatus.APPROVED, SaleStatus.REJECTED].includes(nextStatus)) {
      return;
    }
  }

  throw new BusinessRuleViolationError(`Cannot transition sale from ${currentStatus} to ${nextStatus}`);
}

export class SaleService {
  constructor(repository = saleRepository) {
    this.repository = repository;
  }

  async createSale(attributes) {
    const status = attributes.status ?? SaleStatus.PENDING;
    validateStatus(status);

    return this.repository.create({ ...attributes, status });
  }

  async getSaleById(saleId, tx = null) {
    const sale = tx
      ? await this.repository.findById(saleId, tx)
      : await this.repository.findById(saleId);
    if (!sale) {
      throw new NotFoundError(`Sale with id ${saleId} not found`);
    }
    return sale;
  }

  async listPendingSales() {
    return this.repository.findPending();
  }

  async findSalesByUserId(userId) {
    return this.repository.findByUserId(userId);
  }

  async markApproved(saleId) {
    return this.changeStatus(saleId, SaleStatus.APPROVED);
  }

  async markRejected(saleId) {
    return this.changeStatus(saleId, SaleStatus.REJECTED);
  }

  async changeStatus(saleId, nextStatus) {
    validateStatus(nextStatus);

    const sale = await this.repository.findById(saleId);
    if (!sale) {
      throw new NotFoundError(`Sale with id ${saleId} not found`);
    }

    validateStatusTransition(sale.status, nextStatus);

    if (sale.status === nextStatus) {
      return sale;
    }

    return this.repository.updateStatus(saleId, nextStatus);
  }
}

export const saleService = new SaleService();
