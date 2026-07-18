import { ApiResponse } from '../shared/utils/api-response.js';
import { ValidationError } from '../shared/errors/index.js';
import { advancePayoutWorkflow, saleReconciliationWorkflow, withdrawalWorkflow } from '../modules/workflows/index.js';
import { requireEnumValue, requireOptionalString, requirePositiveNumber, requireString } from '../shared/validators.js';

const validReconciliationActions = ['approve', 'reject'];

export async function runAdvancePayout(req, res, next) {
  try {
    const saleId = requireString(req.body.saleId, 'saleId');
    const result = await advancePayoutWorkflow.execute(saleId);
    res.status(201).json(ApiResponse.success(result, 'Advance payout processed'));
  } catch (error) {
    next(error);
  }
}

export async function reconcileSale(req, res, next) {
  try {
    const saleId = requireString(req.params.saleId, 'saleId');
    const action = requireEnumValue(req.body.action, validReconciliationActions, 'action');

    const result = action === 'approve'
      ? await saleReconciliationWorkflow.approveSale(saleId)
      : await saleReconciliationWorkflow.rejectSale(saleId);

    res.status(200).json(ApiResponse.success(result, `Sale ${action}d successfully`));
  } catch (error) {
    next(error);
  }
}

export async function createWithdrawal(req, res, next) {
  try {
    const accountId = requireString(req.body.accountId, 'accountId');
    const userId = requireString(req.body.userId, 'userId');
    const amount = requirePositiveNumber(req.body.amount, 'amount');
    const currency = requireString(req.body.currency, 'currency');
    const idempotencyKey = requireOptionalString(req.body.idempotencyKey, 'idempotencyKey');

    const result = await withdrawalWorkflow.execute({
      accountId,
      userId,
      amount,
      currency,
      idempotencyKey,
    });

    res.status(201).json(ApiResponse.success(result, 'Withdrawal request processed'));
  } catch (error) {
    next(error);
  }
}
