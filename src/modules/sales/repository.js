import { db } from '../../config/db.js';

export async function createSale(data, tx = db) {
  return tx.sale.create({ data });
}

export async function getSaleById(saleId, tx = db) {
  return tx.sale.findUnique({ where: { id: saleId } });
}

export async function findSalesByUserId(userId, tx = db) {
  return tx.sale.findMany({ where: { userId } });
}

export async function updateSale(saleId, data, tx = db) {
  return tx.sale.update({ where: { id: saleId }, data });
}

export async function listPendingSales(tx = db) {
  return tx.sale.findMany({ where: { status: 'PENDING' } });
}
