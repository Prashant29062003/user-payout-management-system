import { db } from '../../../config/db.js';
import { AdvancePayoutStatus } from '../../../shared/constants/index.js';

export class AdvancePayoutRepository {
  constructor(tx = db) {
    this.tx = tx;
  }

  async create(data) {
    return this.tx.advancePayout.create({ data });
  }

  async findById(id) {
    return this.tx.advancePayout.findUnique({ where: { id } });
  }

  async findBySaleId(saleId) {
    return this.tx.advancePayout.findMany({ where: { saleId } });
  }

  async findSuccessfulBySaleId(saleId) {
    return this.tx.advancePayout.findFirst({ where: { saleId, status: AdvancePayoutStatus.SUCCESS } });
  }

  async existsForSale(saleId) {
    const count = await this.tx.advancePayout.count({ where: { saleId } });
    return count > 0;
  }

  async updateStatus(id, status) {
    return this.tx.advancePayout.update({ where: { id }, data: { status } });
  }
}

export const advancePayoutRepository = new AdvancePayoutRepository();
