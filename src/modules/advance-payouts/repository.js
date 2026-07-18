import { db } from '../../config/db.js';

export async function createAdvancePayout(data, tx = db) {
  return tx.advancePayout.create({ data });
}

export async function getAdvancePayoutById(advancePayoutId, tx = db) {
  return tx.advancePayout.findUnique({ where: { id: advancePayoutId } });
}

export async function findAdvancePayoutsBySaleId(saleId, tx = db) {
  return tx.advancePayout.findMany({ where: { saleId } });
}

export async function updateAdvancePayout(advancePayoutId, data, tx = db) {
  return tx.advancePayout.update({ where: { id: advancePayoutId }, data });
}

export async function findSuccessfulAdvanceForSale(saleId, tx = db) {
  return tx.advancePayout.findFirst({
    where: { saleId, status: 'SUCCESS' },
  });
}
