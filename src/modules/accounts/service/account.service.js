import { accountRepository } from '../repository/account.repository.js';
import { NotFoundError } from '../../../shared/errors/index.js';

export class AccountService {
  constructor(repository = accountRepository) {
    this.repository = repository;
  }

  async createAccount(attributes) {
    return this.repository.create(attributes);
  }

  async getAccountById(accountId) {
    const account = await this.repository.findById(accountId);
    if (!account) {
      throw new NotFoundError(`Account with id ${accountId} not found`);
    }
    return account;
  }

  async getAccountByUserId(userId) {
    const account = await this.repository.findByUserId(userId);
    if (!account) {
      throw new NotFoundError(`Account for user ${userId} not found`);
    }
    return account;
  }

  async updateAccount(accountId, data) {
    const account = await this.repository.findById(accountId);
    if (!account) {
      throw new NotFoundError(`Account with id ${accountId} not found`);
    }
    return this.repository.update(accountId, data);
  }

  async updateAccountBalance(accountId, delta) {
    const account = await this.repository.findById(accountId);
    if (!account) {
      throw new NotFoundError(`Account with id ${accountId} not found`);
    }
    return this.repository.updateBalance(accountId, delta);
  }
}

export const accountService = new AccountService();
