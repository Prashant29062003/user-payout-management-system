import * as ledgerRepository from './repository.js';
import { NotFoundError } from '../../shared/errors/index.js';

export async function createLedgerEntry(entry) {
  return ledgerRepository.createLedgerEntry(entry);
}

export async function getLedgerEntriesForAccount(accountId) {
  return ledgerRepository.listLedgerEntries(accountId);
}

export async function getLedgerBalance(accountId, entryType) {
  return ledgerRepository.sumLedgerEntries(accountId, entryType);
}

