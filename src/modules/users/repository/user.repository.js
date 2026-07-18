import { db } from '../../../config/db.js';

export class UserRepository {
  constructor(tx = db) {
    this.tx = tx;
  }

  async create(data) {
    return this.tx.user.create({ data });
  }

  async findById(id) {
    return this.tx.user.findUnique({ where: { id } });
  }

  async findByEmail(email) {
    return this.tx.user.findUnique({ where: { email } });
  }

  async update(id, data) {
    return this.tx.user.update({ where: { id }, data });
  }

  async delete(id) {
    return this.tx.user.delete({ where: { id } });
  }
}

export const userRepository = new UserRepository();
