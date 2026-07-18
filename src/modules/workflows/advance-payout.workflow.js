import { withTransaction } from '../../shared/utils/index.js';
import { saleService } from '../sales/service/sale.service.js';
import { accountService } from '../accounts/service/account.service.js';
import { advancePayoutService } from '../advance-payouts/service/advance-payout.service.js';
import { ledgerService } from '../ledger/service/ledger.service.js';
import { SaleStatus, AdvancePayoutStatus } from '../../shared/constants/index.js';
import { BusinessRuleViolationError } from '../../shared/errors/index.js';

export class AdvancePayoutWorkflow {
  constructor(
    {
      saleServiceInstance = saleService,
      accountServiceInstance = accountService,
      advancePayoutServiceInstance = advancePayoutService,
      ledgerServiceInstance = ledgerService,
      transactionRunner = withTransaction,
    } = {}
  ) {
    this.saleService = saleServiceInstance;
    this.accountService = accountServiceInstance;
    this.advancePayoutService = advancePayoutServiceInstance;
    this.ledgerService = ledgerServiceInstance;
    this.transactionRunner = transactionRunner;
  }

  async execute(saleId) {
    return this.transactionRunner(async (tx) => {
      const sale = await this.saleService.getSaleById(saleId, tx);
      if (sale.status !== SaleStatus.PENDING) {
        throw new BusinessRuleViolationError(`Sale ${saleId} is not pending`);
      }

      const eligible = await this.advancePayoutService.isEligibleForSale(saleId, tx);
      if (!eligible) {
        throw new BusinessRuleViolationError(`A successful advance payout already exists for sale ${saleId}`);
      }

      const account = await this.accountService.getAccountByUserId(sale.userId, tx);
      const totalEarnings = Number(sale.totalEarnings);
      const advanceAmount = Number((totalEarnings * 0.1).toFixed(4));

      const advancePayout = await this.advancePayoutService.createAdvancePayout(
        {
          saleId,
          amount: advanceAmount,
          currency: sale.currency,
          status: AdvancePayoutStatus.SUCCESS,
        },
        tx,
      );

      const ledgerEntry = await this.ledgerService.recordAdvance(
        {
          accountId: account.id,
          amount: advanceAmount,
          currency: sale.currency,
          referenceId: saleId,
        },
        tx,
      );

      return {
        sale,
        advancePayout,
        ledgerEntry,
      };
    });
  }
}

export const advancePayoutWorkflow = new AdvancePayoutWorkflow();
