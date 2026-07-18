import { withTransaction } from '../../shared/utils/index.js';
import { saleService } from '../sales/service/sale.service.js';
import { accountService } from '../accounts/service/account.service.js';
import { advancePayoutService } from '../advance-payouts/service/advance-payout.service.js';
import { ledgerService } from '../ledger/service/ledger.service.js';
import { SaleStatus } from '../../shared/constants/index.js';
import { BusinessRuleViolationError } from '../../shared/errors/index.js';

export class SaleReconciliationWorkflow {
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

  async approveSale(saleId) {
    return this.transactionRunner(async (tx) => {
      const sale = await this.saleService.getSaleById(saleId, tx);
      if (sale.status !== SaleStatus.PENDING) {
        throw new BusinessRuleViolationError(`Sale ${saleId} is not pending`);
      }

      const account = await this.accountService.getAccountByUserId(sale.userId, tx);
      const advance = await this.advancePayoutService.findSuccessfulAdvanceForSale(saleId, tx);
      const advanceAmount = Number(advance?.amount ?? 0);
      const settlementAmount = Number((Number(sale.totalEarnings) - advanceAmount).toFixed(4));

      let ledgerEntry = null;
      if (settlementAmount !== 0) {
        ledgerEntry = await this.ledgerService.recordSettlement(
          {
            accountId: account.id,
            amount: settlementAmount,
            currency: sale.currency,
            referenceId: saleId,
          },
          tx,
        );
      }

      const reconciledSale = await this.saleService.markApproved(saleId, tx);

      return {
        sale: reconciledSale,
        ledgerEntry,
        advanceAmount,
        settlementAmount,
      };
    });
  }

  async rejectSale(saleId) {
    return this.transactionRunner(async (tx) => {
      const sale = await this.saleService.getSaleById(saleId, tx);
      if (sale.status !== SaleStatus.PENDING) {
        throw new BusinessRuleViolationError(`Sale ${saleId} is not pending`);
      }

      const account = await this.accountService.getAccountByUserId(sale.userId, tx);
      const advance = await this.advancePayoutService.findSuccessfulAdvanceForSale(saleId, tx);
      const advanceAmount = Number(advance?.amount ?? 0);
      const rejectionAmount = -advanceAmount;

      let ledgerEntry = null;
      if (rejectionAmount !== 0) {
        ledgerEntry = await this.ledgerService.recordRejectionAdjustment(
          {
            accountId: account.id,
            amount: rejectionAmount,
            currency: sale.currency,
            referenceId: saleId,
          },
          tx,
        );
      }

      const reconciledSale = await this.saleService.markRejected(saleId, tx);

      return {
        sale: reconciledSale,
        ledgerEntry,
        advanceAmount,
        rejectionAmount,
      };
    });
  }
}

export const saleReconciliationWorkflow = new SaleReconciliationWorkflow();
