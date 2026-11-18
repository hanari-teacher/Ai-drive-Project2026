import { Router, Request, Response, NextFunction } from 'express';
import {
  AiV2HttpError,
  getConversationTurns,
  isAiDisabled,
  listConversations,
  sendTurnMessage,
  startConversation,
} from './aiService';

const router = Router();

// 公開停止（キルスイッチ）判定ミドルウェア（新規投稿系APIに適用）
const guardAiEnabled = (_req: Request, res: Response, next: NextFunction): void => {
  if (isAiDisabled()) {
    res.status(503).json({
      error: '現在、AI対話アプリの新規投稿は停止されています。',
      aiDisabled: true,
    });
    return;
  }
  next();
};

// V2用エラーハンドリングヘルパー
function handleRouteError(res: Response, error: unknown): void {
  if (error instanceof AiV2HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  console.error('[AI V2] 予期しないエラー:', error);
  res.status(500).json({ error: 'サーバー内部エラーが発生しました。' });
}

// 1. 会話一覧・公開状態取得（停止中も許可）
router.get('/conversations', async (_req: Request, res: Response) => {
  try {
    const result = await listConversations();
    res.status(200).json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

// 2. 新規会話作成（停止中は503で拒否）
router.post('/conversations', guardAiEnabled, async (req: Request, res: Response) => {
  try {
    const conversation = await startConversation(req.body?.title);
    res.status(201).json({ conversation });
  } catch (error) {
    handleRouteError(res, error);
  }
});

// 3. 会話の往復履歴取得（停止中も許可）
router.get('/conversations/:id/turns', async (req: Request, res: Response) => {
  try {
    const result = await getConversationTurns(
      req.params.id,
      req.query.limit,
      req.query.offset
    );
    res.status(200).json(result);
  } catch (error) {
    handleRouteError(res, error);
  }
});

// 4. 質問送信・AI応答生成・1往復保存（停止中は503で拒否）
router.post('/conversations/:id/turns', guardAiEnabled, async (req: Request, res: Response) => {
  try {
    const turn = await sendTurnMessage(req.params.id, req.body?.prompt);
    res.status(201).json({ turn });
  } catch (error) {
    handleRouteError(res, error);
  }
});

export default router;