-- sql/chat/040_create_chat_messages.sql
-- リアルタイムチャット用テーブル定義（Neon / PostgreSQL）

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL DEFAULT 'default',
  username VARCHAR(50) NOT NULL CHECK (char_length(btrim(username)) BETWEEN 1 AND 50),
  comment VARCHAR(500) NOT NULL CHECK (char_length(btrim(comment)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id_id
  ON chat_messages (room_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_room_sessions (
  session_id VARCHAR(128) PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL DEFAULT 'default',
  connection_count INTEGER NOT NULL DEFAULT 1 CHECK (connection_count >= 0),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_room_sessions_room_seen
  ON chat_room_sessions (room_id, last_seen_at);