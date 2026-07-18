import { withTransaction } from '../../../shared/utils/index.js';
import { WithdrawalStatus } from '../../../shared/constants/index.js';
import { NotFoundError, BusinessRuleViolationError } from '../../../shared/errors/index.js';
import { WithdrawalRepository, withdrawalRepository } from '../repository/withdrawal.repository.js';
import { AccountRepository } from '../../accounts/repository/account.repository.js';

function validateStatus(status) {
  const validStatuses = Object.values(WithdrawalStatus);
  if (!validStatuses.includes(status)) {
    throw new BusinessRuleViolationError(`Invalid withdrawal status: ${status}`);
  }
}

function validateStatusTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) {
    return;
  }

  const transitions = {
    [WithdrawalStatus.PENDING]: [WithdrawalStatus.PROCESSING, WithdrawalStatus.CANCELLED, WithdrawalStatus.FAILED],
    [WithdrawalStatus.PROCESSING]: [WithdrawalStatus.SUCCESS, WithdrawalStatus.FAILED],
    [WithdrawalStatus.FAILED]: [WithdrawalStatus.PROCESSING],
    [WithdrawalStatus.SUCCESS]: [],
    [WithdrawalStatus.CANCELLED]: [],
    [WithdrawalStatus.REJECTED]: [],
  };

  const allowed = transitions[currentStatus] || [];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessRuleViolationError(`Cannot transition withdrawal from ${currentStatus} to ${nextStatus}`);
  }
}

function validateAmount(amount) {
  if (typeof amount !== 'number' || amount <= 0) {
    throw new BusinessRuleViolationError('Withdrawal amount must be a positive number');
  }
}

export class WithdrawalService {
  constructor(
    repository = withdrawalRepository,
    accountRepositoryClass = AccountRepository,
    transactionRunner = withTransaction,
  ) {
    this.repository = repository;
    this.accountRepositoryClass = accountRepositoryClass;
    this.transactionRunner = transactionRunner;
  }

  async createWithdrawal(attributes) {
    const status = attributes.status ?? WithdrawalStatus.PENDING;
    validateStatus(status);
    validateAmount(attributes.amount);

    return this.transactionRunner(async (tx) => {
      const accountRepository = new this.accountRepositoryClass(tx);
      const withdrawalRepository = new WithdrawalRepository(tx);

      const account = await accountRepository.findById(attributes.accountId);
      if (!account) {
        throw new NotFoundError(`Account with id ${attributes.accountId} not found`);
      }

      if (account.withdrawableBalance < attributes.amount) {
        throw new BusinessRuleViolationError('Insufficient withdrawable balance for this account');
      }

      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentWithdrawals = await withdrawalRepository.findRecentByAccountId(attributes.accountId, since);
      if (recentWithdrawals.length > 0) {
        throw new BusinessRuleViolationError('A withdrawal was already created for this account in the last 24 hours');
      }

      return withdrawalRepository.create({
        ...attributes,
        status,
      });
    });
  }

  async getWithdrawalById(withdrawalId) {
    const withdrawal = await this.repository.findById(withdrawalId);
    if (!withdrawal) {
      throw new NotFoundError(`Withdrawal with id ${withdrawalId} not found`);
    }
    return withdrawal;
  }

  async findWithdrawalsByUserId(userId) {
    return this.repository.findByUserId(userId);
  }

  async findWithdrawalsForAccount(accountId) {
    return this.repository.findByAccountId(accountId);
  }

  async canWithdraw(accountId, amount) {
    validateAmount(amount);

    const account = await new this.accountRepositoryClass().findById(accountId);
    if (!account) {
      throw new NotFoundError(`Account with id ${accountId} not found`);
    }

    if (account.withdrawableBalance < amount) {
      return false;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentWithdrawals = await this.repository.findRecentByAccountId(accountId, since);
    return recentWithdrawals.length === 0;
  }

  async markProcessing(withdrawalId) {
    return this.changeStatus(withdrawalId, WithdrawalStatus.PROCESSING);
  }

  async markSucceeded(withdrawalId) {
    return this.changeStatus(withdrawalId, WithdrawalStatus.SUCCESS);
  }

  async markFailed(withdrawalId) {
    return this.changeStatus(withdrawalId, WithdrawalStatus.FAILED);
  }

  async recoverFailedWithdrawal(withdrawalId) {
    const withdrawal = await this.repository.findById(withdrawalId);
    if (!withdrawal) {
      throw new NotFoundError(`Withdrawal with id ${withdrawalId} not found`);
    }
    if (withdrawal.status !== WithdrawalStatus.FAILED) {
      throw new BusinessRuleViolationError('Only failed withdrawals can be recovered');
    }

    return this.changeStatus(withdrawalId, WithdrawalStatus.PROCESSING);
  }

  async changeStatus(withdrawalId, nextStatus) {
    validateStatus(nextStatus);

    const withdrawal = await this.repository.findById(withdrawalId);
    if (!withdrawal) {
      throw new NotFoundError(`Withdrawal with id ${withdrawalId} not found`);
    }

    validateStatusTransition(withdrawal.status, nextStatus);
    if (withdrawal.status === nextStatus) {
      return withdrawal;
    }

    return this.repository.updateStatus(withdrawalId, nextStatus);
  }
}

export const withdrawalService = new WithdrawalService();
