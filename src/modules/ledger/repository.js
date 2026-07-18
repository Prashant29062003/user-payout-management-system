import { db } from '../../config/db.js';

export async function createLedgerEntry(payload, tx = db) {
  return tx.ledgerEntry.create({
    data: payload,
  });
}

export async function listLedgerEntries(accountId, tx = db) {
  return tx.ledgerEntry.findMany({
    where: { accountId },
  });
}

export async function sumLedgerEntries(accountId, entryType, tx = db) {
  const result = await tx.ledgerEntry.aggregate({
    where: { accountId, entryType },
    _sum: { amount: true },
  });

  return Number(result._sum?.amount ?? 0);
}
