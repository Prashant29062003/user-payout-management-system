import { LedgerService } from '../../../src/modules/ledger/service/ledger.service.js';
import { LedgerEntryType } from '../../../src/shared/constants/index.js';

describe('LedgerService', () => {
  const mockAppendEntry = jest.fn();
  class MockLedgerRepository {
    constructor(tx) {
      this.tx = tx;
    }

    appendEntry(entry) {
      return mockAppendEntry(entry);
    }
  }

  const mockProjectionService = {
    applyProjection: jest.fn(),
  };

  const mockTransactionRunner = jest.fn(async (handler) => {
    const tx = { fake: true };
    return handler(tx);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a ledger entry and applies projection in a transaction', async () => {
    const ledgerEntry = { id: 'entry-1', accountId: 'acct-1', amount: 100, currency: 'USD' };
    mockAppendEntry.mockResolvedValue(ledgerEntry);

    const service = new LedgerService(MockLedgerRepository, mockProjectionService, mockTransactionRunner);

    const result = await service.recordEntry({
      accountId: 'acct-1',
      amount: 100,
      currency: 'USD',
      entryType: LedgerEntryType.ADVANCE,
      referenceType: 'SALE',
      referenceId: 'sale-1',
    });

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockAppendEntry).toHaveBeenCalledWith({
      accountId: 'acct-1',
      amount: 100,
      currency: 'USD',
      entryType: LedgerEntryType.ADVANCE,
      referenceType: 'SALE',
      referenceId: 'sale-1',
    });
    expect(mockProjectionService.applyProjection).toHaveBeenCalledWith('acct-1', 100, 'USD', expect.any(Object));
    expect(result).toEqual(ledgerEntry);
  });

  it('records a withdrawal entry using the withdrawal helper', async () => {
    const ledgerEntry = { id: 'entry-2', accountId: 'acct-1', amount: -50, currency: 'USD' };
    mockAppendEntry.mockResolvedValue(ledgerEntry);

    const service = new LedgerService(MockLedgerRepository, mockProjectionService, mockTransactionRunner);

    const result = await service.recordWithdrawal({
      accountId: 'acct-1',
      amount: -50,
      currency: 'USD',
      referenceId: 'withdrawal-1',
    });

    expect(mockAppendEntry).toHaveBeenCalledWith(expect.objectContaining({
      entryType: LedgerEntryType.WITHDRAWAL,
      referenceType: 'WITHDRAWAL',
      referenceId: 'withdrawal-1',
    }));
    expect(result).toEqual(ledgerEntry);
  });
});
