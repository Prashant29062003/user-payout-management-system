import { ApiResponse } from '../shared/utils/api-response.js';
import { advancePayoutWorkflow, saleReconciliationWorkflow, withdrawalWorkflow } from '../modules/workflows/index.js';
import {
  parseSchema,
  advancePayoutBodySchema,
  reconcileSaleBodySchema,
  saleIdParamsSchema,
  createWithdrawalBodySchema,
} from '../shared/validators.js';

export async function runAdvancePayout(req, res, next) {
  try {
    const { saleId } = parseSchema(advancePayoutBodySchema, req.body);
    const result = await advancePayoutWorkflow.execute(saleId);
    res.status(201).json(ApiResponse.success(result, 'Advance payout processed'));
  } catch (error) {
    next(error);
  }
}

export async function reconcileSale(req, res, next) {
  try {
    const { saleId } = parseSchema(saleIdParamsSchema, req.params);
    const { action } = parseSchema(reconcileSaleBodySchema, req.body);

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
    const withdrawalData = parseSchema(createWithdrawalBodySchema, req.body);
    const result = await withdrawalWorkflow.execute(withdrawalData);

    res.status(201).json(ApiResponse.success(result, 'Withdrawal request processed'));
  } catch (error) {
    next(error);
  }
}
