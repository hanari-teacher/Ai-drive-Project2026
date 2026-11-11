-- AI質問・回答履歴テーブルの作成
CREATE TABLE IF NOT EXISTS ai_qa_logs (
    id SERIAL PRIMARY KEY,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 履歴一覧表示・取得のパフォーマンス向上のためのインデックス
CREATE INDEX IF NOT EXISTS idx_ai_qa_logs_created_at ON ai_qa_logs(created_at DESC);