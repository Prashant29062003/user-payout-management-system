import * as paymentAttemptRepository from './repository.js';
import { NotFoundError } from '../../shared/errors/index.js';

export async function createPaymentAttempt(attributes) {
  return paymentAttemptRepository.createPaymentAttempt(attributes);
}

export async function getPaymentAttemptById(paymentAttemptId) {
  const attempt = await paymentAttemptRepository.getPaymentAttemptById(paymentAttemptId);
  if (!attempt) {
    throw new NotFoundError(`Payment attempt with id ${paymentAttemptId} not found`);
  }
  return attempt;
}

export async function getPaymentAttemptByIdempotencyKey(idempotencyKey) {
  return paymentAttemptRepository.getPaymentAttemptByIdempotencyKey(idempotencyKey);
}

export async function updatePaymentAttempt(paymentAttemptId, data) {
  const attempt = await paymentAttemptRepository.getPaymentAttemptById(paymentAttemptId);
  if (!attempt) {
    throw new NotFoundError(`Payment attempt with id ${paymentAttemptId} not found`);
  }
  return paymentAttemptRepository.updatePaymentAttempt(paymentAttemptId, data);
}
