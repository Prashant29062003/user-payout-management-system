import { SaleService } from '../../../src/modules/sales/service/sale.service.js';
import { SaleStatus } from '../../../src/shared/constants/index.js';

describe('SaleService', () => {
  const mockRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findPending: jest.fn(),
    findByUserId: jest.fn(),
    updateStatus: jest.fn(),
  };

  const service = new SaleService(mockRepository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a sale with default pending status', async () => {
    const saleInput = { userId: 'user-1', totalEarnings: 100, currency: 'USD' };
    mockRepository.create.mockResolvedValue({ id: 'sale-1', status: 'PENDING', ...saleInput });

    const result = await service.createSale(saleInput);

    expect(mockRepository.create).toHaveBeenCalledWith({
      ...saleInput,
      status: SaleStatus.PENDING,
    });
    expect(result).toEqual({ id: 'sale-1', status: 'PENDING', ...saleInput });
  });

  it('retrieves a sale by id', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'sale-1', status: SaleStatus.PENDING });

    const result = await service.getSaleById('sale-1');

    expect(mockRepository.findById).toHaveBeenCalledWith('sale-1');
    expect(result).toEqual({ id: 'sale-1', status: SaleStatus.PENDING });
  });

  it('throws when sale is not found', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.getSaleById('sale-1')).rejects.toThrow('Sale with id sale-1 not found');
  });

  it('lists pending sales', async () => {
    mockRepository.findPending.mockResolvedValue([{ id: 'sale-1', status: SaleStatus.PENDING }]);

    const result = await service.listPendingSales();

    expect(mockRepository.findPending).toHaveBeenCalled();
    expect(result).toEqual([{ id: 'sale-1', status: SaleStatus.PENDING }]);
  });

  it('marks a pending sale as approved', async () => {
    const pendingSale = { id: 'sale-1', status: SaleStatus.PENDING };
    mockRepository.findById.mockResolvedValue(pendingSale);
    mockRepository.updateStatus.mockResolvedValue({ id: 'sale-1', status: SaleStatus.APPROVED });

    const result = await service.markApproved('sale-1');

    expect(mockRepository.findById).toHaveBeenCalledWith('sale-1');
    expect(mockRepository.updateStatus).toHaveBeenCalledWith('sale-1', SaleStatus.APPROVED);
    expect(result).toEqual({ id: 'sale-1', status: SaleStatus.APPROVED });
  });

  it('marks a pending sale as rejected', async () => {
    const pendingSale = { id: 'sale-1', status: SaleStatus.PENDING };
    mockRepository.findById.mockResolvedValue(pendingSale);
    mockRepository.updateStatus.mockResolvedValue({ id: 'sale-1', status: SaleStatus.REJECTED });

    const result = await service.markRejected('sale-1');

    expect(mockRepository.findById).toHaveBeenCalledWith('sale-1');
    expect(mockRepository.updateStatus).toHaveBeenCalledWith('sale-1', SaleStatus.REJECTED);
    expect(result).toEqual({ id: 'sale-1', status: SaleStatus.REJECTED });
  });

  it('throws when approving an already rejected sale', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'sale-1', status: SaleStatus.REJECTED });

    await expect(service.markApproved('sale-1')).rejects.toThrow(
      'Cannot transition sale from REJECTED to APPROVED'
    );
    expect(mockRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('throws when rejecting an already approved sale', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'sale-1', status: SaleStatus.APPROVED });

    await expect(service.markRejected('sale-1')).rejects.toThrow(
      'Cannot transition sale from APPROVED to REJECTED'
    );
    expect(mockRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('throws when creating a sale with invalid status', async () => {
    await expect(
      service.createSale({
        userId: 'user-1',
        totalEarnings: 100,
        currency: 'USD',
        status: 'INVALID',
      })
    ).rejects.toThrow('Invalid sale status: INVALID');
    expect(mockRepository.create).not.toHaveBeenCalled();
  });
});
