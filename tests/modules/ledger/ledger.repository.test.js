import { LedgerRepository } from '../../../src/modules/ledger/repository/ledger.repository.js';

describe('LedgerRepository', () => {
  const tx = {
    ledgerEntry: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };

  const repository = new LedgerRepository(tx);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('appends a ledger entry', async () => {
    const entry = { accountId: 'acct-1', amount: 100, currency: 'USD' };
    tx.ledgerEntry.create.mockResolvedValue({ id: 'entry-1', ...entry });

    const result = await repository.appendEntry(entry);

    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({ data: entry });
    expect(result).toEqual({ id: 'entry-1', ...entry });
  });

  it('finds a ledger entry by id', async () => {
    tx.ledgerEntry.findUnique.mockResolvedValue({ id: 'entry-1' });

    const result = await repository.findById('entry-1');

    expect(tx.ledgerEntry.findUnique).toHaveBeenCalledWith({ where: { id: 'entry-1' } });
    expect(result).toEqual({ id: 'entry-1' });
  });

  it('finds ledger entries for an account ordered by creation time', async () => {
    const entries = [
      { id: 'entry-1', accountId: 'acct-1' },
      { id: 'entry-2', accountId: 'acct-1' },
    ];
    tx.ledgerEntry.findMany.mockResolvedValue(entries);

    const result = await repository.findByAccountId('acct-1');

    expect(tx.ledgerEntry.findMany).toHaveBeenCalledWith({ where: { accountId: 'acct-1' }, orderBy: { createdAt: 'asc' } });
    expect(result).toEqual(entries);
  });

  it('finds ledger entries by reference type and id', async () => {
    const entries = [{ id: 'entry-1', referenceType: 'WITHDRAWAL', referenceId: 'withdrawal-1' }];
    tx.ledgerEntry.findMany.mockResolvedValue(entries);

    const result = await repository.findByReference('WITHDRAWAL', 'withdrawal-1');

    expect(tx.ledgerEntry.findMany).toHaveBeenCalledWith({
      where: { referenceType: 'WITHDRAWAL', referenceId: 'withdrawal-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual(entries);
  });
});
