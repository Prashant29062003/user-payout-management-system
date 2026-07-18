import { db } from '../../config/db.js';

export async function getAccountById(accountId, tx = db) {
  return tx.account.findUnique({
    where: { id: accountId },
  });
}

export async function getAccountByUserId(userId, tx = db) {
  return tx.account.findUnique({
    where: { userId },
  });
}

export async function updateAccountBalance(accountId, delta, tx = db) {
  return tx.account.update({
    where: { id: accountId },
    data: {
      withdrawableBalance: { increment: delta },
      updatedAt: new Date(),
    },
  });
}
