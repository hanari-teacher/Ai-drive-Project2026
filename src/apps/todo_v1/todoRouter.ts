import { Router } from 'express';
import { TodoController } from './todoController';

const router = Router();

router.get('/', TodoController.getTodos);
router.post('/', TodoController.createTodo);
router.patch('/:id', TodoController.updateTodo);
router.delete('/:id', TodoController.deleteTodo);

export default router;