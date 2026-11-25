import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_ROOM_ID, type ChatMessageRow } from './chatModel';
import {
  ChatForbiddenError,
  ChatRoomFullError,
  ChatValidationError,
  getLatestMessagesForMember,
  heartbeatDefaultRoom,
  joinDefaultRoom,
  leaveDefaultRoom,
  postMessageToDefaultRoom,
} from './chatService';

const CHAT_SESSION_COOKIE_NAME = 'chat_sid';

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;

  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

function getOrCreateChatSessionId(req: Request, res: Response): string {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[CHAT_SESSION_COOKIE_NAME];
  if (existing && /^[a-zA-Z0-9_-]{16,128}$/.test(existing)) {
    return existing;
  }

  const created = crypto.randomBytes(24).toString('hex');
  const secureAttr = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${CHAT_SESSION_COOKIE_NAME}=${encodeURIComponent(created)}; HttpOnly; SameSite=Lax; Path=/${secureAttr}`
  );
  return created;
}

function getExistingChatSessionId(req: Request): string | undefined {
  const cookies = parseCookies(req.headers.cookie);
  const existing = cookies[CHAT_SESSION_COOKIE_NAME];
  if (existing && /^[a-zA-Z0-9_-]{16,128}$/.test(existing)) {
    return existing;
  }
  return undefined;
}

function handleKnownChatError(err: unknown, res: Response, next: NextFunction): boolean {
  if (err instanceof ChatValidationError) {
    res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      message: err.message,
    });
    return true;
  }

  if (err instanceof ChatForbiddenError) {
    res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      message: err.message,
    });
    return true;
  }

  if (err instanceof ChatRoomFullError) {
    res.status(err.statusCode).json({
      ok: false,
      code: err.code,
      message: err.message,
      retryUrl: err.retryUrl,
    });
    return true;
  }

  next(err);
  return false;
}

/**
 * GET /chat
 * デフォルトルームのチャット画面を表示します。満席時は満席案内と /chat リンクを表示します。
 */
export async function renderChatPage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = getOrCreateChatSessionId(req, res);
    const joinResult = await joinDefaultRoom(sessionId);

    if (joinResult.status === 'full') {
      const fullError = new ChatRoomFullError();
      res.status(200).render('chat/index', {
        pageTitle: 'リアルタイムチャット - 満席案内',
        roomId: DEFAULT_ROOM_ID,
        isFull: true,
        fullMessage: fullError.message,
        retryUrl: fullError.retryUrl,
        initialMessages: [] as ChatMessageRow[],
        maxUsernameLength: 50,
        maxCommentLength: 500,
      });
      return;
    }

    const messages = await getLatestMessagesForMember(sessionId);
    res.status(200).render('chat/index', {
      pageTitle: 'リアルタイムチャット',
      roomId: DEFAULT_ROOM_ID,
      isFull: false,
      fullMessage: '',
      retryUrl: '/chat',
      initialMessages: messages,
      maxUsernameLength: 50,
      maxCommentLength: 500,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/chat/join
 */
export async function handleJoinRoom(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = getOrCreateChatSessionId(req, res);
    const result = await joinDefaultRoom(sessionId);

    if (result.status === 'full') {
      const fullError = new ChatRoomFullError();
      res.status(fullError.statusCode).json({
        ok: false,
        code: fullError.code,
        message: fullError.message,
        retryUrl: fullError.retryUrl,
        activeCount: result.activeCount,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      roomId: DEFAULT_ROOM_ID,
      activeCount: result.activeCount,
    });
  } catch (err) {
    handleKnownChatError(err, res, next);
  }
}

/**
 * POST /api/chat/leave
 */
export async function handleLeaveRoom(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = getExistingChatSessionId(req);
    if (sessionId) {
      await leaveDefaultRoom(sessionId);
    }
    res.status(200).json({
      ok: true,
      roomId: DEFAULT_ROOM_ID,
    });
  } catch (err) {
    handleKnownChatError(err, res, next);
  }
}

/**
 * POST /api/chat/heartbeat
 */
export async function handleHeartbeat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = getExistingChatSessionId(req);
    if (!sessionId) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN',
        message: 'チャットルームに参加していません。',
      });
      return;
    }

    const active = await heartbeatDefaultRoom(sessionId);
    if (!active) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN',
        message: '参加セッションが無効または期限切れです。',
      });
      return;
    }

    res.status(200).json({
      ok: true,
      roomId: DEFAULT_ROOM_ID,
    });
  } catch (err) {
    handleKnownChatError(err, res, next);
  }
}

/**
 * GET /api/chat/messages
 */
export async function handleGetMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = getExistingChatSessionId(req);
    if (!sessionId) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN',
        message: 'チャットルームに参加していないため履歴を閲覧できません。',
      });
      return;
    }

    const messages = await getLatestMessagesForMember(sessionId);
    res.status(200).json({
      ok: true,
      roomId: DEFAULT_ROOM_ID,
      messages,
    });
  } catch (err) {
    handleKnownChatError(err, res, next);
  }
}

/**
 * POST /api/chat/messages
 */
export async function handleCreateMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const sessionId = getExistingChatSessionId(req);
    if (!sessionId) {
      res.status(403).json({
        ok: false,
        code: 'FORBIDDEN',
        message: 'チャットルームに参加していないためメッセージを投稿できません。',
      });
      return;
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const saved = await postMessageToDefaultRoom({
      sessionId,
      username: (body as Record<string, unknown>).username,
      comment: (body as Record<string, unknown>).comment,
    });

    const io = req.app.get('io');
    if (io && typeof io.to === 'function') {
      io.to(`chat:${DEFAULT_ROOM_ID}`).emit('chat:message:new', saved);
    }

    res.status(201).json({
      ok: true,
      message: saved,
    });
  } catch (err) {
    handleKnownChatError(err, res, next);
  }
}