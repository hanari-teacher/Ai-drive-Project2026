// src/apps/chat/chatModel.ts
import { pool } from '../../../db'; // リポジトリの配置に合わせてパスを確認してください

export const DEFAULT_ROOM_ID = 'default';
export const MAX_ROOM_SESSIONS = 5;
export const DEFAULT_SESSION_TTL_SECONDS = 60;

export interface ChatMessageRow {
  id: number;
  room_id: string;
  username: string;
  comment: string;
  created_at: string;
}

export interface ChatRoomSessionRow {
  session_id: string;
  room_id: string;
  connection_count: number;
  last_seen_at: string;
  joined_at: string;
}

export type AcquireSessionResult =
  | { status: 'acquired'; session: ChatRoomSessionRow; activeCount: number }
  | { status: 'full'; activeCount: number };

/**
 * チャットメッセージを保存し、保存された行を返します。
 */
export async function insertChatMessage(params: {
  username: string;
  comment: string;
  roomId?: string;
}): Promise<ChatMessageRow> {
  const roomId = params.roomId ?? DEFAULT_ROOM_ID;
  const result = await pool.query<ChatMessageRow>(
    `INSERT INTO chat_messages (room_id, username, comment)
     VALUES ($1, $2, $3)
     RETURNING id, room_id, username, comment, created_at`,
    [roomId, params.username, params.comment]
  );
  return result.rows[0];
}

/**
 * 指定ルームの最新20件を抽出し、古い順（id 昇順）で返します。
 */
export async function selectLatestMessagesAsc(
  roomId: string = DEFAULT_ROOM_ID
): Promise<ChatMessageRow[]> {
  const result = await pool.query<ChatMessageRow>(
    `SELECT id, room_id, username, comment, created_at
     FROM (
       SELECT id, room_id, username, comment, created_at
       FROM chat_messages
       WHERE room_id = $1
       ORDER BY id DESC
       LIMIT 20
     ) AS latest_messages
     ORDER BY id ASC`,
    [roomId]
  );
  return result.rows;
}

/**
 * 期限切れ（last_seen_at が ttlSeconds 以上前）のセッションを削除し、席を回収します。
 */
export async function cleanupExpiredSessions(
  roomId: string = DEFAULT_ROOM_ID,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<number> {
  const result = await pool.query(
    `DELETE FROM chat_room_sessions
     WHERE room_id = $1
       AND last_seen_at < NOW() - ($2 * INTERVAL '1 second')`,
    [roomId, ttlSeconds]
  );
  return result.rowCount ?? 0;
}

/**
 * 現在のアクティブ参加セッション数を返します（期限切れを除外）。
 */
export async function countActiveSessions(
  roomId: string = DEFAULT_ROOM_ID,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM chat_room_sessions
     WHERE room_id = $1
       AND last_seen_at >= NOW() - ($2 * INTERVAL '1 second')`,
    [roomId, ttlSeconds]
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * セッション単位でルームの席を確保します。
 * - 同一 session_id が既にアクティブな場合（同一ブラウザの複数タブ等）は connection_count を増やし1名として扱います。
 * - 新規 session_id の場合は、アクティブセッション数が MAX_ROOM_SESSIONS（5）未満のときのみ追加します。
 */
export async function acquireRoomSession(params: {
  sessionId: string;
  roomId?: string;
  maxSessions?: number;
  ttlSeconds?: number;
}): Promise<AcquireSessionResult> {
  const roomId = params.roomId ?? DEFAULT_ROOM_ID;
  const maxSessions = params.maxSessions ?? MAX_ROOM_SESSIONS;
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ルーム単位でロックを取り、同時入室による定員超過レースコンディションを防ぐ
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1))`,
      [`chat_room_lock:${roomId}`]
    );

    // 期限切れセッションを先に回収
    await client.query(
      `DELETE FROM chat_room_sessions
       WHERE room_id = $1
         AND last_seen_at < NOW() - ($2 * INTERVAL '1 second')`,
      [roomId, ttlSeconds]
    );

    // 同一セッションが既に存在するか確認（同一ブラウザの別タブ＝同一セッション）
    const existingRes = await client.query<ChatRoomSessionRow>(
      `UPDATE chat_room_sessions
       SET connection_count = connection_count + 1,
           last_seen_at = NOW()
       WHERE session_id = $1
         AND room_id = $2
       RETURNING session_id, room_id, connection_count, last_seen_at, joined_at`,
      [params.sessionId, roomId]
    );

    if (existingRes.rows[0]) {
      const countRes = await client.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count
         FROM chat_room_sessions
         WHERE room_id = $1`,
        [roomId]
      );
      await client.query('COMMIT');
      return {
        status: 'acquired',
        session: existingRes.rows[0],
        activeCount: Number(countRes.rows[0]?.count ?? 1),
      };
    }

    // 新規セッションの場合、現在のセッション数を確認
    const countRes = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM chat_room_sessions
       WHERE room_id = $1`,
      [roomId]
    );
    const currentCount = Number(countRes.rows[0]?.count ?? 0);

    if (currentCount >= maxSessions) {
      await client.query('COMMIT');
      return {
        status: 'full',
        activeCount: currentCount,
      };
    }

    const insertedRes = await client.query<ChatRoomSessionRow>(
      `INSERT INTO chat_room_sessions (session_id, room_id, connection_count, last_seen_at, joined_at)
       VALUES ($1, $2, 1, NOW(), NOW())
       RETURNING session_id, room_id, connection_count, last_seen_at, joined_at`,
      [params.sessionId, roomId]
    );

    await client.query('COMMIT');
    return {
      status: 'acquired',
      session: insertedRes.rows[0],
      activeCount: currentCount + 1,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 参加中セッションの生存時刻（last_seen_at）を更新します。
 * 対象セッションが存在しない場合は false を返します。
 */
export async function touchRoomSession(
  sessionId: string,
  roomId: string = DEFAULT_ROOM_ID,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<boolean> {
  await cleanupExpiredSessions(roomId, ttlSeconds);
  const result = await pool.query(
    `UPDATE chat_room_sessions
     SET last_seen_at = NOW()
     WHERE session_id = $1
       AND room_id = $2`,
    [sessionId, roomId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * セッションの接続カウントを減らし、0 以下になったらレコードを削除して席を解放します。
 */
export async function releaseRoomSession(
  sessionId: string,
  roomId: string = DEFAULT_ROOM_ID
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const updated = await client.query<{ connection_count: number }>(
      `UPDATE chat_room_sessions
       SET connection_count = GREATEST(connection_count - 1, 0),
           last_seen_at = NOW()
       WHERE session_id = $1
         AND room_id = $2
       RETURNING connection_count`,
      [sessionId, roomId]
    );

    if (updated.rows[0] && updated.rows[0].connection_count <= 0) {
      await client.query(
        `DELETE FROM chat_room_sessions
         WHERE session_id = $1
           AND room_id = $2`,
        [sessionId, roomId]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * 指定セッションが現在アクティブなルーム参加中かを確認します。
 */
export async function isActiveRoomSession(
  sessionId: string,
  roomId: string = DEFAULT_ROOM_ID,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<boolean> {
  await cleanupExpiredSessions(roomId, ttlSeconds);
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM chat_room_sessions
       WHERE session_id = $1
         AND room_id = $2
         AND last_seen_at >= NOW() - ($3 * INTERVAL '1 second')
     ) AS exists`,
    [sessionId, roomId, ttlSeconds]
  );
  return Boolean(result.rows[0]?.exists);
}