// src/apps/chat/chatService.ts
import {
  DEFAULT_ROOM_ID,
  DEFAULT_SESSION_TTL_SECONDS,
  MAX_ROOM_SESSIONS,
  acquireRoomSession,
  cleanupExpiredSessions,
  deleteRoomSession,
  insertChatMessage,
  isActiveRoomSession,
  releaseRoomSession,
  selectLatestMessagesAsc,
  touchRoomSession,
  type AcquireSessionResult,
  type ChatMessageRow,
} from './chatModel';

export const MAX_USERNAME_LENGTH = 50;
export const MAX_COMMENT_LENGTH = 500;

export class ChatValidationError extends Error {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ChatValidationError';
  }
}

export class ChatForbiddenError extends Error {
  public readonly code = 'FORBIDDEN';
  public readonly statusCode = 403;

  constructor(message: string) {
    super(message);
    this.name = 'ChatForbiddenError';
  }
}

export class ChatRoomFullError extends Error {
  public readonly code = 'ROOM_FULL';
  public readonly statusCode = 409;
  public readonly retryUrl = '/chat';

  constructor(message = '現在チャットルームは満席（最大5名）です。空きが出たあとに再試行してください。') {
    super(message);
    this.name = 'ChatRoomFullError';
  }
}

export interface ValidatedChatMessage {
  username: string;
  comment: string;
}

/**
 * ユーザー名とコメントを入力検証します。
 * - 文字列型であること
 * - 前後空白を除去したうえで空文字・空白のみでないこと
 * - ユーザー名は50文字以内、コメントは500文字以内であること
 */
export function validateChatMessageInput(
  rawUsername: unknown,
  rawComment: unknown
): ValidatedChatMessage {
  if (typeof rawUsername !== 'string' || typeof rawComment !== 'string') {
    throw new ChatValidationError('ユーザー名とコメントは文字列で入力してください。');
  }

  const username = rawUsername.trim();
  const comment = rawComment.trim();

  if (username.length === 0) {
    throw new ChatValidationError('ユーザー名を入力してください。');
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    throw new ChatValidationError(
      `ユーザー名は${MAX_USERNAME_LENGTH}文字以内で入力してください。`
    );
  }

  if (comment.length === 0) {
    throw new ChatValidationError('コメントを入力してください。');
  }
  if (comment.length > MAX_COMMENT_LENGTH) {
    throw new ChatValidationError(
      `コメントは${MAX_COMMENT_LENGTH}文字以内で入力してください。`
    );
  }

  return { username, comment };
}

function normalizeSessionId(sessionId: unknown): string {
  if (typeof sessionId !== 'string') {
    throw new ChatValidationError('セッション識別子が不正です。');
  }
  const trimmed = sessionId.trim();
  if (trimmed.length === 0 || trimmed.length > 128) {
    throw new ChatValidationError('セッション識別子が不正です。');
  }
  return trimmed;
}

/**
 * デフォルトルームへの入室を試みます。
 * 同一セッション（同一ブラウザの複数タブ）は1名として扱われ、新規セッションは最大5名まで入室できます。
 */
export async function joinDefaultRoom(
  rawSessionId: unknown,
  options?: { maxSessions?: number; ttlSeconds?: number }
): Promise<AcquireSessionResult> {
  const sessionId = normalizeSessionId(rawSessionId);
  return acquireRoomSession({
    sessionId,
    roomId: DEFAULT_ROOM_ID,
    maxSessions: options?.maxSessions ?? MAX_ROOM_SESSIONS,
    ttlSeconds: options?.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS,
  });
}

/**
 * 参加中セッションの生存時刻（last_seen_at）を更新し、期限切れ席も回収します。
 */
export async function heartbeatDefaultRoom(
  rawSessionId: unknown,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<boolean> {
  const sessionId = normalizeSessionId(rawSessionId);
  return touchRoomSession(sessionId, DEFAULT_ROOM_ID, ttlSeconds);
}

/**
 * セッションの接続を解放します。同一ブラウザの別タブが残っている場合は connection_count を減らすのみです。
 */
export async function leaveDefaultRoom(rawSessionId: unknown): Promise<void> {
  const sessionId = normalizeSessionId(rawSessionId);
  await releaseRoomSession(sessionId, DEFAULT_ROOM_ID);
}

/**
 * 期限切れセッションを明示的に回収します。
 */
export async function reclaimExpiredRoomSessions(
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<number> {
  return cleanupExpiredSessions(DEFAULT_ROOM_ID, ttlSeconds);
}

/**
 * ルーム参加資格を確認したうえで、デフォルトルームの最新20件（古い順）を取得します。
 */
export async function getLatestMessagesForMember(
  rawSessionId: unknown,
  ttlSeconds: number = DEFAULT_SESSION_TTL_SECONDS
): Promise<ChatMessageRow[]> {
  const sessionId = normalizeSessionId(rawSessionId);
  const allowed = await isActiveRoomSession(sessionId, DEFAULT_ROOM_ID, ttlSeconds);
  if (!allowed) {
    throw new ChatForbiddenError('チャットルームに参加していないため履歴を閲覧できません。');
  }
  return selectLatestMessagesAsc(DEFAULT_ROOM_ID);
}

/**
 * ルーム参加資格と入力内容を検証し、メッセージを DB に保存して返します。
 */
export async function postMessageToDefaultRoom(params: {
  sessionId: unknown;
  username: unknown;
  comment: unknown;
  ttlSeconds?: number;
}): Promise<ChatMessageRow> {
  const sessionId = normalizeSessionId(params.sessionId);
  const ttlSeconds = params.ttlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;

  const allowed = await isActiveRoomSession(sessionId, DEFAULT_ROOM_ID, ttlSeconds);
  if (!allowed) {
    throw new ChatForbiddenError('チャットルームに参加していないためメッセージを投稿できません。');
  }

  const validated = validateChatMessageInput(params.username, params.comment);
  return insertChatMessage({
    roomId: DEFAULT_ROOM_ID,
    username: validated.username,
    comment: validated.comment,
  });
}


// chatService.ts に追加する例
export async function deleteDefaultRoomSession(rawSessionId: unknown): Promise<boolean> {
  const sessionId = normalizeSessionId(rawSessionId);
  return deleteRoomSession(sessionId, DEFAULT_ROOM_ID);
}