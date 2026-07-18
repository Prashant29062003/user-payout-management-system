import { WithdrawalService } from '../../../src/modules/withdrawals/service/withdrawal.service.js';
import { WithdrawalStatus } from '../../../src/shared/constants/index.js';

describe('WithdrawalService', () => {
  const mockRepository = {
    findById: jest.fn(),
    findRecentByAccountId: jest.fn(),
    updateStatus: jest.fn(),
  };

  const mockTransactionRunner = jest.fn(async (work) => {
    const tx = {
      withdrawal: {
        create: jest.fn().mockResolvedValue({ id: 'withdrawal-1', accountId: 'acct-1', amount: 100, status: 'PENDING' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      account: {
        findUnique: jest.fn(),
      },
    };

    const result = await work(tx);
    return result;
  });

  const mockAccountRepositoryClass = jest.fn();

  const service = new WithdrawalService(mockRepository, mockAccountRepositoryClass, mockTransactionRunner);

  beforeEach(() => {
    jest.clearAllMocks();
    mockAccountRepositoryClass.mockReset();
  });

  it('creates a withdrawal with default pending status', async () => {
    const account = { id: 'acct-1', withdrawableBalance: 150 };
    mockAccountRepositoryClass.mockImplementation(() => ({ findById: jest.fn().mockResolvedValue(account) }));

    const result = await service.createWithdrawal({ accountId: 'acct-1', userId: 'user-1', amount: 100, currency: 'USD' });

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(result).toEqual({ id: 'withdrawal-1', accountId: 'acct-1', amount: 100, status: 'PENDING' });
  });

  it('throws when withdrawal amount is invalid', async () => {
    await expect(
      service.createWithdrawal({ accountId: 'acct-1', userId: 'user-1', amount: 0, currency: 'USD' }),
    ).rejects.toThrow('Withdrawal amount must be a positive number');
  });

  it('throws when account is not found', async () => {
    mockAccountRepositoryClass.mockImplementation(() => ({ findById: jest.fn().mockResolvedValue(null) }));

    await expect(
      service.createWithdrawal({ accountId: 'acct-1', userId: 'user-1', amount: 100, currency: 'USD' }),
    ).rejects.toThrow('Account with id acct-1 not found');
  });

  it('throws when withdrawable balance is insufficient', async () => {
    const account = { id: 'acct-1', withdrawableBalance: 50 };
    mockAccountRepositoryClass.mockImplementation(() => ({ findById: jest.fn().mockResolvedValue(account) }));

    await expect(
      service.createWithdrawal({ accountId: 'acct-1', userId: 'user-1', amount: 100, currency: 'USD' }),
    ).rejects.toThrow('Insufficient withdrawable balance for this account');
  });

  it('throws when a withdrawal exists in the last 24 hours', async () => {
    const account = { id: 'acct-1', withdrawableBalance: 150 };
    mockAccountRepositoryClass.mockImplementation(() => ({ findById: jest.fn().mockResolvedValue(account) }));
    mockTransactionRunner.mockImplementation(async (work) => {
      const tx = {
        withdrawal: {
          create: jest.fn(),
          findMany: jest.fn().mockResolvedValue([{ id: 'withdrawal-1', createdAt: new Date() }]),
        },
        account: {
          findUnique: jest.fn().mockResolvedValue(account),
        },
      };
      return work(tx);
    });

    await expect(
      service.createWithdrawal({ accountId: 'acct-1', userId: 'user-1', amount: 100, currency: 'USD' }),
    ).rejects.toThrow('A withdrawal was already created for this account in the last 24 hours');
  });

  it('marks a withdrawal processing from pending', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'withdrawal-1', status: WithdrawalStatus.PENDING });
    mockRepository.updateStatus.mockResolvedValue({ id: 'withdrawal-1', status: WithdrawalStatus.PROCESSING });

    const result = await service.markProcessing('withdrawal-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('withdrawal-1', WithdrawalStatus.PROCESSING);
    expect(result).toEqual({ id: 'withdrawal-1', status: WithdrawalStatus.PROCESSING });
  });

  it('marks a withdrawal succeeded from processing', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'withdrawal-1', status: WithdrawalStatus.PROCESSING });
    mockRepository.updateStatus.mockResolvedValue({ id: 'withdrawal-1', status: WithdrawalStatus.SUCCESS });

    const result = await service.markSucceeded('withdrawal-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('withdrawal-1', WithdrawalStatus.SUCCESS);
    expect(result).toEqual({ id: 'withdrawal-1', status: WithdrawalStatus.SUCCESS });
  });

  it('recovers a failed withdrawal', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'withdrawal-1', status: WithdrawalStatus.FAILED });
    mockRepository.updateStatus.mockResolvedValue({ id: 'withdrawal-1', status: WithdrawalStatus.PROCESSING });

    const result = await service.recoverFailedWithdrawal('withdrawal-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('withdrawal-1', WithdrawalStatus.PROCESSING);
    expect(result).toEqual({ id: 'withdrawal-1', status: WithdrawalStatus.PROCESSING });
  });

  it('throws when recovering a non-failed withdrawal', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'withdrawal-1', status: WithdrawalStatus.SUCCESS });

    await expect(service.recoverFailedWithdrawal('withdrawal-1')).rejects.toThrow(
      'Only failed withdrawals can be recovered',
    );
  });

  it('returns false when insufficient balance in canWithdraw', async () => {
    const accountRepo = { findById: jest.fn().mockResolvedValue({ id: 'acct-1', withdrawableBalance: 50 }) };
    const accountRepoClass = jest.fn(() => accountRepo);
    const serviceWithAccountMock = new WithdrawalService(mockRepository, accountRepoClass, mockTransactionRunner);
    mockRepository.findRecentByAccountId.mockResolvedValue([]);

    const result = await serviceWithAccountMock.canWithdraw('acct-1', 100);

    expect(result).toBe(false);
  });

  it('returns false when a recent withdrawal exists in canWithdraw', async () => {
    const accountRepo = { findById: jest.fn().mockResolvedValue({ id: 'acct-1', withdrawableBalance: 150 }) };
    const accountRepoClass = jest.fn(() => accountRepo);
    const serviceWithAccountMock = new WithdrawalService(mockRepository, accountRepoClass, mockTransactionRunner);
    mockRepository.findRecentByAccountId.mockResolvedValue([{ id: 'withdrawal-1', createdAt: new Date() }]);

    const result = await serviceWithAccountMock.canWithdraw('acct-1', 100);

    expect(result).toBe(false);
  });

  it('returns true when account has sufficient balance and no recent withdrawals', async () => {
    const accountRepo = { findById: jest.fn().mockResolvedValue({ id: 'acct-1', withdrawableBalance: 200 }) };
    const accountRepoClass = jest.fn(() => accountRepo);
    const serviceWithAccountMock = new WithdrawalService(mockRepository, accountRepoClass, mockTransactionRunner);
    mockRepository.findRecentByAccountId.mockResolvedValue([]);

    const result = await serviceWithAccountMock.canWithdraw('acct-1', 100);

    expect(result).toBe(true);
  });
});
