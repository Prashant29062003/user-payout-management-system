import { withTransaction } from '../../../shared/utils/index.js';
import { LedgerRepository } from '../repository/ledger.repository.js';
import { projectionService } from './projection.service.js';
import { LedgerEntryType } from '../../../shared/constants/index.js';

export class LedgerService {
  constructor(repositoryClass = LedgerRepository, projection = projectionService, transactionRunner = withTransaction) {
    this.repositoryClass = repositoryClass;
    this.projection = projection;
    this.transactionRunner = transactionRunner;
  }

  async recordEntry(entry) {
    return this.transactionRunner(async (tx) => {
      const repository = new this.repositoryClass(tx);
      const projectionService = this.projection;

      const ledgerEntry = await repository.appendEntry(entry);
      await projectionService.applyProjection(entry.accountId, Number(entry.amount), entry.currency, tx);
      return ledgerEntry;
    });
  }

  async recordAdvance(entry) {
    return this.recordEntry({
      ...entry,
      entryType: LedgerEntryType.ADVANCE,
      referenceType: entry.referenceType ?? 'SALE',
    });
  }

  async recordSettlement(entry) {
    return this.recordEntry({
      ...entry,
      entryType: LedgerEntryType.SETTLEMENT,
      referenceType: entry.referenceType ?? 'SALE',
    });
  }

  async recordRejectionAdjustment(entry) {
    return this.recordEntry({
      ...entry,
      entryType: LedgerEntryType.REJECTION_ADJUSTMENT,
      referenceType: entry.referenceType ?? 'SALE',
    });
  }

  async recordWithdrawal(entry) {
    return this.recordEntry({
      ...entry,
      entryType: LedgerEntryType.WITHDRAWAL,
      referenceType: entry.referenceType ?? 'WITHDRAWAL',
    });
  }

  async recordRecovery(entry) {
    return this.recordEntry({
      ...entry,
      entryType: LedgerEntryType.WITHDRAWAL_RECOVERY,
      referenceType: entry.referenceType ?? 'WITHDRAWAL',
    });
  }
}

export const ledgerService = new LedgerService();
