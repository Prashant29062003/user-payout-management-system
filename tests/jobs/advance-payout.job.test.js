import { AdvancePayoutJob } from '../../src/jobs/advance-payout.job.js';
import { BusinessRuleViolationError } from '../../src/shared/errors/index.js';

describe('AdvancePayoutJob', () => {
  const mockSaleService = {
    listPendingSales: jest.fn(),
  };

  const mockAdvancePayoutWorkflow = {
    execute: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('processes pending sales and returns success summary', async () => {
    mockSaleService.listPendingSales.mockResolvedValue([
      { id: 'sale-1' },
      { id: 'sale-2' },
    ]);
    mockAdvancePayoutWorkflow.execute.mockResolvedValueOnce({ advancePayout: { id: 'advance-1' }, ledgerEntry: { id: 'ledger-1' } });
    mockAdvancePayoutWorkflow.execute.mockResolvedValueOnce({ advancePayout: { id: 'advance-2' }, ledgerEntry: { id: 'ledger-2' } });

    const job = new AdvancePayoutJob({
      saleServiceInstance: mockSaleService,
      advancePayoutWorkflowInstance: mockAdvancePayoutWorkflow,
    });

    const results = await job.run();

    expect(results).toEqual([
      {
        saleId: 'sale-1',
        status: 'processed',
        advancePayoutId: 'advance-1',
        ledgerEntryId: 'ledger-1',
      },
      {
        saleId: 'sale-2',
        status: 'processed',
        advancePayoutId: 'advance-2',
        ledgerEntryId: 'ledger-2',
      },
    ]);
    expect(mockSaleService.listPendingSales).toHaveBeenCalled();
    expect(mockAdvancePayoutWorkflow.execute).toHaveBeenCalledTimes(2);
  });

  it('skips sales that violate business rules and continues processing', async () => {
    mockSaleService.listPendingSales.mockResolvedValue([{ id: 'sale-3' }]);
    mockAdvancePayoutWorkflow.execute.mockRejectedValueOnce(new BusinessRuleViolationError('Advance already exists'));

    const job = new AdvancePayoutJob({
      saleServiceInstance: mockSaleService,
      advancePayoutWorkflowInstance: mockAdvancePayoutWorkflow,
    });

    const results = await job.run();

    expect(results).toEqual([
      {
        saleId: 'sale-3',
        status: 'skipped',
        reason: 'Advance already exists',
      },
    ]);
  });

  it('returns a failed summary when unexpected errors occur', async () => {
    mockSaleService.listPendingSales.mockResolvedValue([{ id: 'sale-4' }]);
    mockAdvancePayoutWorkflow.execute.mockRejectedValueOnce(new Error('Unexpected failure'));

    const job = new AdvancePayoutJob({
      saleServiceInstance: mockSaleService,
      advancePayoutWorkflowInstance: mockAdvancePayoutWorkflow,
    });

    const results = await job.run();

    expect(results).toEqual([
      {
        saleId: 'sale-4',
        status: 'failed',
        message: 'Unexpected failure',
      },
    ]);
  });
});
