import { db } from '../../config/db.js';

export async function createPaymentAttempt(data, tx = db) {
  return tx.paymentAttempt.create({ data });
}

export async function getPaymentAttemptById(paymentAttemptId, tx = db) {
  return tx.paymentAttempt.findUnique({ where: { id: paymentAttemptId } });
}

export async function getPaymentAttemptByIdempotencyKey(idempotencyKey, tx = db) {
  return tx.paymentAttempt.findUnique({ where: { idempotencyKey } });
}

export async function updatePaymentAttempt(paymentAttemptId, data, tx = db) {
  return tx.paymentAttempt.update({ where: { id: paymentAttemptId }, data });
}
