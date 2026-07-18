import { db } from '../../../config/db.js';
import { WithdrawalStatus } from '../../../shared/constants/index.js';

export class WithdrawalRepository {
  constructor(tx = db) {
    this.tx = tx;
  }

  async create(data) {
    return this.tx.withdrawal.create({ data });
  }

  async findById(id) {
    return this.tx.withdrawal.findUnique({ where: { id } });
  }

  async findByAccountId(accountId) {
    return this.tx.withdrawal.findMany({ where: { accountId } });
  }

  async findByUserId(userId) {
    return this.tx.withdrawal.findMany({ where: { userId } });
  }

  async findPendingByAccountId(accountId) {
    return this.tx.withdrawal.findMany({
      where: {
        accountId,
        status: {
          in: [WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING],
        },
      },
    });
  }

  async findRecentByAccountId(accountId, since) {
    return this.tx.withdrawal.findMany({
      where: {
        accountId,
        createdAt: {
          gte: since,
        },
      },
    });
  }

  async findLatestByAccountId(accountId) {
    return this.tx.withdrawal.findFirst({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id, status) {
    return this.tx.withdrawal.update({ where: { id }, data: { status } });
  }

  async existsForAccountId(accountId) {
    const count = await this.tx.withdrawal.count({ where: { accountId } });
    return count > 0;
  }
}

export const withdrawalRepository = new WithdrawalRepository();
