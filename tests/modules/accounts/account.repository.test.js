import { AccountRepository } from '../../../src/modules/accounts/repository/account.repository.js';

describe('AccountRepository', () => {
  const tx = {
    account: {
      create: jest.fn().mockResolvedValue({ id: 'acct-1', userId: 'user-1' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'acct-1', withdrawableBalance: 100 }),
    },
  };

  const repository = new AccountRepository(tx);

  beforeEach(() => {
    tx.account.create.mockClear();
    tx.account.findUnique.mockClear();
    tx.account.update.mockClear();
  });

  it('creates an account', async () => {
    const payload = { userId: 'user-1', currency: 'USD' };
    const result = await repository.create(payload);

    expect(tx.account.create).toHaveBeenCalledWith({ data: payload });
    expect(result).toEqual({ id: 'acct-1', userId: 'user-1' });
  });

  it('finds an account by id', async () => {
    tx.account.findUnique.mockResolvedValue({ id: 'acct-1', userId: 'user-1' });

    const result = await repository.findById('acct-1');

    expect(tx.account.findUnique).toHaveBeenCalledWith({ where: { id: 'acct-1' } });
    expect(result).toEqual({ id: 'acct-1', userId: 'user-1' });
  });

  it('finds an account by user id', async () => {
    tx.account.findUnique.mockResolvedValue({ id: 'acct-1', userId: 'user-1' });

    const result = await repository.findByUserId('user-1');

    expect(tx.account.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result).toEqual({ id: 'acct-1', userId: 'user-1' });
  });

  it('updates an account', async () => {
    const payload = { withdrawableBalance: 100 };

    const result = await repository.update('acct-1', payload);

    expect(tx.account.update).toHaveBeenCalledWith({ where: { id: 'acct-1' }, data: payload });
    expect(result).toEqual({ id: 'acct-1', withdrawableBalance: 100 });
  });

  it('updates account balance incrementally', async () => {
    const result = await repository.updateBalance('acct-1', 50);

    expect(tx.account.update).toHaveBeenCalledWith({
      where: { id: 'acct-1' },
      data: { withdrawableBalance: { increment: 50 } },
    });
    expect(result).toEqual({ id: 'acct-1', withdrawableBalance: 100 });
  });
});
