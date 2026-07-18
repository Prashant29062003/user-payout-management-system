import { db } from '../../config/db.js';
import { createLedgerEntry } from '../ledger/repository.js';
import { updateAccountBalance } from './repository.js';

export async function applyCredit(
  accountId,
  amount,
  currency,
  referenceType,
  referenceId,
  tx = db,
) {
  const account = await updateAccountBalance(accountId, amount, tx);
  const entry = await createLedgerEntry(
    {
      accountId,
      entryType: 'credit',
      amount,
      currency,
      referenceType,
      referenceId,
    },
    tx,
  );

  return { account, entry };
}

export async function applyDebit(
  accountId,
  amount,
  currency,
  referenceType,
  referenceId,
  tx = db,
) {
  const account = await updateAccountBalance(accountId, -amount, tx);
  const entry = await createLedgerEntry(
    {
      accountId,
      entryType: 'debit',
      amount,
      currency,
      referenceType,
      referenceId,
    },
    tx,
  );

  return { account, entry };
}
