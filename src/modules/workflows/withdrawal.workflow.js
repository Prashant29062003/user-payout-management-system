import { withTransaction } from '../../shared/utils/index.js';
import { withdrawalService } from '../withdrawals/service/withdrawal.service.js';
import { paymentAttemptService } from '../payment-attempts/service/payment-attempt.service.js';

export class WithdrawalWorkflow {
  constructor(
    {
      withdrawalServiceInstance = withdrawalService,
      paymentAttemptServiceInstance = paymentAttemptService,
      transactionRunner = withTransaction,
    } = {}
  ) {
    this.withdrawalService = withdrawalServiceInstance;
    this.paymentAttemptService = paymentAttemptServiceInstance;
    this.transactionRunner = transactionRunner;
  }

  async execute({ accountId, userId, amount, currency, idempotencyKey = null }) {
    return this.transactionRunner(async (tx) => {
      if (idempotencyKey) {
        const existingAttempt = await this.paymentAttemptService.getAttemptByIdempotencyKey(idempotencyKey, tx);
        if (existingAttempt) {
          const withdrawal = await this.withdrawalService.getWithdrawalById(existingAttempt.withdrawalId, tx);
          return { withdrawal, paymentAttempt: existingAttempt };
        }
      }

      const withdrawal = await this.withdrawalService.createWithdrawal(
        {
          accountId,
          userId,
          amount,
          currency,
          status: 'PENDING',
        },
        tx,
      );

      const paymentAttempt = await this.paymentAttemptService.startAttempt(
        {
          withdrawalId: withdrawal.id,
          amount,
          currency,
          idempotencyKey,
        },
        tx,
      );

      return { withdrawal, paymentAttempt };
    });
  }
}

export const withdrawalWorkflow = new WithdrawalWorkflow();
