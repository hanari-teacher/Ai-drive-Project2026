import { Router } from 'express';
import { TodoController } from './todoController';

const router = Router();

// 画面表示用ルート
router.get('/', (req, res) => {
  res.render('todo/index');
});

// REST APIルーティング (/api/v1/todos)
router.get('/api/v1/todos', TodoController.getAll);
router.post('/api/v1/todos', TodoController.create);
router.patch('/api/v1/todos/:id', TodoController.updateCompleted);
router.delete('/api/v1/todos/:id', TodoController.delete);

export default router;