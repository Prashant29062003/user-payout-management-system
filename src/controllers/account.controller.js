import { ApiResponse } from '../shared/utils/api-response.js';
import { accountService } from '../modules/accounts/index.js';
import { ledgerRepository } from '../modules/ledger/repository/ledger.repository.js';
import { parseSchema, accountIdParamsSchema } from '../shared/validators.js';

export async function getAccount(req, res, next) {
  try {
    const { accountId } = parseSchema(accountIdParamsSchema, req.params);
    const account = await accountService.getAccountById(accountId);
    res.status(200).json(ApiResponse.success(account, 'Account fetched'));
  } catch (error) {
    next(error);
  }
}

export async function getAccountLedger(req, res, next) {
  try {
    const { accountId } = parseSchema(accountIdParamsSchema, req.params);
    await accountService.getAccountById(accountId);
    const entries = await ledgerRepository.listHistory(accountId, { orderBy: { createdAt: 'asc' } });
    res.status(200).json(ApiResponse.success(entries, 'Account ledger fetched'));
  } catch (error) {
    next(error);
  }
}
