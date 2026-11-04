import { Request, Response } from 'express';
import { TodoModel } from './todoModel';

export const TodoController = {
  async getTodos(req: Request, res: Response) {
    try {
      const todos = await TodoModel.findAll();
      return res.status(200).json({ success: true, data: todos });
    } catch (error) {
      console.error(error);
      return res.status(503).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to retrieve todos.' }
      });
    }
  },

  async createTodo(req: Request, res: Response) {
    try {
      const rawTitle = req.body?.title;
      if (typeof rawTitle !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Title must be a string.' }
        });
      }

      const title = rawTitle.trim();
      if (title.length < 1 || title.length > 100) {
        return res.status(422).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Title must be between 1 and 100 characters after trimming.' }
        });
      }

      const newTodo = await TodoModel.create(title);
      return res.status(201).json({ success: true, data: newTodo });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create todo.' }
      });
    }
  },

  async updateTodo(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id) || id < 1) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'ID must be an integer of 1 or greater.' }
        });
      }

      const { completed } = req.body;
      if (typeof completed !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'Completed must be a boolean.' }
        });
      }

      const updatedTodo = await TodoModel.updateStatus(id, completed);
      if (!updatedTodo) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Todo item not found.' }
        });
      }

      return res.status(200).json({ success: true, data: updatedTodo });
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to update todo.' }
      });
    }
  },

  async deleteTodo(req: Request, res: Response) {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id) || id < 1) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_ID', message: 'ID must be an integer of 1 or greater.' }
        });
      }

      const deleted = await TodoModel.delete(id);
      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Todo item not found.' }
        });
      }

      return res.status(204).send();
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to delete todo.' }
      });
    }
  }
};