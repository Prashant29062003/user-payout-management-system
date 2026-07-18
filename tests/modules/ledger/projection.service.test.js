import { ProjectionService } from '../../../src/modules/ledger/service/projection.service.js';

describe('ProjectionService', () => {
  it('applies a positive ledger entry to reduce recovery before increasing withdrawable balance', async () => {
    const account = { withdrawableBalance: 0, recoveryBalance: 10 };
    const mockAccountRepo = {
      findById: jest.fn().mockResolvedValue(account),
      updateBalances: jest
        .fn()
        .mockResolvedValue({ id: 'acct-1', withdrawableBalance: 20, recoveryBalance: 0 }),
    };
    const repositoryClass = jest.fn(() => mockAccountRepo);
    const service = new ProjectionService(repositoryClass);

    const result = await service.applyProjection('acct-1', 30, 'USD');

    expect(mockAccountRepo.findById).toHaveBeenCalledWith('acct-1');
    expect(mockAccountRepo.updateBalances).toHaveBeenCalledWith('acct-1', {
      withdrawableBalance: 20,
      recoveryBalance: 0,
    });
    expect(result).toEqual({ id: 'acct-1', withdrawableBalance: 20, recoveryBalance: 0 });
  });

  it('applies a negative ledger entry to reduce withdrawable balance and increase recovery balance', async () => {
    const account = { withdrawableBalance: 25, recoveryBalance: 0 };
    const mockAccountRepo = {
      findById: jest.fn().mockResolvedValue(account),
      updateBalances: jest
        .fn()
        .mockResolvedValue({ id: 'acct-1', withdrawableBalance: 0, recoveryBalance: 15 }),
    };
    const repositoryClass = jest.fn(() => mockAccountRepo);
    const service = new ProjectionService(repositoryClass);

    const result = await service.applyProjection('acct-1', -40, 'USD');

    expect(mockAccountRepo.findById).toHaveBeenCalledWith('acct-1');
    expect(mockAccountRepo.updateBalances).toHaveBeenCalledWith('acct-1', {
      withdrawableBalance: 0,
      recoveryBalance: 15,
    });
    expect(result).toEqual({ id: 'acct-1', withdrawableBalance: 0, recoveryBalance: 15 });
  });

  it('throws when account is not found', async () => {
    const mockAccountRepo = {
      findById: jest.fn().mockResolvedValue(null),
      updateBalances: jest.fn(),
    };
    const repositoryClass = jest.fn(() => mockAccountRepo);
    const service = new ProjectionService(repositoryClass);

    await expect(service.applyProjection('acct-1', 10, 'USD')).rejects.toThrow(
      'Account with id acct-1 not found'
    );
    expect(mockAccountRepo.updateBalances).not.toHaveBeenCalled();
  });
});
