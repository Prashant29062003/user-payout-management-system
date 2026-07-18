import { AccountRepository } from '../../accounts/repository/account.repository.js';
import { NotFoundError } from '../../../shared/errors/index.js';

function parseDecimalValue(value) {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function calculateProjection(account, amount) {
  const withdrawableBalance = parseDecimalValue(account.withdrawableBalance);
  const recoveryBalance = parseDecimalValue(account.recoveryBalance);
  const credit = amount >= 0;

  if (credit) {
    const recoveryReduction = Math.min(recoveryBalance, amount);
    const amountToWithdrawable = amount - recoveryReduction;

    return {
      withdrawableBalance: withdrawableBalance + amountToWithdrawable,
      recoveryBalance: recoveryBalance - recoveryReduction,
    };
  }

  const debit = Math.abs(amount);
  const withdrawableReduction = Math.min(withdrawableBalance, debit);
  const debt = debit - withdrawableReduction;

  return {
    withdrawableBalance: withdrawableBalance - withdrawableReduction,
    recoveryBalance: recoveryBalance + debt,
  };
}

export class ProjectionService {
  constructor(accountRepositoryClass = AccountRepository) {
    this.accountRepositoryClass = accountRepositoryClass;
  }

  async applyProjection(accountId, amount, currency, tx = null) {
    const repository = new this.accountRepositoryClass(tx);
    const account = await repository.findById(accountId);
    if (!account) {
      throw new NotFoundError(`Account with id ${accountId} not found`);
    }

    const balances = calculateProjection(account, amount);

    return repository.updateBalances(accountId, balances);
  }

  calculateProjection(account, amount) {
    return calculateProjection(account, amount);
  }
}

export const projectionService = new ProjectionService();
