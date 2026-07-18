import { UserRepository } from '../../src/modules/users/repository/user.repository.js';

describe('UserRepository', () => {
  const tx = {
    user: {
      create: jest.fn().mockResolvedValue({ id: 'user-1', email: 'a@example.com' }),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'user-1', name: 'Updated' }),
      delete: jest.fn().mockResolvedValue({ id: 'user-1' }),
    },
  };

  const repo = new UserRepository(tx);

  beforeEach(() => {
    tx.user.create.mockClear();
    tx.user.findUnique.mockClear();
    tx.user.update.mockClear();
    tx.user.delete.mockClear();
  });

  it('creates a user', async () => {
    const data = { email: 'a@example.com', name: 'Alice' };
    const result = await repo.create(data);

    expect(tx.user.create).toHaveBeenCalledWith({ data });
    expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
  });

  it('finds a user by id', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@example.com' });

    const result = await repo.findById('user-1');

    expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
  });

  it('finds a user by email', async () => {
    tx.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'a@example.com' });

    const result = await repo.findByEmail('a@example.com');

    expect(tx.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@example.com' } });
    expect(result).toEqual({ id: 'user-1', email: 'a@example.com' });
  });

  it('updates a user', async () => {
    const data = { name: 'Updated' };
    const result = await repo.update('user-1', data);

    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data });
    expect(result).toEqual({ id: 'user-1', name: 'Updated' });
  });

  it('deletes a user', async () => {
    const result = await repo.delete('user-1');

    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'user-1' } });
    expect(result).toEqual({ id: 'user-1' });
  });
});
