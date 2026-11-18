-- AI対話アプリ V2 専用テーブル定義
-- 対象: ai_v2_conversations（会話）, ai_v2_turns（往復履歴）

CREATE TABLE IF NOT EXISTS ai_v2_conversations (
  id SERIAL PRIMARY KEY,
  title VARCHAR(100) NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_v2_turns (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES ai_v2_conversations(id) ON DELETE CASCADE,
  user_message TEXT NOT NULL CHECK (char_length(trim(user_message)) BETWEEN 1 AND 1500),
  model_message TEXT NOT NULL CHECK (char_length(model_message) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_v2_turns_conv_id
  ON ai_v2_turns (conversation_id, id DESC);