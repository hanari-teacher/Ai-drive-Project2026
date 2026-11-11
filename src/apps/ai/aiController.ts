import { Request, Response, NextFunction } from 'express';
import { getAiHistories, saveAiLog } from './aiModel';
import { generateAiAnswer } from './aiService'; // ★実AIサービスに変更

// 履歴一覧取得
export const getHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const histories = await getAiHistories();
    res.status(200).json({
      success: true,
      data: histories,
    });
  } catch (error) {
    next(error);
  }
};

// 質問送信・実AI回答生成・DB保存
export const askAi = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { prompt } = req.body;

    // 1. 入力バリデーション（空文字チェック）: 不正な場合はAIを呼ばず即座に400を返す
    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROMPT',
          message: 'プロンプトを入力してください。',
        },
      });
      return;
    }

    // 2. 実AI (Gemini) による回答生成
    const answer = await generateAiAnswer(prompt.trim());

    // 3. データベースへの保存（アトミックな処理）
    const savedLog = await saveAiLog(prompt.trim(), answer);

    // 4. 応答返却
    res.status(200).json({
      success: true,
      data: savedLog,
    });
  } catch (error) {
    next(error);
  }
};