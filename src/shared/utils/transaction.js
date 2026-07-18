import { db } from '../../config/db.js';

export async function withTransaction(work) {
  return db.$transaction(async (tx) => work(tx));
}
