import { SaleStatus } from '../../../src/shared/constants/index.js';
import { BusinessRuleViolationError } from '../../../src/shared/errors/index.js';
import { SaleReconciliationWorkflow } from '../../../src/modules/workflows/sale-reconciliation.workflow.js';

describe('SaleReconciliationWorkflow', () => {
  const mockSaleService = {
    getSaleById: jest.fn(),
    markApproved: jest.fn(),
    markRejected: jest.fn(),
  };

  const mockAccountService = {
    getAccountByUserId: jest.fn(),
  };

  const mockAdvancePayoutService = {
    findSuccessfulAdvanceForSale: jest.fn(),
  };

  const mockLedgerService = {
    recordSettlement: jest.fn(),
    recordRejectionAdjustment: jest.fn(),
  };

  const mockTransactionRunner = jest.fn(async (work) => {
    const tx = { fakeTransaction: true };
    return work(tx);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('approves a pending sale and records a settlement ledger entry', async () => {
    mockSaleService.getSaleById.mockResolvedValue({
      id: 'sale-1',
      userId: 'user-1',
      status: SaleStatus.PENDING,
      totalEarnings: 100,
      currency: 'USD',
    });
    mockAdvancePayoutService.findSuccessfulAdvanceForSale.mockResolvedValue({ amount: 10 });
    mockAccountService.getAccountByUserId.mockResolvedValue({ id: 'acct-1' });
    mockLedgerService.recordSettlement.mockResolvedValue({
      id: 'ledger-1',
      accountId: 'acct-1',
      amount: 90,
      currency: 'USD',
      entryType: 'SETTLEMENT',
      referenceType: 'SALE',
      referenceId: 'sale-1',
    });
    mockSaleService.markApproved.mockResolvedValue({ id: 'sale-1', status: SaleStatus.APPROVED });

    const workflow = new SaleReconciliationWorkflow({
      saleServiceInstance: mockSaleService,
      accountServiceInstance: mockAccountService,
      advancePayoutServiceInstance: mockAdvancePayoutService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.approveSale('sale-1');

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockSaleService.getSaleById).toHaveBeenCalledWith('sale-1', expect.any(Object));
    expect(mockAccountService.getAccountByUserId).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(mockAdvancePayoutService.findSuccessfulAdvanceForSale).toHaveBeenCalledWith('sale-1', expect.any(Object));
    expect(mockLedgerService.recordSettlement).toHaveBeenCalledWith(
      {
        accountId: 'acct-1',
        amount: 90,
        currency: 'USD',
        referenceId: 'sale-1',
      },
      expect.any(Object),
    );
    expect(mockSaleService.markApproved).toHaveBeenCalledWith('sale-1', expect.any(Object));
    expect(result).toEqual({
      sale: { id: 'sale-1', status: SaleStatus.APPROVED },
      ledgerEntry: {
        id: 'ledger-1',
        accountId: 'acct-1',
        amount: 90,
        currency: 'USD',
        entryType: 'SETTLEMENT',
        referenceType: 'SALE',
        referenceId: 'sale-1',
      },
      advanceAmount: 10,
      settlementAmount: 90,
    });
  });

  it('rejects a pending sale and records a rejection adjustment ledger entry', async () => {
    mockSaleService.getSaleById.mockResolvedValue({
      id: 'sale-2',
      userId: 'user-2',
      status: SaleStatus.PENDING,
      totalEarnings: 200,
      currency: 'USD',
    });
    mockAdvancePayoutService.findSuccessfulAdvanceForSale.mockResolvedValue({ amount: 20 });
    mockAccountService.getAccountByUserId.mockResolvedValue({ id: 'acct-2' });
    mockLedgerService.recordRejectionAdjustment.mockResolvedValue({
      id: 'ledger-2',
      accountId: 'acct-2',
      amount: -20,
      currency: 'USD',
      entryType: 'REJECTION_ADJUSTMENT',
      referenceType: 'SALE',
      referenceId: 'sale-2',
    });
    mockSaleService.markRejected.mockResolvedValue({ id: 'sale-2', status: SaleStatus.REJECTED });

    const workflow = new SaleReconciliationWorkflow({
      saleServiceInstance: mockSaleService,
      accountServiceInstance: mockAccountService,
      advancePayoutServiceInstance: mockAdvancePayoutService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.rejectSale('sale-2');

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockSaleService.getSaleById).toHaveBeenCalledWith('sale-2', expect.any(Object));
    expect(mockAccountService.getAccountByUserId).toHaveBeenCalledWith('user-2', expect.any(Object));
    expect(mockAdvancePayoutService.findSuccessfulAdvanceForSale).toHaveBeenCalledWith('sale-2', expect.any(Object));
    expect(mockLedgerService.recordRejectionAdjustment).toHaveBeenCalledWith(
      {
        accountId: 'acct-2',
        amount: -20,
        currency: 'USD',
        referenceId: 'sale-2',
      },
      expect.any(Object),
    );
    expect(mockSaleService.markRejected).toHaveBeenCalledWith('sale-2', expect.any(Object));
    expect(result).toEqual({
      sale: { id: 'sale-2', status: SaleStatus.REJECTED },
      ledgerEntry: {
        id: 'ledger-2',
        accountId: 'acct-2',
        amount: -20,
        currency: 'USD',
        entryType: 'REJECTION_ADJUSTMENT',
        referenceType: 'SALE',
        referenceId: 'sale-2',
      },
      advanceAmount: 20,
      rejectionAmount: -20,
    });
  });

  it('throws when reconciling a sale that is not pending', async () => {
    mockSaleService.getSaleById.mockResolvedValue({
      id: 'sale-3',
      userId: 'user-3',
      status: SaleStatus.APPROVED,
      totalEarnings: 100,
      currency: 'USD',
    });

    const workflow = new SaleReconciliationWorkflow({
      saleServiceInstance: mockSaleService,
      accountServiceInstance: mockAccountService,
      advancePayoutServiceInstance: mockAdvancePayoutService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    await expect(workflow.approveSale('sale-3')).rejects.toThrow(BusinessRuleViolationError);
    expect(mockLedgerService.recordSettlement).not.toHaveBeenCalled();
    expect(mockSaleService.markApproved).not.toHaveBeenCalled();
  });

  it('propagates errors when ledger recording fails during approval', async () => {
    mockSaleService.getSaleById.mockResolvedValue({
      id: 'sale-4',
      userId: 'user-4',
      status: SaleStatus.PENDING,
      totalEarnings: 150,
      currency: 'USD',
    });
    mockAdvancePayoutService.findSuccessfulAdvanceForSale.mockResolvedValue({ amount: 15 });
    mockAccountService.getAccountByUserId.mockResolvedValue({ id: 'acct-4' });
    mockLedgerService.recordSettlement.mockRejectedValue(new Error('Ledger write failed'));

    const workflow = new SaleReconciliationWorkflow({
      saleServiceInstance: mockSaleService,
      accountServiceInstance: mockAccountService,
      advancePayoutServiceInstance: mockAdvancePayoutService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    await expect(workflow.approveSale('sale-4')).rejects.toThrow('Ledger write failed');
    expect(mockSaleService.markApproved).not.toHaveBeenCalled();
  });
});
