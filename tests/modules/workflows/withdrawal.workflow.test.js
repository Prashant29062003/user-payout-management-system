import { WithdrawalWorkflow } from '../../../src/modules/workflows/withdrawal.workflow.js';

describe('WithdrawalWorkflow', () => {
  const mockWithdrawalService = {
    createWithdrawal: jest.fn(),
    getWithdrawalById: jest.fn(),
  };

  const mockPaymentAttemptService = {
    getAttemptByIdempotencyKey: jest.fn(),
    startAttempt: jest.fn(),
    attachProviderDetails: jest.fn(),
  };

  const mockPaymentProvider = {
    name: 'mock',
    submitPaymentAttempt: jest.fn().mockResolvedValue({
      provider: 'mock',
      providerReference: 'mock-attempt-1',
      status: 'PROCESSING',
    }),
  };

  const mockTransactionRunner = jest.fn(async (work) => {
    const tx = { fakeTransaction: true };
    return work(tx);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a withdrawal and payment attempt inside a transaction', async () => {
    mockWithdrawalService.createWithdrawal.mockResolvedValue({ id: 'withdrawal-1', accountId: 'acct-1', amount: 50 });
    mockPaymentAttemptService.getAttemptByIdempotencyKey.mockResolvedValue(null);
    mockPaymentAttemptService.startAttempt.mockResolvedValue({ id: 'attempt-1', withdrawalId: 'withdrawal-1', amount: 50 });

    const workflow = new WithdrawalWorkflow({
      withdrawalServiceInstance: mockWithdrawalService,
      paymentAttemptServiceInstance: mockPaymentAttemptService,
      paymentProviderInstance: mockPaymentProvider,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.execute({
      accountId: 'acct-1',
      userId: 'user-1',
      amount: 50,
      currency: 'USD',
      idempotencyKey: 'idem-1',
    });

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockPaymentAttemptService.getAttemptByIdempotencyKey).toHaveBeenCalledWith('idem-1', expect.any(Object));
    expect(mockWithdrawalService.createWithdrawal).toHaveBeenCalledWith(
      {
        accountId: 'acct-1',
        userId: 'user-1',
        amount: 50,
        currency: 'USD',
        status: 'PENDING',
      },
      expect.any(Object),
    );
    expect(mockPaymentAttemptService.startAttempt).toHaveBeenCalledWith(
      {
        withdrawalId: 'withdrawal-1',
        amount: 50,
        currency: 'USD',
        idempotencyKey: 'idem-1',
      },
      expect.any(Object),
    );
    expect(result).toEqual({
      withdrawal: { id: 'withdrawal-1', accountId: 'acct-1', amount: 50 },
      paymentAttempt: {
        id: 'attempt-1',
        withdrawalId: 'withdrawal-1',
        amount: 50,
        provider: 'mock',
        providerReference: 'mock-attempt-1',
      },
    });
  });

  it('returns existing payment attempt and withdrawal when the same idempotency key is reused', async () => {
    mockPaymentAttemptService.getAttemptByIdempotencyKey.mockResolvedValue({ id: 'attempt-2', withdrawalId: 'withdrawal-2' });
    mockWithdrawalService.getWithdrawalById.mockResolvedValue({ id: 'withdrawal-2', accountId: 'acct-2', amount: 75 });

    const workflow = new WithdrawalWorkflow({
      withdrawalServiceInstance: mockWithdrawalService,
      paymentAttemptServiceInstance: mockPaymentAttemptService,
      paymentProviderInstance: mockPaymentProvider,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.execute({
      accountId: 'acct-2',
      userId: 'user-2',
      amount: 75,
      currency: 'USD',
      idempotencyKey: 'idem-2',
    });

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockPaymentAttemptService.getAttemptByIdempotencyKey).toHaveBeenCalledWith('idem-2', expect.any(Object));
    expect(mockWithdrawalService.createWithdrawal).not.toHaveBeenCalled();
    expect(mockPaymentAttemptService.startAttempt).not.toHaveBeenCalled();
    expect(result).toEqual({
      withdrawal: { id: 'withdrawal-2', accountId: 'acct-2', amount: 75 },
      paymentAttempt: { id: 'attempt-2', withdrawalId: 'withdrawal-2' },
    });
  });

  it('propagates errors when payment attempt creation fails', async () => {
    mockPaymentAttemptService.getAttemptByIdempotencyKey.mockResolvedValue(null);
    mockWithdrawalService.createWithdrawal.mockResolvedValue({ id: 'withdrawal-3', accountId: 'acct-3', amount: 150 });
    mockPaymentAttemptService.startAttempt.mockRejectedValue(new Error('Provider request failed'));

    const workflow = new WithdrawalWorkflow({
      withdrawalServiceInstance: mockWithdrawalService,
      paymentAttemptServiceInstance: mockPaymentAttemptService,
      paymentProviderInstance: mockPaymentProvider,
      transactionRunner: mockTransactionRunner,
    });

    await expect(
      workflow.execute({
        accountId: 'acct-3',
        userId: 'user-3',
        amount: 150,
        currency: 'USD',
        idempotencyKey: 'idem-3',
      }),
    ).rejects.toThrow('Provider request failed');

    expect(mockWithdrawalService.createWithdrawal).toHaveBeenCalled();
    expect(mockPaymentAttemptService.startAttempt).toHaveBeenCalled();
  });
});
