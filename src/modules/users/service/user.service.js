import { userRepository } from '../repository/user.repository.js';
import { NotFoundError } from '../../shared/errors/index.js';

export class UserService {
  async createUser(attributes) {
    return userRepository.create(attributes);
  }

  async getUserById(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with id ${userId} not found`);
    }
    return user;
  }

  async getUserByEmail(email) {
    return userRepository.findByEmail(email);
  }

  async updateUser(userId, data) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with id ${userId} not found`);
    }
    return userRepository.update(userId, data);
  }

  async deleteUser(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with id ${userId} not found`);
    }
    return userRepository.delete(userId);
  }
}

export const userService = new UserService();
