import { Request, Response, NextFunction } from 'express';

// デモ制御（公開停止チェック）などのミドルウェア用
export const checkAiEnabled = (req: Request, res: Response, next: NextFunction) => {
  // 後続のステップで公開停止フラグのチェック処理を記述します
  next();
};