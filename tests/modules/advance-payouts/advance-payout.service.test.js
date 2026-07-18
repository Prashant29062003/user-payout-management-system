import { AdvancePayoutService } from '../../../src/modules/advance-payouts/service/advance-payout.service.js';
import { AdvancePayoutStatus } from '../../../src/shared/constants/index.js';

describe('AdvancePayoutService', () => {
  const mockRepository = {
    create: jest.fn(),
    findById: jest.fn(),
    findBySaleId: jest.fn(),
    findSuccessfulBySaleId: jest.fn(),
    updateStatus: jest.fn(),
  };

  const service = new AdvancePayoutService(mockRepository);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an advance payout with default pending status', async () => {
    const payload = { saleId: 'sale-1', amount: 100, currency: 'USD' };
    mockRepository.findSuccessfulBySaleId.mockResolvedValue(null);
    mockRepository.create.mockResolvedValue({ id: 'advance-1', status: 'PENDING', ...payload });

    const result = await service.createAdvancePayout(payload);

    expect(mockRepository.findSuccessfulBySaleId).toHaveBeenCalledWith('sale-1');
    expect(mockRepository.create).toHaveBeenCalledWith({ ...payload, status: AdvancePayoutStatus.PENDING });
    expect(result).toEqual({ id: 'advance-1', status: 'PENDING', ...payload });
  });

  it('throws when a successful advance payout already exists', async () => {
    mockRepository.findSuccessfulBySaleId.mockResolvedValue({ id: 'advance-1', status: 'SUCCESS' });

    await expect(service.createAdvancePayout({ saleId: 'sale-1', amount: 100, currency: 'USD' })).rejects.toThrow(
      'A successful advance payout already exists for sale sale-1',
    );
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('throws when creating an advance payout with invalid status', async () => {
    mockRepository.findSuccessfulBySaleId.mockResolvedValue(null);

    await expect(
      service.createAdvancePayout({ saleId: 'sale-1', amount: 100, currency: 'USD', status: 'INVALID' }),
    ).rejects.toThrow('Invalid advance payout status: INVALID');
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it('retrieves an advance payout by id', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'advance-1', status: 'PENDING' });

    const result = await service.getAdvancePayoutById('advance-1');

    expect(mockRepository.findById).toHaveBeenCalledWith('advance-1');
    expect(result).toEqual({ id: 'advance-1', status: 'PENDING' });
  });

  it('throws when advance payout is not found', async () => {
    mockRepository.findById.mockResolvedValue(null);

    await expect(service.getAdvancePayoutById('advance-1')).rejects.toThrow('Advance payout with id advance-1 not found');
  });

  it('marks a payout processing from pending', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'advance-1', status: AdvancePayoutStatus.PENDING });
    mockRepository.updateStatus.mockResolvedValue({ id: 'advance-1', status: AdvancePayoutStatus.PROCESSING });

    const result = await service.markProcessing('advance-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('advance-1', AdvancePayoutStatus.PROCESSING);
    expect(result).toEqual({ id: 'advance-1', status: AdvancePayoutStatus.PROCESSING });
  });

  it('marks a payout succeeded from processing', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'advance-1', status: AdvancePayoutStatus.PROCESSING });
    mockRepository.updateStatus.mockResolvedValue({ id: 'advance-1', status: AdvancePayoutStatus.SUCCESS });

    const result = await service.markSucceeded('advance-1');

    expect(mockRepository.updateStatus).toHaveBeenCalledWith('advance-1', AdvancePayoutStatus.SUCCESS);
    expect(result).toEqual({ id: 'advance-1', status: AdvancePayoutStatus.SUCCESS });
  });

  it('throws when invalid status transition is attempted', async () => {
    mockRepository.findById.mockResolvedValue({ id: 'advance-1', status: AdvancePayoutStatus.SUCCESS });

    await expect(service.markProcessing('advance-1')).rejects.toThrow(
      'Cannot transition advance payout from SUCCESS to PROCESSING',
    );
    expect(mockRepository.updateStatus).not.toHaveBeenCalled();
  });

  it('returns eligibility for sale without existing successful payout', async () => {
    mockRepository.findSuccessfulBySaleId.mockResolvedValue(null);

    const result = await service.isEligibleForSale('sale-1');

    expect(result).toBe(true);
  });

  it('returns ineligible for sale with existing successful payout', async () => {
    mockRepository.findSuccessfulBySaleId.mockResolvedValue({ id: 'advance-1', status: 'SUCCESS' });

    const result = await service.isEligibleForSale('sale-1');

    expect(result).toBe(false);
  });
});
