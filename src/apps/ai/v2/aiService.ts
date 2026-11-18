import { GoogleGenAI } from '@google/genai';
import {
  ConversationRow,
  TurnRow,
  createConversation,
  createTurnAndTouchConversation,
  findAllConversations,
  findConversationById,
  findRecentTurnsForContext,
  findTurnsByConversationId,
} from './aiRepository';

export class AiV2HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AiV2HttpError';
  }
}

export function isAiDisabled(): boolean {
  return process.env.AI_DISABLED === 'true' || process.env.AI_MAINTENANCE === 'true';
}

function parsePositiveInt(raw: unknown, fieldName: string): number {
  const num = Number(raw);
  if (!Number.isInteger(num) || num <= 0) {
    throw new AiV2HttpError(400, `${fieldName} は正の整数で指定してください。`);
  }
  return num;
}

// ① 会話一覧と公開状態取得
export async function listConversations(): Promise<{
  aiDisabled: boolean;
  conversations: ConversationRow[];
}> {
  const conversations = await findAllConversations();
  return {
    aiDisabled: isAiDisabled(),
    conversations,
  };
}

// ② 新規会話作成
export async function startConversation(rawTitle: unknown): Promise<ConversationRow> {
  if (typeof rawTitle !== 'string') {
    throw new AiV2HttpError(400, 'タイトルを入力してください。');
  }

  const title = rawTitle.trim();
  if (title.length < 1 || title.length > 100) {
    throw new AiV2HttpError(400, 'タイトルは1文字以上100文字以内で入力してください。');
  }

  return createConversation(title);
}

// ③ 会話の往復履歴取得
export async function getConversationTurns(
  rawId: unknown,
  rawLimit?: unknown,
  rawOffset?: unknown
): Promise<{
  conversation: { id: number; title: string };
  turns: TurnRow[];
  hasMore: boolean;
}> {
  const conversationId = parsePositiveInt(rawId, '会話ID');

  const limit = rawLimit !== undefined ? parsePositiveInt(rawLimit, 'limit') : 20;
  if (limit > 100) {
    throw new AiV2HttpError(400, 'limit は100以下で指定してください。');
  }

  const offset = rawOffset !== undefined ? Number(rawOffset) : 0;
  if (!Number.isInteger(offset) || offset < 0) {
    throw new AiV2HttpError(400, 'offset は0以上の整数で指定してください。');
  }

  const conversation = await findConversationById(conversationId);
  if (!conversation) {
    throw new AiV2HttpError(404, '指定された会話が見つかりません。');
  }

  const { turns, hasMore } = await findTurnsByConversationId(conversationId, limit, offset);

  return {
    conversation: {
      id: conversation.id,
      title: conversation.title,
    },
    turns,
    hasMore,
  };
}

// ④ 質問送信・文脈付きAI応答生成・1往復保存（DES-V2-04 Step 1〜5）
export async function sendTurnMessage(rawId: unknown, rawPrompt: unknown): Promise<TurnRow> {
  // Step 1: 入力バリデーション ＆ 会話存在確認
  const conversationId = parsePositiveInt(rawId, '会話ID');

  if (typeof rawPrompt !== 'string') {
    throw new AiV2HttpError(400, '質問文を入力してください。');
  }
  const prompt = rawPrompt.trim();
  if (prompt.length < 1 || prompt.length > 1500) {
    throw new AiV2HttpError(400, '質問文は1文字以上1,500文字以内で入力してください。');
  }

  const conversation = await findConversationById(conversationId);
  if (!conversation) {
    throw new AiV2HttpError(404, '指定された会話が見つかりません。');
  }

  // Step 2: 同一会話の直近5往復履歴を取得（古い順）
  const recentTurns = await findRecentTurnsForContext(conversationId, 5);

  // Step 3: Gemini送信ペイロード(contents)組立
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of recentTurns) {
    contents.push({ role: 'user', parts: [{ text: turn.userMessage }] });
    contents.push({ role: 'model', parts: [{ text: turn.modelMessage }] });
  }
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  // Step 4: Gemini API呼び出し（失敗時はStep 5へ進まず中断）
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiV2HttpError(503, 'GEMINI_API_KEY が設定されていません。');
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
  let answerText = '';

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
    });
    answerText = (response.text ?? '').trim();
  } catch (error) {
    console.error('[AI V2] Gemini API 呼び出しエラー:', error);
    throw new AiV2HttpError(502, 'AIからの応答取得に失敗しました。時間をおいて再送信してください。');
  }

  if (!answerText) {
    console.error('[AI V2] Gemini API から空の応答が返却されました');
    throw new AiV2HttpError(502, 'AIからの応答が空でした。時間をおいて再送信してください。');
  }

  // Step 5: 1往復のDB保存 ＆ 会話updated_at更新
  try {
    return await createTurnAndTouchConversation(conversationId, prompt, answerText);
  } catch (error) {
    console.error('[AI V2] DB保存エラー:', error);
    throw new AiV2HttpError(500, '会話データの保存に失敗しました。');
  }
}