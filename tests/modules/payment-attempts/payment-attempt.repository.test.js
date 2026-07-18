import { PaymentAttemptRepository } from '../../../src/modules/payment-attempts/repository/payment-attempt.repository.js';

describe('PaymentAttemptRepository', () => {
  const tx = {
    paymentAttempt: {
      create: jest.fn().mockResolvedValue({ id: 'attempt-1', withdrawalId: 'withdrawal-1', status: 'PROCESSING' }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'attempt-1', status: 'SUCCESS' }),
    },
  };

  const repository = new PaymentAttemptRepository(tx);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a payment attempt', async () => {
    const data = { withdrawalId: 'withdrawal-1', provider: 'stripe', status: 'PROCESSING' };
    const result = await repository.create(data);

    expect(tx.paymentAttempt.create).toHaveBeenCalledWith({ data });
    expect(result).toEqual({ id: 'attempt-1', withdrawalId: 'withdrawal-1', status: 'PROCESSING' });
  });

  it('finds a payment attempt by id', async () => {
    tx.paymentAttempt.findUnique.mockResolvedValue({ id: 'attempt-1' });

    const result = await repository.findById('attempt-1');

    expect(tx.paymentAttempt.findUnique).toHaveBeenCalledWith({ where: { id: 'attempt-1' } });
    expect(result).toEqual({ id: 'attempt-1' });
  });

  it('finds a payment attempt by idempotency key', async () => {
    tx.paymentAttempt.findUnique.mockResolvedValue({ id: 'attempt-1' });

    const result = await repository.findByIdempotencyKey('idem-key');

    expect(tx.paymentAttempt.findUnique).toHaveBeenCalledWith({ where: { idempotencyKey: 'idem-key' } });
    expect(result).toEqual({ id: 'attempt-1' });
  });

  it('finds payment attempts by withdrawal id', async () => {
    tx.paymentAttempt.findMany.mockResolvedValue([{ id: 'attempt-1', withdrawalId: 'withdrawal-1' }]);

    const result = await repository.findByWithdrawalId('withdrawal-1');

    expect(tx.paymentAttempt.findMany).toHaveBeenCalledWith({ where: { withdrawalId: 'withdrawal-1' } });
    expect(result).toEqual([{ id: 'attempt-1', withdrawalId: 'withdrawal-1' }]);
  });

  it('finds the latest attempt for a withdrawal', async () => {
    tx.paymentAttempt.findFirst.mockResolvedValue({ id: 'attempt-1', withdrawalId: 'withdrawal-1' });

    const result = await repository.findLatestAttempt('withdrawal-1');

    expect(tx.paymentAttempt.findFirst).toHaveBeenCalledWith({
      where: { withdrawalId: 'withdrawal-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toEqual({ id: 'attempt-1', withdrawalId: 'withdrawal-1' });
  });

  it('updates a payment attempt status', async () => {
    const result = await repository.updateStatus('attempt-1', 'SUCCESS');

    expect(tx.paymentAttempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { status: 'SUCCESS' } });
    expect(result).toEqual({ id: 'attempt-1', status: 'SUCCESS' });
  });
});
