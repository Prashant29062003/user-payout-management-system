import { withTransaction } from '../../shared/utils/index.js';
import { withdrawalService } from '../withdrawals/service/withdrawal.service.js';
import { paymentAttemptService } from '../payment-attempts/service/payment-attempt.service.js';
import { paymentProvider } from '../../providers/payment-provider/index.js';

export class WithdrawalWorkflow {
  constructor({
    withdrawalServiceInstance = withdrawalService,
    paymentAttemptServiceInstance = paymentAttemptService,
    paymentProviderInstance = paymentProvider,
    transactionRunner = withTransaction,
  } = {}) {
    this.withdrawalService = withdrawalServiceInstance;
    this.paymentAttemptService = paymentAttemptServiceInstance;
    this.paymentProvider = paymentProviderInstance;
    this.transactionRunner = transactionRunner;
  }

  async execute({ accountId, userId, amount, currency, idempotencyKey = null }) {
    const result = await this.transactionRunner(async (tx) => {
      if (idempotencyKey) {
        const existingAttempt = await this.paymentAttemptService.getAttemptByIdempotencyKey(
          idempotencyKey,
          tx
        );
        if (existingAttempt) {
          const withdrawal = await this.withdrawalService.getWithdrawalById(
            existingAttempt.withdrawalId,
            tx
          );
          return { withdrawal, paymentAttempt: existingAttempt, isIdempotentReplay: true };
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
        tx
      );

      const paymentAttempt = await this.paymentAttemptService.startAttempt(
        {
          withdrawalId: withdrawal.id,
          amount,
          currency,
          idempotencyKey,
        },
        tx
      );

      return { withdrawal, paymentAttempt, isIdempotentReplay: false };
    });

    let providerResult = null;
    if (!result.isIdempotentReplay) {
      providerResult = await this.submitToPaymentProvider(result.paymentAttempt);
      if (providerResult?.providerReference) {
        await this.paymentAttemptService.attachProviderDetails(
          result.paymentAttempt.id,
          providerResult.provider,
          providerResult.providerReference
        );
      }
    }

    const { isIdempotentReplay, ...output } = result;

    return {
      ...output,
      paymentAttempt: isIdempotentReplay
        ? result.paymentAttempt
        : {
            ...result.paymentAttempt,
            provider: providerResult?.provider ?? this.paymentProvider.name,
            providerReference: providerResult?.providerReference ?? null,
          },
    };
  }

  async submitToPaymentProvider(paymentAttempt) {
    try {
      return await this.paymentProvider.submitPaymentAttempt({
        paymentAttemptId: paymentAttempt.id,
        withdrawalId: paymentAttempt.withdrawalId,
        amount: Number(paymentAttempt.amount),
        currency: paymentAttempt.currency,
        idempotencyKey: paymentAttempt.idempotencyKey,
      });
    } catch (error) {
      return {
        provider: this.paymentProvider.name,
        providerReference: null,
        status: 'PROCESSING',
        error: error.message,
      };
    }
  }
}

export const withdrawalWorkflow = new WithdrawalWorkflow();
