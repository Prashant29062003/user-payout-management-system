import { PaymentAttemptService } from '../../../src/modules/payment-attempts/service/payment-attempt.service.js';
import { PaymentStatus } from '../../../src/shared/constants/index.js';

describe('PaymentAttemptService', () => {
  const mockRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    findByWithdrawalId: jest.fn(),
    findLatestAttempt: jest.fn(),
    updateStatus: jest.fn(),
  };

  const service = new PaymentAttemptService(mockRepository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts a payment attempt with default processing status', async () => {
    const input = { withdrawalId: 'withdrawal-1', provider: 'stripe' };
    mockRepository.create.mockResolvedValue({ id: 'attempt-1', ...input, status: PaymentStatus.PROCESSING });

    const result = await service.startAttempt(input);

    expect(mockRepository.create).toHaveBeenCalledWith({ ...input, status: PaymentStatus.PROCESSING });
    expect(result).toEqual({ id: 'attempt-1', ...input, status: PaymentStatus.PROCESSING });
  });

  it('returns existing attempt when idempotency key is reused', async () => {
    const existingAttempt = { id: 'attempt-1', idempotencyKey: 'idem-key', status: PaymentStatus.PROCESSING };
    mockRepository.findByIdempotencyKey.mockResolvedValue(existingAttempt);

    const result = await service.startAttempt({ withdrawalId: 'withdrawal-1', provider: 'stripe', idempotencyKey: 'idem-key' });

    expect(mockRepository.findByIdempotencyKey).toHaveBeenCalledWith('idem-key');
    expect(mockRepository.create).not.toHaveBeenCalled();
    expect(result).toEqual(existingAttempt);
  });

  it('throws when starting an attempt with invalid status', async () => {
    await expect(
      service.startAttempt({ withdrawalId: 'withdrawal-1', provider: 'stripe', status: 'INVALID' }),
    ).rejects.toThrow('Invalid payment attempt status: INVALID');
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('retrieves a payment attempt by id', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.PROCESSING });

    const result = await service.getAttemptById('attempt-1');

    expect(mockRepository.findById).toHaveBeenCalledWith('attempt-1');
    expect(result).toEqual({ id: 'attempt-1', status: PaymentStatus.PROCESSING });
  });

  it('throws when payment attempt is not found', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.getAttemptById('attempt-1')).rejects.toThrow('Payment attempt with id attempt-1 not found');
  });

  it('marks an attempt succeeded from processing', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.PROCESSING });
    mockRepository.updateStatus.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.SUCCESS });

    const result = await service.markSucceeded('attempt-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('attempt-1', PaymentStatus.SUCCESS);
    expect(result).toEqual({ id: 'attempt-1', status: PaymentStatus.SUCCESS });
  });

  it('marks an attempt failed from processing', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.PROCESSING });
    mockRepository.updateStatus.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.FAILED });

    const result = await service.markFailed('attempt-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('attempt-1', PaymentStatus.FAILED);
    expect(result).toEqual({ id: 'attempt-1', status: PaymentStatus.FAILED });
  });

  it('marks an attempt cancelled from processing', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.PROCESSING });
    mockRepository.updateStatus.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.CANCELLED });

    const result = await service.markCancelled('attempt-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('attempt-1', PaymentStatus.CANCELLED);
    expect(result).toEqual({ id: 'attempt-1', status: PaymentStatus.CANCELLED });
  });

  it('throws when transitioning from success to processing', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'attempt-1', status: PaymentStatus.SUCCESS });

    await expect(service.markProcessing('attempt-1')).rejects.toThrow(
      'Cannot transition payment attempt from SUCCESS to PROCESSING',
    );
    expect(mockRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('finds attempts by withdrawal id', async () => {
    mockRepository.findByWithdrawalId.mockResolvedValue([{ id: 'attempt-1', withdrawalId: 'withdrawal-1' }]);

    const result = await service.findAttemptsByWithdrawalId('withdrawal-1');

    expect(mockRepository.findByWithdrawalId).toHaveBeenCalledWith('withdrawal-1');
    expect(result).toEqual([{ id: 'attempt-1', withdrawalId: 'withdrawal-1' }]);
  });

  it('finds the latest attempt by withdrawal id', async () => {
    mockRepository.findLatestAttempt.mockResolvedValue({ id: 'attempt-1', withdrawalId: 'withdrawal-1' });

    const result = await service.findLatestAttempt('withdrawal-1');

    expect(mockRepository.findLatestAttempt).toHaveBeenCalledWith('withdrawal-1');
    expect(result).toEqual({ id: 'attempt-1', withdrawalId: 'withdrawal-1' });
  });
});
