import { db } from '../../../config/db.js';
import { PaymentStatus } from '../../../shared/constants/index.js';

export class PaymentAttemptRepository {
  constructor(tx = db) {
    this.tx = tx;
  }

  async create(data) {
    return this.tx.paymentAttempt.create({ data });
  }

  async findById(id) {
    return this.tx.paymentAttempt.findUnique({ where: { id } });
  }

  async findByIdempotencyKey(idempotencyKey) {
    return this.tx.paymentAttempt.findUnique({ where: { idempotencyKey } });
  }

  async findByWithdrawalId(withdrawalId) {
    return this.tx.paymentAttempt.findMany({ where: { withdrawalId } });
  }

  async findLatestAttempt(withdrawalId) {
    return this.tx.paymentAttempt.findFirst({
      where: { withdrawalId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id, status) {
    return this.tx.paymentAttempt.update({ where: { id }, data: { status } });
  }

  async update(id, data) {
    return this.tx.paymentAttempt.update({ where: { id }, data });
  }

  async existsByIdempotencyKey(idempotencyKey) {
    const attempt = await this.findByIdempotencyKey(idempotencyKey);
    return Boolean(attempt);
  }
}

export const paymentAttemptRepository = new PaymentAttemptRepository();
