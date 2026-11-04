import { pool } from '../../../db';

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  created_at: Date;
}

export const TodoModel = {
  async findAll(): Promise<Todo[]> {
    const result = await pool.query('SELECT * FROM todos ORDER BY id DESC');
    return result.rows;
  },

  async create(title: string): Promise<Todo> {
    const result = await pool.query(
      'INSERT INTO todos (title) VALUES ($1) RETURNING *',
      [title]
    );
    return result.rows[0];
  },

  async updateStatus(id: number, completed: boolean): Promise<Todo | null> {
    const result = await pool.query(
      'UPDATE todos SET completed = $1 WHERE id = $2 RETURNING *',
      [completed, id]
    );
    return result.rows[0] || null;
  },

  async delete(id: number): Promise<boolean> {
    const result = await pool.query('DELETE FROM todos WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
};