import { withTransaction } from '../../shared/utils/index.js';
import { paymentAttemptService } from '../payment-attempts/service/payment-attempt.service.js';
import { withdrawalService } from '../withdrawals/service/withdrawal.service.js';
import { ledgerService } from '../ledger/service/ledger.service.js';
import { PaymentStatus, WithdrawalStatus } from '../../shared/constants/index.js';
import { BusinessRuleViolationError } from '../../shared/errors/index.js';

export class RecoveryWorkflow {
  constructor({
    paymentAttemptServiceInstance = paymentAttemptService,
    withdrawalServiceInstance = withdrawalService,
    ledgerServiceInstance = ledgerService,
    transactionRunner = withTransaction,
  } = {}) {
    this.paymentAttemptService = paymentAttemptServiceInstance;
    this.withdrawalService = withdrawalServiceInstance;
    this.ledgerService = ledgerServiceInstance;
    this.transactionRunner = transactionRunner;
  }

  async execute({ paymentAttemptId, failureStatus = PaymentStatus.FAILED }) {
    return this.transactionRunner(async (tx) => {
      let attempt = await this.paymentAttemptService.getAttemptById(paymentAttemptId, tx);
      if (!attempt.withdrawalId) {
        throw new BusinessRuleViolationError('Payment attempt is not associated with a withdrawal');
      }

      if (attempt.status === PaymentStatus.SUCCESS) {
        throw new BusinessRuleViolationError('Cannot recover a successful payment attempt');
      }

      if (
        ![PaymentStatus.FAILED, PaymentStatus.CANCELLED, PaymentStatus.REJECTED].includes(
          attempt.status
        )
      ) {
        if (failureStatus === PaymentStatus.FAILED) {
          attempt = await this.paymentAttemptService.markFailed(paymentAttemptId, tx);
        } else if (failureStatus === PaymentStatus.CANCELLED) {
          attempt = await this.paymentAttemptService.markCancelled(paymentAttemptId, tx);
        } else if (failureStatus === PaymentStatus.REJECTED) {
          attempt = await this.paymentAttemptService.markRejected(paymentAttemptId, tx);
        } else {
          throw new BusinessRuleViolationError(
            `Unsupported failure status for recovery: ${failureStatus}`
          );
        }
      }

      let withdrawal = await this.withdrawalService.getWithdrawalById(attempt.withdrawalId, tx);
      if (withdrawal.status === WithdrawalStatus.SUCCESS) {
        throw new BusinessRuleViolationError('Cannot recover a successful withdrawal');
      }

      if (withdrawal.status !== WithdrawalStatus.FAILED) {
        withdrawal = await this.withdrawalService.markFailed(withdrawal.id, tx);
      }

      const alreadyRecovered = await this.ledgerService.hasRecoveryForReference(
        'WITHDRAWAL',
        withdrawal.id,
        tx
      );
      if (alreadyRecovered) {
        return { alreadyRecovered: true, withdrawal, paymentAttempt: attempt };
      }

      const ledgerEntry = await this.ledgerService.recordRecovery(
        {
          accountId: withdrawal.accountId,
          amount: Number(withdrawal.amount),
          currency: withdrawal.currency,
          referenceId: withdrawal.id,
        },
        tx
      );

      return {
        alreadyRecovered: false,
        withdrawal,
        paymentAttempt: attempt,
        ledgerEntry,
      };
    });
  }
}

export const recoveryWorkflow = new RecoveryWorkflow();
