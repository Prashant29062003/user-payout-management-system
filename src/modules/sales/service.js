import * as saleRepository from './repository.js';
import { NotFoundError } from '../../shared/errors/index.js';

export async function createSale(attributes) {
  return saleRepository.createSale(attributes);
}

export async function getSaleById(saleId) {
  const sale = await saleRepository.getSaleById(saleId);
  if (!sale) {
    throw new NotFoundError(`Sale with id ${saleId} not found`);
  }
  return sale;
}

export async function updateSale(saleId, data) {
  const sale = await saleRepository.getSaleById(saleId);
  if (!sale) {
    throw new NotFoundError(`Sale with id ${saleId} not found`);
  }
  return saleRepository.updateSale(saleId, data);
}

export async function findSalesByUserId(userId) {
  return saleRepository.findSalesByUserId(userId);
}

export async function listPendingSales() {
  return saleRepository.listPendingSales();
}
