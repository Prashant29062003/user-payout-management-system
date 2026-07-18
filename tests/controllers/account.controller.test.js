import { getAccount, getAccountLedger } from '../../src/controllers/account.controller.js';
import { accountService } from '../../src/modules/accounts/index.js';
import { ledgerRepository } from '../../src/modules/ledger/repository/ledger.repository.js';

describe('AccountController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns account information', async () => {
    jest.spyOn(accountService, 'getAccountById').mockResolvedValue({ id: 'acct-1', withdrawableBalance: 100 });

    const req = { params: { accountId: 'acct-1' } };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await getAccount(req, res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ id: 'acct-1' }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns account ledger history', async () => {
    jest.spyOn(accountService, 'getAccountById').mockResolvedValue({ id: 'acct-1' });
    jest.spyOn(ledgerRepository, 'listHistory').mockResolvedValue([{ id: 'entry-1' }]);

    const req = { params: { accountId: 'acct-1' } };
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const res = { status };
    const next = jest.fn();

    await getAccountLedger(req, res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: [{ id: 'entry-1' }] }));
    expect(next).not.toHaveBeenCalled();
  });
});
