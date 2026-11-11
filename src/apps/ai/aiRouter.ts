import { Router } from 'express';
import { getHistory, askAi } from './aiController';
import { checkAiEnabled } from './aiMiddleware'; // ★インポート

const router = Router();

// 履歴取得はメンテナンス中でも許可
router.get('/history', getHistory);

// 質問送信にはデモ停止ミドルウェアを適用
router.post('/ask', checkAiEnabled, askAi);

export default router;