import { withTransaction } from '../../../shared/utils/index.js';
import { LedgerRepository } from '../repository/ledger.repository.js';
import { projectionService } from './projection.service.js';
import { LedgerEntryType } from '../../../shared/constants/index.js';

export class LedgerService {
  constructor(
    repositoryClass = LedgerRepository,
    projection = projectionService,
    transactionRunner = withTransaction
  ) {
    this.repositoryClass = repositoryClass;
    this.projection = projection;
    this.transactionRunner = transactionRunner;
  }

  async recordEntry(entry, tx = null) {
    if (tx) {
      const repository = new this.repositoryClass(tx);
      const projectionService = this.projection;

      const ledgerEntry = await repository.appendEntry(entry);
      await projectionService.applyProjection(
        entry.accountId,
        Number(entry.amount),
        entry.currency,
        tx
      );
      return ledgerEntry;
    }

    return this.transactionRunner(async (transaction) => {
      const repository = new this.repositoryClass(transaction);
      const projectionService = this.projection;

      const ledgerEntry = await repository.appendEntry(entry);
      await projectionService.applyProjection(
        entry.accountId,
        Number(entry.amount),
        entry.currency,
        transaction
      );
      return ledgerEntry;
    });
  }

  async recordAdvance(entry, tx = null) {
    return this.recordEntry(
      {
        ...entry,
        entryType: LedgerEntryType.ADVANCE,
        referenceType: entry.referenceType ?? 'SALE',
      },
      tx
    );
  }

  async recordSettlement(entry, tx = null) {
    return this.recordEntry(
      {
        ...entry,
        entryType: LedgerEntryType.SETTLEMENT,
        referenceType: entry.referenceType ?? 'SALE',
      },
      tx
    );
  }

  async recordRejectionAdjustment(entry, tx = null) {
    return this.recordEntry(
      {
        ...entry,
        entryType: LedgerEntryType.REJECTION_ADJUSTMENT,
        referenceType: entry.referenceType ?? 'SALE',
      },
      tx
    );
  }

  async recordWithdrawal(entry, tx = null) {
    return this.recordEntry(
      {
        ...entry,
        entryType: LedgerEntryType.WITHDRAWAL,
        referenceType: entry.referenceType ?? 'WITHDRAWAL',
      },
      tx
    );
  }

  async recordRecovery(entry, tx = null) {
    return this.recordEntry(
      {
        ...entry,
        entryType: LedgerEntryType.WITHDRAWAL_RECOVERY,
        referenceType: entry.referenceType ?? 'WITHDRAWAL',
      },
      tx
    );
  }

  async findEntriesByReference(referenceType, referenceId, tx = null) {
    const repository = tx ? new this.repositoryClass(tx) : new this.repositoryClass();
    return repository.findByReference(referenceType, referenceId);
  }

  async hasRecoveryForReference(referenceType, referenceId, tx = null) {
    const entries = await this.findEntriesByReference(referenceType, referenceId, tx);
    return entries.some((entry) => entry.entryType === LedgerEntryType.WITHDRAWAL_RECOVERY);
  }
}

export const ledgerService = new LedgerService();
