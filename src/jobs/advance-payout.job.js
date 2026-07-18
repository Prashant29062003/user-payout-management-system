import { saleService } from '../modules/sales/index.js';
import { advancePayoutWorkflow } from '../modules/workflows/index.js';
import { BusinessRuleViolationError } from '../shared/errors/index.js';

export class AdvancePayoutJob {
  constructor({
    saleServiceInstance = saleService,
    advancePayoutWorkflowInstance = advancePayoutWorkflow,
  } = {}) {
    this.saleService = saleServiceInstance;
    this.advancePayoutWorkflow = advancePayoutWorkflowInstance;
  }

  async run() {
    const pendingSales = await this.saleService.listPendingSales();
    const results = [];

    for (const sale of pendingSales) {
      try {
        const workflowResult = await this.advancePayoutWorkflow.execute(sale.id);
        results.push({
          saleId: sale.id,
          status: 'processed',
          advancePayoutId: workflowResult.advancePayout?.id,
          ledgerEntryId: workflowResult.ledgerEntry?.id,
        });
      } catch (error) {
        if (error instanceof BusinessRuleViolationError) {
          results.push({ saleId: sale.id, status: 'skipped', reason: error.message });
          continue;
        }

        results.push({ saleId: sale.id, status: 'failed', message: error.message });
      }
    }

    return results;
  }
}

export const advancePayoutJob = new AdvancePayoutJob();
