import * as userRepository from './repository.js';
import { NotFoundError } from '../../shared/errors/index.js';

export async function createUser(attributes) {
  return userRepository.createUser(attributes);
}

export async function getUserById(userId) {
  const user = await userRepository.getUserById(userId);
  if (!user) {
    throw new NotFoundError(`User with id ${userId} not found`);
  }
  return user;
}

export async function getUserByEmail(email) {
  return userRepository.getUserByEmail(email);
}

export async function updateUser(userId, data) {
  const user = await userRepository.getUserById(userId);
  if (!user) {
    throw new NotFoundError(`User with id ${userId} not found`);
  }
  return userRepository.updateUser(userId, data);
}

export async function deleteUser(userId) {
  const user = await userRepository.getUserById(userId);
  if (!user) {
    throw new NotFoundError(`User with id ${userId} not found`);
  }
  return userRepository.deleteUser(userId);
}
