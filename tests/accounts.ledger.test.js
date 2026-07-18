import { applyCredit, applyDebit } from '../src/modules/accounts/service.js';
import {
  createLedgerEntry,
  listLedgerEntries,
  sumLedgerEntries,
} from '../src/modules/ledger/repository.js';

describe('account projection and ledger repository', () => {
  it('applies a credit by updating the balance and creating a ledger entry', async () => {
    const tx = {
      account: {
        update: jest.fn().mockResolvedValue({ id: 'acct_1', withdrawableBalance: 125 }),
      },
      ledgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry_1' }),
      },
    };

    const result = await applyCredit('acct_1', 125, 'USD', 'sale', 'sale_1', tx);

    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acct_1' },
      data: {
        withdrawableBalance: { increment: 125 },
        updatedAt: expect.any(Date),
      },
    });
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acct_1',
        entryType: 'credit',
        amount: 125,
        currency: 'USD',
        referenceType: 'sale',
        referenceId: 'sale_1',
      },
    });
    expect(result.account.withdrawableBalance).toBe(125);
  });

  it('applies a debit by decreasing the balance and creating a ledger entry', async () => {
    const tx = {
      account: {
        update: jest.fn().mockResolvedValue({ id: 'acct_1', withdrawableBalance: 75 }),
      },
      ledgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry_2' }),
      },
    };

    const result = await applyDebit('acct_1', 50, 'USD', 'withdrawal', 'withdrawal_1', tx);

    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acct_1' },
      data: {
        withdrawableBalance: { increment: -50 },
        updatedAt: expect.any(Date),
      },
    });
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acct_1',
        entryType: 'debit',
        amount: 50,
        currency: 'USD',
        referenceType: 'withdrawal',
        referenceId: 'withdrawal_1',
      },
    });
    expect(result.account.withdrawableBalance).toBe(75);
  });

  it('reads and aggregates ledger entries for an account', async () => {
    const tx = {
      ledgerEntry: {
        findMany: jest.fn().mockResolvedValue([{ id: 'entry_1', amount: 100 }]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 100 } }),
      },
    };

    const entries = await listLedgerEntries('acct_1', tx);
    const total = await sumLedgerEntries('acct_1', 'credit', tx);

    expect(entries).toHaveLength(1);
    expect(total).toBe(100);
    expect(tx.ledgerEntry.findMany).toHaveBeenCalledWith({ where: { accountId: 'acct_1' } });
    expect(tx.ledgerEntry.aggregate).toHaveBeenCalledWith({
      where: { accountId: 'acct_1', entryType: 'credit' },
      _sum: { amount: true },
    });
  });

  it('creates a ledger entry directly', async () => {
    const tx = {
      ledgerEntry: {
        create: jest.fn().mockResolvedValue({ id: 'entry_3' }),
      },
    };

    const created = await createLedgerEntry(
      {
        accountId: 'acct_1',
        entryType: 'credit',
        amount: 15,
        currency: 'USD',
        referenceType: 'sale',
        referenceId: 'sale_2',
      },
      tx,
    );

    expect(created.id).toBe('entry_3');
    expect(tx.ledgerEntry.create).toHaveBeenCalledWith({
      data: {
        accountId: 'acct_1',
        entryType: 'credit',
        amount: 15,
        currency: 'USD',
        referenceType: 'sale',
        referenceId: 'sale_2',
      },
    });
  });
});
