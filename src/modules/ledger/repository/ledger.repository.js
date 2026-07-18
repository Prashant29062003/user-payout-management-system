import { db } from '../../../config/db.js';

export class LedgerRepository {
  constructor(tx = db) {
    this.tx = tx;
  }

  async appendEntry(data) {
    return this.tx.ledgerEntry.create({ data });
  }

  async findById(id) {
    return this.tx.ledgerEntry.findUnique({ where: { id } });
  }

  async findByAccountId(accountId) {
    return this.tx.ledgerEntry.findMany({ where: { accountId }, orderBy: { createdAt: 'asc' } });
  }

  async findByReference(referenceType, referenceId) {
    return this.tx.ledgerEntry.findMany({
      where: { referenceType, referenceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async listHistory(accountId, options = {}) {
    const orderBy = options.orderBy ?? { createdAt: 'asc' };
    return this.tx.ledgerEntry.findMany({ where: { accountId }, orderBy });
  }
}

export const ledgerRepository = new LedgerRepository();
