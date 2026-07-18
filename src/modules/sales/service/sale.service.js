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
    const repository = tx ? new this.repository.constructor(tx) : this.repository;
    const sale = await repository.findById(saleId);
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

  async markApproved(saleId, tx = null) {
    return this.changeStatus(saleId, SaleStatus.APPROVED, tx);
  }

  async markRejected(saleId, tx = null) {
    return this.changeStatus(saleId, SaleStatus.REJECTED, tx);
  }

  async changeStatus(saleId, nextStatus, tx = null) {
    validateStatus(nextStatus);

    const repository = tx ? new this.repository.constructor(tx) : this.repository;

    const sale = await repository.findById(saleId);
    if (!sale) {
      throw new NotFoundError(`Sale with id ${saleId} not found`);
    }

    validateStatusTransition(sale.status, nextStatus);

    if (sale.status === nextStatus) {
      return sale;
    }

    return repository.updateStatus(saleId, nextStatus);
  }
}

export const saleService = new SaleService();
