import { SaleRepository } from '../../../src/modules/sales/repository/sale.repository.js';

describe('SaleRepository', () => {
  const tx = {
    sale: {
      create: jest.fn().mockResolvedValue({ id: 'sale-1', userId: 'user-1', status: 'PENDING' }),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'sale-1', status: 'APPROVED' }),
    },
  };

  const repository = new SaleRepository(tx);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a sale', async () => {
    const input = { userId: 'user-1', totalEarnings: 100, currency: 'USD', status: 'PENDING' };
    const result = await repository.create(input);

    expect(tx.sale.create).toHaveBeenCalledWith({ data: input });
    expect(result).toEqual({ id: 'sale-1', userId: 'user-1', status: 'PENDING' });
  });

  it('finds a sale by id', async () => {
    tx.sale.findUnique.mockResolvedValue({ id: 'sale-1', userId: 'user-1' });

    const result = await repository.findById('sale-1');

    expect(tx.sale.findUnique).toHaveBeenCalledWith({ where: { id: 'sale-1' } });
    expect(result).toEqual({ id: 'sale-1', userId: 'user-1' });
  });

  it('finds sales by user id', async () => {
    tx.sale.findMany.mockResolvedValue([{ id: 'sale-1', userId: 'user-1' }]);

    const result = await repository.findByUserId('user-1');

    expect(tx.sale.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(result).toEqual([{ id: 'sale-1', userId: 'user-1' }]);
  });

  it('finds pending sales', async () => {
    tx.sale.findMany.mockResolvedValue([{ id: 'sale-1', status: 'PENDING' }]);

    const result = await repository.findPending();

    expect(tx.sale.findMany).toHaveBeenCalledWith({ where: { status: 'PENDING' } });
    expect(result).toEqual([{ id: 'sale-1', status: 'PENDING' }]);
  });

  it('updates sale status', async () => {
    const result = await repository.updateStatus('sale-1', 'APPROVED');

    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 'sale-1' },
      data: { status: 'APPROVED' },
    });
    expect(result).toEqual({ id: 'sale-1', status: 'APPROVED' });
  });

  it('checks if a sale exists', async () => {
    tx.sale.findUnique.mockResolvedValue({ id: 'sale-1' });

    const result = await repository.exists('sale-1');

    expect(tx.sale.findUnique).toHaveBeenCalledWith({ where: { id: 'sale-1' } });
    expect(result).toBe(true);
  });

  it('returns false when a sale does not exist', async () => {
    tx.sale.findUnique.mockResolvedValue(null);

    const result = await repository.exists('sale-1');

    expect(result).toBe(false);
  });
});
