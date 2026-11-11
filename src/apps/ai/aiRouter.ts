import { Router } from 'express';
import { getHistory } from './aiController';

const router = Router();

// GET /api/ai/history
router.get('/history', getHistory);

export default router;