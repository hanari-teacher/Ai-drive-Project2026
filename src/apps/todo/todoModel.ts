import { pool } from '../../../db'; // 既存のdb.tsのパスに合わせて調整してください

export interface Todo {
  id: number;
  title: string;
  completed: boolean;
  created_at: Date;
}

export const TodoModel = {
  // REQ-01: 一覧取得
  async findAll(): Promise<Todo[]> {
    const query = 'SELECT id, title, completed, created_at FROM todo_tasks ORDER BY id DESC;';
    const result = await pool.query(query);
    return result.rows;
  },

  // REQ-02: 登録
  async create(title: string): Promise<Todo> {
    const query = 'INSERT INTO todo_tasks (title) VALUES ($1) RETURNING id, title, completed, created_at;';
    const result = await pool.query(query, [title]);
    return result.rows[0];
  },

  // REQ-03: 完了状態の部分更新
  async updateCompleted(id: number, completed: boolean): Promise<Todo | null> {
    const query = 'UPDATE todo_tasks SET completed = $1 WHERE id = $2 RETURNING id, title, completed, created_at;';
    const result = await pool.query(query, [completed, id]);
    return result.rows.length > 0 ? result.rows[0] : null;
  },

  // REQ-04: 削除
  async delete(id: number): Promise<boolean> {
    const query = 'DELETE FROM todo_tasks WHERE id = $1 RETURNING id;';
    const result = await pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  },
};