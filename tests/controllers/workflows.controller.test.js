import {
  runAdvancePayout,
  reconcileSale,
  createWithdrawal,
} from '../../src/controllers/workflows.controller.js';
import {
  advancePayoutWorkflow,
  saleReconciliationWorkflow,
  withdrawalWorkflow,
} from '../../src/modules/workflows/index.js';

describe('WorkflowsController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('runs advance payout workflow', async () => {
    jest.spyOn(advancePayoutWorkflow, 'execute').mockResolvedValue({ sale: { id: 'sale-1' } });

    const req = { body: { saleId: 'sale-1' } };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await runAdvancePayout(req, res, next);

    expect(advancePayoutWorkflow.execute).toHaveBeenCalledWith('sale-1');
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('approves a sale when reconcile action is approve', async () => {
    jest
      .spyOn(saleReconciliationWorkflow, 'approveSale')
      .mockResolvedValue({ sale: { id: 'sale-2', status: 'APPROVED' } });

    const req = { params: { saleId: 'sale-2' }, body: { action: 'approve' } };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await reconcileSale(req, res, next);

    expect(saleReconciliationWorkflow.approveSale).toHaveBeenCalledWith('sale-2');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects a sale when reconcile action is reject', async () => {
    jest
      .spyOn(saleReconciliationWorkflow, 'rejectSale')
      .mockResolvedValue({ sale: { id: 'sale-3', status: 'REJECTED' } });

    const req = { params: { saleId: 'sale-3' }, body: { action: 'reject' } };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await reconcileSale(req, res, next);

    expect(saleReconciliationWorkflow.rejectSale).toHaveBeenCalledWith('sale-3');
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });

  it('creates a withdrawal', async () => {
    jest
      .spyOn(withdrawalWorkflow, 'execute')
      .mockResolvedValue({
        withdrawal: { id: 'withdrawal-1' },
        paymentAttempt: { id: 'attempt-1' },
      });

    const req = {
      body: {
        accountId: 'acct-1',
        userId: 'user-1',
        amount: 75,
        currency: 'USD',
        idempotencyKey: 'idem-1',
      },
    };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await createWithdrawal(req, res, next);

    expect(withdrawalWorkflow.execute).toHaveBeenCalledWith({
      accountId: 'acct-1',
      userId: 'user-1',
      amount: 75,
      currency: 'USD',
      idempotencyKey: 'idem-1',
    });
    expect(status).toHaveBeenCalledWith(201);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    expect(next).not.toHaveBeenCalled();
  });
});
