import { db } from '../../config/db.js';

export async function createUser(data, tx = db) {
  return tx.user.create({ data });
}

export async function getUserById(userId, tx = db) {
  return tx.user.findUnique({ where: { id: userId } });
}

export async function getUserByEmail(email, tx = db) {
  return tx.user.findUnique({ where: { email } });
}

export async function updateUser(userId, data, tx = db) {
  return tx.user.update({ where: { id: userId }, data });
}

export async function deleteUser(userId, tx = db) {
  return tx.user.delete({ where: { id: userId } });
}
