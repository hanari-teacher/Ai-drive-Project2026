import { GoogleGenAI } from '@google/genai';

// GoogleGenAIクライアントの初期化（自動的に process.env.GEMINI_API_KEY を参照します）
const ai = new GoogleGenAI();

export const generateAiAnswer = async (prompt: string): Promise<string> => {
  // 1. 待機期限（タイムアウト設定: 30秒）
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('AI API request timed out')), 30000)
  );

  // 2. モデル名（環境変数から取得、未設定時はフォールバック）
  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

  // 3. Gemini API 呼び出し
  const apiCall = ai.models.generateContent({
    model: modelName,
    contents: [prompt],
  });

  // タイムアウトとAPI呼び出しの競争
  const response = await Promise.race([apiCall, timeoutPromise]);

  if (!response.text) {
    throw new Error('AIから有効な応答テキストが返されませんでした。');
  }

  return response.text;
};