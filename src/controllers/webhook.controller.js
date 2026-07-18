import { ApiResponse } from '../shared/utils/api-response.js';
import { ValidationError } from '../shared/errors/index.js';
import { paymentAttemptService } from '../modules/payment-attempts/index.js';
import { withdrawalService } from '../modules/withdrawals/index.js';
import { ledgerService } from '../modules/ledger/index.js';
import { recoveryWorkflow } from '../modules/workflows/index.js';
import { withTransaction } from '../shared/utils/index.js';
import { PaymentStatus, WithdrawalStatus, LedgerEntryType } from '../shared/constants/index.js';
import { requireEnumValue, requirePositiveNumber, requireString } from '../shared/validators.js';

const validWebhookStatuses = [
  PaymentStatus.SUCCESS,
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
  PaymentStatus.REJECTED,
];

export async function handlePaymentProviderWebhook(req, res, next) {
  try {
    const paymentAttemptId = requireString(req.body.paymentAttemptId, 'paymentAttemptId');
    const status = requireEnumValue(req.body.status, validWebhookStatuses, 'status');
    const failureReason = req.body.failureReason;

    if (status === PaymentStatus.SUCCESS) {
      const result = await withTransaction(async (tx) => {
        const paymentAttempt = await paymentAttemptService.markSucceeded(paymentAttemptId, tx);
        if (!paymentAttempt.withdrawalId) {
          throw new ValidationError('Payment attempt is not associated with a withdrawal');
        }

        const withdrawal = await withdrawalService.getWithdrawalById(paymentAttempt.withdrawalId, tx);
        await withdrawalService.markSucceeded(withdrawal.id, tx);

        const existingLedgerEntries = await ledgerService.findEntriesByReference('WITHDRAWAL', withdrawal.id, tx);
        const existingWithdrawalEntry = existingLedgerEntries.find((entry) => entry.entryType === LedgerEntryType.WITHDRAWAL);

        const ledgerEntry = existingWithdrawalEntry || await ledgerService.recordWithdrawal({
          accountId: withdrawal.accountId,
          amount: Number(withdrawal.amount),
          currency: withdrawal.currency,
          referenceId: withdrawal.id,
        }, tx);

        return {
          paymentAttempt,
          withdrawal,
          ledgerEntry,
          alreadyRecorded: Boolean(existingWithdrawalEntry),
        };
      });

      return res.status(200).json(ApiResponse.success(result, 'Payment succeeded'));
    }

    const recoveryResult = await recoveryWorkflow.execute({
      paymentAttemptId,
      failureStatus: status,
      failureReason,
    });

    res.status(200).json(ApiResponse.success(recoveryResult, 'Recovery processed'));
  } catch (error) {
    next(error);
  }
}
