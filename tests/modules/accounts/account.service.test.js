import { AccountService } from '../../../src/modules/accounts/service/account.service.js';

describe('AccountService', () => {
  const mockRepository = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateBalance: jest.fn(),
  };

  const service = new AccountService(mockRepository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an account', async () => {
    mockRepository.create.mockResolvedValue({ id: 'acct-1', userId: 'user-1' });

    const result = await service.createAccount({ userId: 'user-1', currency: 'USD' });

    expect(mockRepository.create).toHaveBeenCalledWith({ userId: 'user-1', currency: 'USD' });
    expect(result).toEqual({ id: 'acct-1', userId: 'user-1' });
  });

  it('returns an account by id', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'acct-1' });

    const result = await service.getAccountById('acct-1');

    expect(mockRepository.findById).toHaveBeenCalledWith('acct-1');
    expect(result).toEqual({ id: 'acct-1' });
  });

  it('throws when account by id is missing', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.getAccountById('acct-1')).rejects.toThrow('Account with id acct-1 not found');
  });

  it('returns an account by user id', async () => {
    mockRepository.findByUserId.mockResolvedValue({ id: 'acct-1', userId: 'user-1' });

    const result = await service.getAccountByUserId('user-1');

    expect(mockRepository.findByUserId).toHaveBeenCalledWith('user-1');
    expect(result).toEqual({ id: 'acct-1', userId: 'user-1' });
  });

  it('throws when account by user id is missing', async () => {
    mockRepository.findByUserId.mockResolvedValue(null);

    await expect(service.getAccountByUserId('user-1')).rejects.toThrow('Account for user user-1 not found');
  });

  it('updates an existing account', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'acct-1' });
    mockRepository.update.mockResolvedValue({ id: 'acct-1', currency: 'USD' });

    const result = await service.updateAccount('acct-1', { currency: 'USD' });

    expect(mockRepository.update).toHaveBeenCalledWith('acct-1', { currency: 'USD' });
    expect(result).toEqual({ id: 'acct-1', currency: 'USD' });
  });

  it('throws when updating a missing account', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.updateAccount('acct-1', { currency: 'USD' })).rejects.toThrow(
      'Account with id acct-1 not found',
    );
  });

  it('updates account balance when account exists', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'acct-1' });
    mockRepository.updateBalance.mockResolvedValue({ id: 'acct-1', withdrawableBalance: 150 });

    const result = await service.updateAccountBalance('acct-1', 50);

    expect(mockRepository.updateBalance).toHaveBeenCalledWith('acct-1', 50);
    expect(result).toEqual({ id: 'acct-1', withdrawableBalance: 150 });
  });

  it('throws when updating balance of a missing account', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.updateAccountBalance('acct-1', 50)).rejects.toThrow(
      'Account with id acct-1 not found',
    );
  });
});
