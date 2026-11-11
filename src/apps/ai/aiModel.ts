// データベース操作（ai_qa_logs）の受け皿
import { pool } from '../../../db'; // プロジェクト構成に応じたパスに調整してください

export interface AiLog {
  id: number;
  prompt: string;
  answer: string;
  created_at: string;
}

// 履歴一覧取得
export const getAiHistories = async (): Promise<AiLog[]> => {
  const result = await pool.query(
    'SELECT id, prompt, answer, created_at FROM ai_qa_logs ORDER BY created_at DESC'
  );
  return result.rows;
};

// 質問と回答をDBに保存する
export const saveAiLog = async (prompt: string, answer: string): Promise<AiLog> => {
  const result = await pool.query(
    'INSERT INTO ai_qa_logs (prompt, answer) VALUES ($1, $2) RETURNING id, prompt, answer, created_at',
    [prompt, answer]
  );
  return result.rows[0];
};