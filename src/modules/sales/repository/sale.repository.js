import { db } from '../../../config/db.js';

export class SaleRepository {
  constructor(tx = db) {
    this.tx = tx;
  }

  async create(data) {
    return this.tx.sale.create({ data });
  }

  async findById(id) {
    return this.tx.sale.findUnique({ where: { id } });
  }

  async findByUserId(userId) {
    return this.tx.sale.findMany({ where: { userId } });
  }

  async findPending() {
    return this.tx.sale.findMany({ where: { status: 'PENDING' } });
  }

  async updateStatus(id, status) {
    return this.tx.sale.update({ where: { id }, data: { status } });
  }

  async exists(id) {
    const sale = await this.findById(id);
    return Boolean(sale);
  }
}

export const saleRepository = new SaleRepository();
