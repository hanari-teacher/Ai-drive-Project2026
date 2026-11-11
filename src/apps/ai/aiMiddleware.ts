import { Request, Response, NextFunction } from 'express';

// AI機能の公開停止（デモ制御・メンテナンス）をチェックするミドルウェア
export const checkAiEnabled = (req: Request, res: Response, next: NextFunction) => {
  const isAiDisabled = process.env.AI_DISABLED === 'true' || process.env.AI_MAINTENANCE === 'true';

  if (isAiDisabled) {
    res.status(503).json({
      success: false,
      error: {
        code: 'AI_SERVICE_MAINTENANCE',
        message: '現在AI機能は一時的に停止（またはメンテナンス中）です。',
      },
    });
    return;
  }

  next();
};