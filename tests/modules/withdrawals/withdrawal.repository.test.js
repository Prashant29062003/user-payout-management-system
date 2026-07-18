import { WithdrawalRepository } from '../../../src/modules/withdrawals/repository/withdrawal.repository.js';

describe('WithdrawalRepository', () => {
  const tx = {
    withdrawal: {
      create: jest
        .fn()
        .mockResolvedValue({ id: 'withdrawal-1', accountId: 'acct-1', status: 'PENDING' }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'withdrawal-1', status: 'PROCESSING' }),
      count: jest.fn(),
    },
  };

  const repository = new WithdrawalRepository(tx);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a withdrawal', async () => {
    const data = {
      accountId: 'acct-1',
      userId: 'user-1',
      amount: 100,
      currency: 'USD',
      status: 'PENDING',
    };
    const result = await repository.create(data);

    expect(tx.withdrawal.create).toHaveBeenCalledWith({ data });
    expect(result).toEqual({ id: 'withdrawal-1', accountId: 'acct-1', status: 'PENDING' });
  });

  it('finds a withdrawal by id', async () => {
    tx.withdrawal.findUnique.mockResolvedValue({ id: 'withdrawal-1' });

    const result = await repository.findById('withdrawal-1');

    expect(tx.withdrawal.findUnique).toHaveBeenCalledWith({ where: { id: 'withdrawal-1' } });
    expect(result).toEqual({ id: 'withdrawal-1' });
  });

  it('finds withdrawals by account id', async () => {
    tx.withdrawal.findMany.mockResolvedValue([{ id: 'withdrawal-1', accountId: 'acct-1' }]);

    const result = await repository.findByAccountId('acct-1');

    expect(tx.withdrawal.findMany).toHaveBeenCalledWith({ where: { accountId: 'acct-1' } });
    expect(result).toEqual([{ id: 'withdrawal-1', accountId: 'acct-1' }]);
  });

  it('finds withdrawals by user id', async () => {
    tx.withdrawal.findMany.mockResolvedValue([{ id: 'withdrawal-1', userId: 'user-1' }]);

    const result = await repository.findByUserId('user-1');

    expect(tx.withdrawal.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result).toEqual([{ id: 'withdrawal-1', userId: 'user-1' }]);
  });

  it('finds pending withdrawals by account id', async () => {
    tx.withdrawal.findMany.mockResolvedValue([
      { id: 'withdrawal-1', accountId: 'acct-1', status: 'PENDING' },
    ]);

    const result = await repository.findPendingByAccountId('acct-1');

    expect(tx.withdrawal.findMany).toHaveBeenCalledWith({
      where: {
        accountId: 'acct-1',
        status: {
          in: ['PENDING', 'PROCESSING'],
        },
      },
    });
    expect(result).toEqual([{ id: 'withdrawal-1', accountId: 'acct-1', status: 'PENDING' }]);
  });

  it('finds recent withdrawals by account id', async () => {
    const since = new Date('2026-07-18T00:00:00.000Z');
    tx.withdrawal.findMany.mockResolvedValue([{ id: 'withdrawal-1', accountId: 'acct-1' }]);

    const result = await repository.findRecentByAccountId('acct-1', since);

    expect(tx.withdrawal.findMany).toHaveBeenCalledWith({
      where: {
        accountId: 'acct-1',
        createdAt: { gte: since },
      },
    });
    expect(result).toEqual([{ id: 'withdrawal-1', accountId: 'acct-1' }]);
  });

  it('updates withdrawal status', async () => {
    const result = await repository.updateStatus('withdrawal-1', 'PROCESSING');

    expect(tx.withdrawal.update).toHaveBeenCalledWith({
      where: { id: 'withdrawal-1' },
      data: { status: 'PROCESSING' },
    });
    expect(result).toEqual({ id: 'withdrawal-1', status: 'PROCESSING' });
  });

  it('checks withdrawal existence for account id', async () => {
    tx.withdrawal.count.mockResolvedValue(1);

    const result = await repository.existsForAccountId('acct-1');

    expect(tx.withdrawal.count).toHaveBeenCalledWith({ where: { accountId: 'acct-1' } });
    expect(result).toBe(true);
  });
});
