import { db } from '../../../config/db.js';

export class AccountRepository {
  constructor(tx = db) {
    this.tx = tx;
  }

  async create(data) {
    return this.tx.account.create({ data });
  }

  async findById(id) {
    return this.tx.account.findUnique({ where: { id } });
  }

  async findByUserId(userId) {
    return this.tx.account.findUnique({ where: { userId } });
  }

  async update(id, data) {
    return this.tx.account.update({ where: { id }, data });
  }

  async updateBalance(id, delta) {
    return this.tx.account.update({
      where: { id },
      data: {
        withdrawableBalance: { increment: delta },
      },
    });
  }

  async updateBalances(id, balances) {
    return this.tx.account.update({ where: { id }, data: balances });
  }
}

export const accountRepository = new AccountRepository();
