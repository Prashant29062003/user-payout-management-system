import * as advancePayoutRepository from './repository.js';
import { NotFoundError } from '../../shared/errors/index.js';

export async function createAdvancePayout(attributes) {
  return advancePayoutRepository.createAdvancePayout(attributes);
}

export async function getAdvancePayoutById(advancePayoutId) {
  const payout = await advancePayoutRepository.getAdvancePayoutById(advancePayoutId);
  if (!payout) {
    throw new NotFoundError(`Advance payout with id ${advancePayoutId} not found`);
  }
  return payout;
}

export async function updateAdvancePayout(advancePayoutId, data) {
  const payout = await advancePayoutRepository.getAdvancePayoutById(advancePayoutId);
  if (!payout) {
    throw new NotFoundError(`Advance payout with id ${advancePayoutId} not found`);
  }
  return advancePayoutRepository.updateAdvancePayout(advancePayoutId, data);
}

export async function findAdvancePayoutsBySaleId(saleId) {
  return advancePayoutRepository.findAdvancePayoutsBySaleId(saleId);
}

export async function findSuccessfulAdvanceForSale(saleId) {
  return advancePayoutRepository.findSuccessfulAdvanceForSale(saleId);
}
