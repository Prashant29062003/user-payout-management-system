import { AdvancePayoutWorkflow } from '../../../src/modules/workflows/advance-payout.workflow.js';
import { SaleStatus, AdvancePayoutStatus } from '../../../src/shared/constants/index.js';
import { BusinessRuleViolationError } from '../../../src/shared/errors/index.js';

describe('AdvancePayoutWorkflow', () => {
  const mockSaleService = {
    getSaleById: jest.fn(),
  };

  const mockAccountService = {
    getAccountByUserId: jest.fn(),
  };

  const mockAdvancePayoutService = {
    isEligibleForSale: jest.fn(),
    createAdvancePayout: jest.fn(),
  };

  const mockLedgerService = {
    recordAdvance: jest.fn(),
  };

  const mockTransactionRunner = jest.fn(async (work) => {
    const tx = { fakeTransaction: true };
    return work(tx);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an advance payout and ledger entry for a pending sale', async () => {
    mockSaleService.getSaleById.mockResolvedValue({
      id: 'sale-1',
      userId: 'user-1',
      status: SaleStatus.PENDING,
      totalEarnings: 100,
      currency: 'USD',
    });
    mockAdvancePayoutService.isEligibleForSale.mockResolvedValue(true);
    mockAccountService.getAccountByUserId.mockResolvedValue({ id: 'acct-1' });
    mockAdvancePayoutService.createAdvancePayout.mockResolvedValue({
      id: 'advance-1',
      saleId: 'sale-1',
      amount: 10,
      currency: 'USD',
      status: AdvancePayoutStatus.SUCCESS,
    });
    mockLedgerService.recordAdvance.mockResolvedValue({
      id: 'ledger-1',
      accountId: 'acct-1',
      amount: 10,
      currency: 'USD',
      entryType: 'ADVANCE',
      referenceType: 'SALE',
      referenceId: 'sale-1',
    });

    const workflow = new AdvancePayoutWorkflow({
      saleServiceInstance: mockSaleService,
      accountServiceInstance: mockAccountService,
      advancePayoutServiceInstance: mockAdvancePayoutService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.execute('sale-1');

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockSaleService.getSaleById).toHaveBeenCalledWith('sale-1', expect.any(Object));
    expect(mockAdvancePayoutService.isEligibleForSale).toHaveBeenCalledWith('sale-1', expect.any(Object));
    expect(mockAccountService.getAccountByUserId).toHaveBeenCalledWith('user-1', expect.any(Object));
    expect(mockAdvancePayoutService.createAdvancePayout).toHaveBeenCalledWith(
      {
        saleId: 'sale-1',
        amount: 10,
        currency: 'USD',
        status: AdvancePayoutStatus.SUCCESS,
      },
      expect.any(Object),
    );
    expect(mockLedgerService.recordAdvance).toHaveBeenCalledWith(
      {
        accountId: 'acct-1',
        amount: 10,
        currency: 'USD',
        referenceId: 'sale-1',
      },
      expect.any(Object),
    );
    expect(result).toEqual({
      sale: {
        id: 'sale-1',
        userId: 'user-1',
        status: SaleStatus.PENDING,
        totalEarnings: 100,
        currency: 'USD',
      },
      advancePayout: {
        id: 'advance-1',
        saleId: 'sale-1',
        amount: 10,
        currency: 'USD',
        status: AdvancePayoutStatus.SUCCESS,
      },
      ledgerEntry: {
        id: 'ledger-1',
        accountId: 'acct-1',
        amount: 10,
        currency: 'USD',
        entryType: 'ADVANCE',
        referenceType: 'SALE',
        referenceId: 'sale-1',
      },
    });
  });

  it('throws when a successful advance payout already exists for the sale', async () => {
    mockSaleService.getSaleById.mockResolvedValue({
      id: 'sale-2',
      userId: 'user-2',
      status: SaleStatus.PENDING,
      totalEarnings: 500,
      currency: 'USD',
    });
    mockAdvancePayoutService.isEligibleForSale.mockResolvedValue(false);

    const workflow = new AdvancePayoutWorkflow({
      saleServiceInstance: mockSaleService,
      accountServiceInstance: mockAccountService,
      advancePayoutServiceInstance: mockAdvancePayoutService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    await expect(workflow.execute('sale-2')).rejects.toThrow(BusinessRuleViolationError);
    expect(mockAdvancePayoutService.createAdvancePayout).not.toHaveBeenCalled();
    expect(mockLedgerService.recordAdvance).not.toHaveBeenCalled();
  });

  it('propagates errors and keeps the transaction boundary when ledger recording fails', async () => {
    mockSaleService.getSaleById.mockResolvedValue({
      id: 'sale-3',
      userId: 'user-3',
      status: SaleStatus.PENDING,
      totalEarnings: 200,
      currency: 'USD',
    });
    mockAdvancePayoutService.isEligibleForSale.mockResolvedValue(true);
    mockAccountService.getAccountByUserId.mockResolvedValue({ id: 'acct-3' });
    mockAdvancePayoutService.createAdvancePayout.mockResolvedValue({
      id: 'advance-3',
      saleId: 'sale-3',
      amount: 20,
      currency: 'USD',
      status: AdvancePayoutStatus.SUCCESS,
    });
    mockLedgerService.recordAdvance.mockRejectedValue(new Error('Ledger write failed'));

    const workflow = new AdvancePayoutWorkflow({
      saleServiceInstance: mockSaleService,
      accountServiceInstance: mockAccountService,
      advancePayoutServiceInstance: mockAdvancePayoutService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    await expect(workflow.execute('sale-3')).rejects.toThrow('Ledger write failed');
    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockAdvancePayoutService.createAdvancePayout).toHaveBeenCalled();
    expect(mockLedgerService.recordAdvance).toHaveBeenCalled();
  });
});
