import { PaymentStatus } from '../../../src/shared/constants/index.js';
import { RecoveryWorkflow } from '../../../src/modules/workflows/recovery.workflow.js';
import { BusinessRuleViolationError } from '../../../src/shared/errors/index.js';

describe('RecoveryWorkflow', () => {
  const mockPaymentAttemptService = {
    getAttemptById: jest.fn(),
    markFailed: jest.fn(),
    markCancelled: jest.fn(),
    markRejected: jest.fn(),
  };

  const mockWithdrawalService = {
    getWithdrawalById: jest.fn(),
    markFailed: jest.fn(),
  };

  const mockLedgerService = {
    hasRecoveryForReference: jest.fn(),
    recordRecovery: jest.fn(),
  };

  const mockTransactionRunner = jest.fn(async (work) => {
    const tx = { fakeTransaction: true };
    return work(tx);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records a recovery ledger entry for a failed withdrawal payment attempt', async () => {
    mockPaymentAttemptService.getAttemptById.mockResolvedValue({
      id: 'attempt-1',
      withdrawalId: 'withdrawal-1',
      status: PaymentStatus.FAILED,
    });
    mockWithdrawalService.getWithdrawalById.mockResolvedValue({
      id: 'withdrawal-1',
      accountId: 'acct-1',
      amount: 100,
      currency: 'USD',
      status: 'FAILED',
    });
    mockLedgerService.hasRecoveryForReference.mockResolvedValue(false);
    mockLedgerService.recordRecovery.mockResolvedValue({
      id: 'ledger-1',
      accountId: 'acct-1',
      amount: 100,
      currency: 'USD',
      entryType: 'WITHDRAWAL_RECOVERY',
      referenceType: 'WITHDRAWAL',
      referenceId: 'withdrawal-1',
    });
    mockWithdrawalService.markFailed.mockResolvedValue({ id: 'withdrawal-1', status: 'FAILED' });

    const workflow = new RecoveryWorkflow({
      paymentAttemptServiceInstance: mockPaymentAttemptService,
      withdrawalServiceInstance: mockWithdrawalService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.execute({
      paymentAttemptId: 'attempt-1',
      failureStatus: PaymentStatus.FAILED,
    });

    expect(mockTransactionRunner).toHaveBeenCalled();
    expect(mockPaymentAttemptService.getAttemptById).toHaveBeenCalledWith(
      'attempt-1',
      expect.any(Object)
    );
    expect(mockWithdrawalService.getWithdrawalById).toHaveBeenCalledWith(
      'withdrawal-1',
      expect.any(Object)
    );
    expect(mockLedgerService.hasRecoveryForReference).toHaveBeenCalledWith(
      'WITHDRAWAL',
      'withdrawal-1',
      expect.any(Object)
    );
    expect(mockLedgerService.recordRecovery).toHaveBeenCalledWith(
      {
        accountId: 'acct-1',
        amount: 100,
        currency: 'USD',
        referenceId: 'withdrawal-1',
      },
      expect.any(Object)
    );
    expect(result).toEqual({
      alreadyRecovered: false,
      withdrawal: {
        id: 'withdrawal-1',
        accountId: 'acct-1',
        amount: 100,
        currency: 'USD',
        status: 'FAILED',
      },
      paymentAttempt: {
        id: 'attempt-1',
        withdrawalId: 'withdrawal-1',
        status: PaymentStatus.FAILED,
      },
      ledgerEntry: {
        id: 'ledger-1',
        accountId: 'acct-1',
        amount: 100,
        currency: 'USD',
        entryType: 'WITHDRAWAL_RECOVERY',
        referenceType: 'WITHDRAWAL',
        referenceId: 'withdrawal-1',
      },
    });
  });

  it('returns existing recovery when already applied', async () => {
    mockPaymentAttemptService.getAttemptById.mockResolvedValue({
      id: 'attempt-2',
      withdrawalId: 'withdrawal-2',
      status: PaymentStatus.FAILED,
    });
    mockWithdrawalService.getWithdrawalById.mockResolvedValue({
      id: 'withdrawal-2',
      accountId: 'acct-2',
      amount: 75,
      currency: 'USD',
      status: 'FAILED',
    });
    mockLedgerService.hasRecoveryForReference.mockResolvedValue(true);

    const workflow = new RecoveryWorkflow({
      paymentAttemptServiceInstance: mockPaymentAttemptService,
      withdrawalServiceInstance: mockWithdrawalService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.execute({
      paymentAttemptId: 'attempt-2',
      failureStatus: PaymentStatus.FAILED,
    });

    expect(mockLedgerService.recordRecovery).not.toHaveBeenCalled();
    expect(result).toEqual({
      alreadyRecovered: true,
      withdrawal: {
        id: 'withdrawal-2',
        accountId: 'acct-2',
        amount: 75,
        currency: 'USD',
        status: 'FAILED',
      },
      paymentAttempt: {
        id: 'attempt-2',
        withdrawalId: 'withdrawal-2',
        status: PaymentStatus.FAILED,
      },
    });
  });

  it('throws when attempting recovery for a successful payment attempt', async () => {
    mockPaymentAttemptService.getAttemptById.mockResolvedValue({
      id: 'attempt-3',
      withdrawalId: 'withdrawal-3',
      status: PaymentStatus.SUCCESS,
    });

    const workflow = new RecoveryWorkflow({
      paymentAttemptServiceInstance: mockPaymentAttemptService,
      withdrawalServiceInstance: mockWithdrawalService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    await expect(
      workflow.execute({ paymentAttemptId: 'attempt-3', failureStatus: PaymentStatus.FAILED })
    ).rejects.toThrow(BusinessRuleViolationError);
    expect(mockLedgerService.recordRecovery).not.toHaveBeenCalled();
  });

  it('updates the payment attempt and withdrawal to failed when recovery is executed for a processing attempt', async () => {
    mockPaymentAttemptService.getAttemptById.mockResolvedValue({
      id: 'attempt-4',
      withdrawalId: 'withdrawal-4',
      status: PaymentStatus.PROCESSING,
    });
    mockPaymentAttemptService.markFailed.mockResolvedValue({
      id: 'attempt-4',
      withdrawalId: 'withdrawal-4',
      status: PaymentStatus.FAILED,
    });
    mockWithdrawalService.getWithdrawalById.mockResolvedValue({
      id: 'withdrawal-4',
      accountId: 'acct-4',
      amount: 120,
      currency: 'USD',
      status: 'PROCESSING',
    });
    mockWithdrawalService.markFailed.mockResolvedValue({ id: 'withdrawal-4', status: 'FAILED' });
    mockLedgerService.hasRecoveryForReference.mockResolvedValue(false);
    mockLedgerService.recordRecovery.mockResolvedValue({
      id: 'ledger-4',
      accountId: 'acct-4',
      amount: 120,
      currency: 'USD',
      entryType: 'WITHDRAWAL_RECOVERY',
      referenceType: 'WITHDRAWAL',
      referenceId: 'withdrawal-4',
    });

    const workflow = new RecoveryWorkflow({
      paymentAttemptServiceInstance: mockPaymentAttemptService,
      withdrawalServiceInstance: mockWithdrawalService,
      ledgerServiceInstance: mockLedgerService,
      transactionRunner: mockTransactionRunner,
    });

    const result = await workflow.execute({
      paymentAttemptId: 'attempt-4',
      failureStatus: PaymentStatus.FAILED,
    });

    expect(mockPaymentAttemptService.markFailed).toHaveBeenCalledWith(
      'attempt-4',
      expect.any(Object)
    );
    expect(mockWithdrawalService.markFailed).toHaveBeenCalledWith(
      'withdrawal-4',
      expect.any(Object)
    );
    expect(result).toEqual({
      alreadyRecovered: false,
      withdrawal: { id: 'withdrawal-4', status: 'FAILED' },
      paymentAttempt: {
        id: 'attempt-4',
        withdrawalId: 'withdrawal-4',
        status: PaymentStatus.FAILED,
      },
      ledgerEntry: {
        id: 'ledger-4',
        accountId: 'acct-4',
        amount: 120,
        currency: 'USD',
        entryType: 'WITHDRAWAL_RECOVERY',
        referenceType: 'WITHDRAWAL',
        referenceId: 'withdrawal-4',
      },
    });
  });
});
