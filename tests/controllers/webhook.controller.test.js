import { jest } from '@jest/globals';
import { paymentAttemptService } from '../../src/modules/payment-attempts/index.js';
import { withdrawalService } from '../../src/modules/withdrawals/index.js';
import { ledgerService } from '../../src/modules/ledger/index.js';
import { recoveryWorkflow } from '../../src/modules/workflows/index.js';

jest.unstable_mockModule('../../src/shared/utils/index.js', () => ({
  withTransaction: jest.fn(async (work) => work('tx')),
}));

let handlePaymentProviderWebhook;

describe('WebhookController', () => {
  beforeAll(async () => {
    ({ handlePaymentProviderWebhook } =
      await import('../../src/controllers/webhook.controller.js'));
    utils = await import('../../src/shared/utils/index.js');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('handles successful payment provider events', async () => {
    jest
      .spyOn(paymentAttemptService, 'markSucceeded')
      .mockResolvedValue({ id: 'attempt-1', withdrawalId: 'withdrawal-1' });
    jest
      .spyOn(withdrawalService, 'getWithdrawalById')
      .mockResolvedValue({ id: 'withdrawal-1', accountId: 'acct-1', amount: 100, currency: 'USD' });
    jest
      .spyOn(withdrawalService, 'markSucceeded')
      .mockResolvedValue({ id: 'withdrawal-1', status: 'SUCCESS' });
    jest.spyOn(ledgerService, 'findEntriesByReference').mockResolvedValue([]);
    jest.spyOn(ledgerService, 'recordWithdrawal').mockResolvedValue({ id: 'ledger-1' });

    const req = { body: { paymentAttemptId: 'attempt-1', status: 'SUCCESS' } };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await handlePaymentProviderWebhook(req, res, next);

    expect(paymentAttemptService.markSucceeded).toHaveBeenCalledWith(
      'attempt-1',
      expect.anything()
    );
    expect(withdrawalService.markSucceeded).toHaveBeenCalledWith('withdrawal-1', expect.anything());
    expect(ledgerService.recordWithdrawal).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acct-1',
        amount: 100,
        currency: 'USD',
        referenceId: 'withdrawal-1',
      }),
      expect.anything()
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('handles failed payment provider events by invoking recovery workflow', async () => {
    jest.spyOn(recoveryWorkflow, 'execute').mockResolvedValue({ alreadyRecovered: false });

    const req = { body: { paymentAttemptId: 'attempt-2', status: 'FAILED' } };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await handlePaymentProviderWebhook(req, res, next);

    expect(recoveryWorkflow.execute).toHaveBeenCalledWith({
      paymentAttemptId: 'attempt-2',
      failureStatus: 'FAILED',
      failureReason: undefined,
    });
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });
});
