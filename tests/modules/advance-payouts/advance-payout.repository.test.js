import { AdvancePayoutRepository } from '../../../src/modules/advance-payouts/repository/advance-payout.repository.js';

describe('AdvancePayoutRepository', () => {
  const tx = {
    advancePayout: {
      create: jest.fn().mockResolvedValue({ id: 'advance-1', saleId: 'sale-1', status: 'PENDING' }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'advance-1', status: 'PROCESSING' }),
    },
  };

  const repository = new AdvancePayoutRepository(tx);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an advance payout', async () => {
    const data = { saleId: 'sale-1', amount: 100, currency: 'USD', status: 'PENDING' };
    const result = await repository.create(data);

    expect(tx.advancePayout.create).toHaveBeenCalledWith({ data });
    expect(result).toEqual({ id: 'advance-1', saleId: 'sale-1', status: 'PENDING' });
  });

  it('finds an advance payout by id', async () => {
    tx.advancePayout.findUnique.mockResolvedValue({ id: 'advance-1' });

    const result = await repository.findById('advance-1');

    expect(tx.advancePayout.findUnique).toHaveBeenCalledWith({ where: { id: 'advance-1' } });
    expect(result).toEqual({ id: 'advance-1' });
  });

  it('finds advance payouts by sale id', async () => {
    tx.advancePayout.findMany.mockResolvedValue([{ id: 'advance-1', saleId: 'sale-1' }]);

    const result = await repository.findBySaleId('sale-1');

    expect(tx.advancePayout.findMany).toHaveBeenCalledWith({ where: { saleId: 'sale-1' } });
    expect(result).toEqual([{ id: 'advance-1', saleId: 'sale-1' }]);
  });

  it('finds a successful advance payout by sale id', async () => {
    tx.advancePayout.findFirst.mockResolvedValue({ id: 'advance-1', status: 'SUCCESS' });

    const result = await repository.findSuccessfulBySaleId('sale-1');

    expect(tx.advancePayout.findFirst).toHaveBeenCalledWith({
      where: { saleId: 'sale-1', status: 'SUCCESS' },
    });
    expect(result).toEqual({ id: 'advance-1', status: 'SUCCESS' });
  });

  it('checks advance payout existence for sale', async () => {
    tx.advancePayout.count.mockResolvedValue(1);

    const result = await repository.existsForSale('sale-1');

    expect(tx.advancePayout.count).toHaveBeenCalledWith({ where: { saleId: 'sale-1' } });
    expect(result).toBe(true);
  });

  it('updates advance payout status', async () => {
    const result = await repository.updateStatus('advance-1', 'PROCESSING');

    expect(tx.advancePayout.update).toHaveBeenCalledWith({
      where: { id: 'advance-1' },
      data: { status: 'PROCESSING' },
    });
    expect(result).toEqual({ id: 'advance-1', status: 'PROCESSING' });
  });
});
