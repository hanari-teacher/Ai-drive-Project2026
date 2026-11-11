import { Request, Response, NextFunction } from 'express';
import { getAiHistories } from './aiModel';

// 履歴一覧取得コントローラー
export const getHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const histories = await getAiHistories();
    res.status(200).json({
      success: true,
      data: histories,
    });
  } catch (error) {
    next(error); // エラー発生時はグローバルエラーハンドラーへ渡す
  }
};