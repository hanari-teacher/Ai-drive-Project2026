// データベース操作（ai_qa_logs）の受け皿
import { pool } from '../../../db'; // プロジェクト構成に応じたパスに調整してください

export interface AiLog {
  id: number;
  prompt: string;
  answer: string;
  created_at: string;
}

// データベースから履歴を作成日時の降順で取得する
export const getAiHistories = async (): Promise<AiLog[]> => {
  const result = await pool.query(
    'SELECT id, prompt, answer, created_at FROM ai_qa_logs ORDER BY created_at DESC'
  );
  return result.rows;
};