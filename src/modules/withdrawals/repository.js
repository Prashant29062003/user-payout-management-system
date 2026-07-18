import { db } from '../../config/db.js';

export async function createWithdrawal(data, tx = db) {
  return tx.withdrawal.create({ data });
}

export async function getWithdrawalById(withdrawalId, tx = db) {
  return tx.withdrawal.findUnique({ where: { id: withdrawalId } });
}

export async function findWithdrawalsByUserId(userId, tx = db) {
  return tx.withdrawal.findMany({ where: { userId } });
}

export async function listWithdrawalsForAccount(accountId, tx = db) {
  return tx.withdrawal.findMany({ where: { accountId } });
}

export async function updateWithdrawal(withdrawalId, data, tx = db) {
  return tx.withdrawal.update({ where: { id: withdrawalId }, data });
}
