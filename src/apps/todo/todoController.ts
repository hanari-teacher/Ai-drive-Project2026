import { Request, Response } from 'express';
import { TodoModel } from './todoModel';

export const TodoController = {
  // REQ-01: 一覧取得
  async getAll(req: Request, res: Response) {
    try {
      const todos = await TodoModel.findAll();
      return res.status(200).json({ data: todos });
    } catch (error) {
      console.error('Failed to fetch todos:', error);
      return res.status(500).json({
        error: { code: 500, message: 'Internal Server Error' }
      });
    }
  },

  // REQ-02: 登録
  async create(req: Request, res: Response) {
    try {
      const { title } = req.body;

      // バリデーション: titleの存在チェックおよび型チェック
      if (typeof title !== 'string') {
        return res.status(422).json({
          error: { code: 422, message: 'Title must be a string' }
        });
      }

      const trimmedTitle = title.trim();
      // 1文字以上100文字以内
      if (trimmedTitle.length < 1 || trimmedTitle.length > 100) {
        return res.status(422).json({
          error: { code: 422, message: 'Title must be between 1 and 100 characters' }
        });
      }

      const newTodo = await TodoModel.create(trimmedTitle);
      return res.status(201).json(newTodo);
    } catch (error) {
      console.error('Failed to create todo:', error);
      return res.status(500).json({
        error: { code: 500, message: 'Internal Server Error' }
      });
    }
  },

  // REQ-03: 完了状態の部分更新
  async updateCompleted(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id < 1) {
        return res.status(400).json({
          error: { code: 400, message: 'Invalid ID format' }
        });
      }

      const { completed } = req.body;
      if (typeof completed !== 'boolean') {
        return res.status(422).json({
          error: { code: 422, message: 'Completed must be a boolean' }
        });
      }

      const updatedTodo = await TodoModel.updateCompleted(id, completed);
      if (!updatedTodo) {
        return res.status(404).json({
          error: { code: 404, message: 'Todo not found' }
        });
      }

      return res.status(200).json(updatedTodo);
    } catch (error) {
      console.error('Failed to update todo:', error);
      return res.status(500).json({
        error: { code: 500, message: 'Internal Server Error' }
      });
    }
  },

  // REQ-04: 削除
  async delete(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id) || id < 1) {
        return res.status(400).json({
          error: { code: 400, message: 'Invalid ID format' }
        });
      }

      const deleted = await TodoModel.delete(id);
      if (!deleted) {
        return res.status(404).json({
          error: { code: 404, message: 'Todo not found' }
        });
      }

      return res.status(204).send();
    } catch (error) {
      console.error('Failed to delete todo:', error);
      return res.status(500).json({
        error: { code: 500, message: 'Internal Server Error' }
      });
    }
  },
};