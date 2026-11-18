import { pool } from '../../../../db';

export interface ConversationRow {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface TurnRow {
  id: number;
  conversationId: number;
  userMessage: string;
  modelMessage: string;
  createdAt: string;
}

// 会話一覧取得（更新日時降順・ID降順）
export async function findAllConversations(): Promise<ConversationRow[]> {
  const result = await pool.query<ConversationRow>(
    `SELECT
       id,
       title,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM ai_v2_conversations
     ORDER BY updated_at DESC, id DESC`
  );
  return result.rows;
}

// 新規会話作成
export async function createConversation(title: string): Promise<ConversationRow> {
  const result = await pool.query<ConversationRow>(
    `INSERT INTO ai_v2_conversations (title)
     VALUES ($1)
     RETURNING
       id,
       title,
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [title]
  );
  return result.rows[0];
}

// 指定IDの会話取得
export async function findConversationById(id: number): Promise<ConversationRow | null> {
  const result = await pool.query<ConversationRow>(
    `SELECT
       id,
       title,
       created_at AS "createdAt",
       updated_at AS "updatedAt"
     FROM ai_v2_conversations
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

// 往復履歴のページネーション取得（最新側から limit+1 件取得し、時系列順へ並べ替え）
export async function findTurnsByConversationId(
  conversationId: number,
  limit: number,
  offset: number
): Promise<{ turns: TurnRow[]; hasMore: boolean }> {
  const result = await pool.query<TurnRow>(
    `SELECT
       id,
       conversation_id AS "conversationId",
       user_message AS "userMessage",
       model_message AS "modelMessage",
       created_at AS "createdAt"
     FROM ai_v2_turns
     WHERE conversation_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [conversationId, limit + 1, offset]
  );

  const hasMore = result.rows.length > limit;
  const sliced = hasMore ? result.rows.slice(0, limit) : result.rows;

  // 画面表示・API返却用に古い順（id ASC）へ逆転
  return {
    turns: sliced.reverse(),
    hasMore,
  };
}

// AI送信文脈用の直近N往復取得（古い順で返却）
export async function findRecentTurnsForContext(
  conversationId: number,
  limit = 5
): Promise<Array<{ userMessage: string; modelMessage: string }>> {
  const result = await pool.query<{ userMessage: string; modelMessage: string }>(
    `SELECT
       user_message AS "userMessage",
       model_message AS "modelMessage"
     FROM ai_v2_turns
     WHERE conversation_id = $1
     ORDER BY id DESC
     LIMIT $2`,
    [conversationId, limit]
  );

  return result.rows.reverse();
}

// 1往復保存 ＆ 親会話の updated_at 更新
export async function createTurnAndTouchConversation(
  conversationId: number,
  userMessage: string,
  modelMessage: string
): Promise<TurnRow> {
  const insertResult = await pool.query<TurnRow>(
    `INSERT INTO ai_v2_turns (conversation_id, user_message, model_message)
     VALUES ($1, $2, $3)
     RETURNING
       id,
       conversation_id AS "conversationId",
       user_message AS "userMessage",
       model_message AS "modelMessage",
       created_at AS "createdAt"`,
    [conversationId, userMessage, modelMessage]
  );

  await pool.query(
    `UPDATE ai_v2_conversations
     SET updated_at = NOW()
     WHERE id = $1`,
    [conversationId]
  );

  return insertResult.rows[0];
}