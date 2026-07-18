import * as withdrawalRepository from './repository.js';
import { NotFoundError } from '../../shared/errors/index.js';

export async function createWithdrawal(attributes) {
  return withdrawalRepository.createWithdrawal(attributes);
}

export async function getWithdrawalById(withdrawalId) {
  const withdrawal = await withdrawalRepository.getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    throw new NotFoundError(`Withdrawal with id ${withdrawalId} not found`);
  }
  return withdrawal;
}

export async function updateWithdrawal(withdrawalId, data) {
  const withdrawal = await withdrawalRepository.getWithdrawalById(withdrawalId);
  if (!withdrawal) {
    throw new NotFoundError(`Withdrawal with id ${withdrawalId} not found`);
  }
  return withdrawalRepository.updateWithdrawal(withdrawalId, data);
}

export async function findWithdrawalsByUserId(userId) {
  return withdrawalRepository.findWithdrawalsByUserId(userId);
}

export async function listWithdrawalsForAccount(accountId) {
  return withdrawalRepository.listWithdrawalsForAccount(accountId);
}
