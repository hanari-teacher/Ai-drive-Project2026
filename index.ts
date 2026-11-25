import http from 'http';
import express, { Request, Response } from 'express';
import path from 'path';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { pool } from './db'; // DB設定を読み込み

//TODOアプリ
import todoRouter from './src/apps/todo/todoRouter';
//TODO_v1 アプリ
import todoRouter_v1 from './src/apps/todo_v1/todoRouter';
//ai
import aiRouter from './src/apps/ai/aiRouter'; 
import aiV2Router from './src/apps/ai/v2/aiRouter';

import chatRouter from './src/apps/chat/chatRouter';
import { DEFAULT_ROOM_ID, isActiveRoomSession } from './src/apps/chat/chatModel';
import {
  ChatForbiddenError,
  ChatRoomFullError,
  ChatValidationError,
  getLatestMessagesForMember,
  joinDefaultRoom,
  leaveDefaultRoom,
  postMessageToDefaultRoom,
} from './src/apps/chat/chatService';

type AckCallback<T = Record<string, unknown>> = ((response: T) => void) | undefined;

const app = express(); // Expressアプリケーションを作成
const port: number = 3000; // ローカルで使用するポート番号

const CHAT_SOCKET_ROOM = `chat:${DEFAULT_ROOM_ID}`;
const CHAT_SESSION_COOKIE_NAME = 'chat_sid';

function extractChatSessionIdFromHeader(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const rawVal = part.slice(idx + 1).trim();
    if (key === CHAT_SESSION_COOKIE_NAME) {
      try {
        const decoded = decodeURIComponent(rawVal);
        if (/^[a-zA-Z0-9_-]{16,128}$/.test(decoded)) {
          return decoded;
        }
      } catch {
        if (/^[a-zA-Z0-9_-]{16,128}$/.test(rawVal)) {
          return rawVal;
        }
      }
    }
  }
  return undefined;
}


// ------------------------------
// Expressの基本設定
// ------------------------------
app.use(express.json()); // 💡 JSONボディを受け取れるようにする（これが必要です！）
app.use(express.urlencoded({ extended: true })); // フォームから送信されたデータを受け取れるようにする
app.use(express.static(path.join(process.cwd(), 'public'))); // CSSや画像などの静的ファイルを公開する
app.set('view engine', 'ejs'); // テンプレートエンジンにEJSを設定
app.set('views', path.join(process.cwd(), 'views')); // EJSファイルを保存するフォルダーを指定

// ------------------------------
// ルーティング
// ------------------------------


// 「/」にアクセスされたときの処理
app.get('/', (req: Request, res: Response): void => {
  res.send('テスト！ AIチャット作成');
});




app.get('/api/db-check', async (_req, res) => {
  try {
    const result = await pool.query('SELECT 1 AS connection_test');
    res.json({
      status: 'ok',
      database: result.rows[0].connection_test === 1 ? 'connected' : 'error',
    });
  } catch (error) {
    console.error('DB接続確認に失敗しました', error);
    res.status(503).json({ status: 'error', database: 'unavailable' });
  }
});


type Product = { id: number; name: string; price: number };

// 商品一覧表示
app.get('/db-sample', async (_req, res) => {
  try {
    const result = await pool.query<Product>(
      'SELECT id, name, price FROM products ORDER BY id'
    );
    res.render('db-sample', { products: result.rows });
  } catch (error) {
    console.error('商品一覧の取得に失敗しました', error);
    res.status(503).send('商品一覧を表示できません');
  }
});

// ------------------------------
// 新規登録機能の追加
// ------------------------------

// 1. 新規登録フォーム画面の表示
app.get('/db-sample/new', (_req, res) => {
  res.render('db-new.ejs');
});

// 2. 新規登録データの受け取りとデータベースへの保存
app.post('/db-sample', async (req, res) => {
  const { name, price } = req.body;
  try {
    // 1. 現在の最大のidを取得し、次のID（最大値 + 1）を計算する
    const maxIdResult = await pool.query('SELECT MAX(id) as max_id FROM products');
    // テーブルが空（データが0件）の場合は 0 になるため、+1 して 1 からスタートする
    const newId = (maxIdResult.rows[0].max_id || 0) + 1;

    // 2. 採番したidを含めてデータベースに挿入する
    await pool.query(
      'INSERT INTO products (id, name, price) VALUES ($1, $2, $3)',
      [newId, name, price]
    );
    
    res.redirect('/db-sample'); // 登録後は一覧画面へリダイレクト
  } catch (error) {
    console.error('商品の登録に失敗しました', error);
    res.status(500).send('商品の登録に失敗しました');
  }
});

// ------------------------------
// 削除機能の追加
// ------------------------------

// 3. 指定したIDのデータを削除
app.post('/db-sample/:id/delete', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    res.redirect('/db-sample'); // 削除後は一覧画面へリダイレクト
  } catch (error) {
    console.error('商品の削除に失敗しました', error);
    res.status(500).send('商品の削除に失敗しました');
  }
});



//TODOアプリ
app.use('/todo', todoRouter);
app.use(todoRouter); // /api/v1/todos のパスを含むためそのまま利用可能

// TODO画面用ルート
app.get('/todo_v1', (req, res) => {
  res.render('todo_v1/index.ejs'); // ※プロジェクトのビュー設定パスに合わせて調整
});

// TODO REST API
app.use('/api/v1/todo', todoRouter_v1);

// 4. AIルート
app.use('/api/ai', aiRouter);
app.use('/api/ai/v2', aiV2Router); 

// 5. チャットルート（/chat および /api/chat/*）
app.use(chatRouter);

// 6. グローバルエラーハンドラー
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal Server Error' });
});

// ------------------------------
// HTTPサーバーとSocket.IOの統合・起動
// ------------------------------
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer);

// chatController.ts から io を参照できるよう保存
app.set('io', io);

io.on('connection', (socket: Socket) => {
  const sessionId = extractChatSessionIdFromHeader(socket.handshake.headers.cookie);

  socket.on('chat:join', async (_payload: unknown, ack?: AckCallback) => {
    try {
      if (!sessionId) {
        const errorMessage = 'セッション情報がありません。';
        if (typeof ack === 'function') ack({ ok: false, reason: 'INVALID', error: errorMessage });
        socket.emit('chat:error', { code: 'INVALID_SESSION', message: errorMessage });
        return;
      }

      const joinResult = await joinDefaultRoom(sessionId);
      if (joinResult.status === 'full') {
        const fullError = new ChatRoomFullError();
        await socket.leave(CHAT_SOCKET_ROOM);
        socket.emit('chat:room:full', {
          roomId: DEFAULT_ROOM_ID,
          message: fullError.message,
          retryUrl: fullError.retryUrl,
        });
        if (typeof ack === 'function') {
          ack({ ok: false, reason: 'FULL', error: fullError.message });
        }
        return;
      }

      await socket.join(CHAT_SOCKET_ROOM);
      const messages = await getLatestMessagesForMember(sessionId);
      if (typeof ack === 'function') {
        ack({ ok: true, messages });
      }
    } catch (error) {
      console.error('chat:join 処理中にエラーが発生しました', error);
      const message = '入室処理中にエラーが発生しました。';
      socket.emit('chat:error', { code: 'JOIN_ERROR', message });
      if (typeof ack === 'function') {
        ack({ ok: false, reason: 'ERROR', error: message });
      }
    }
  });

  socket.on('chat:sync:request', async (_payload: unknown, ack?: AckCallback) => {
    try {
      if (!sessionId || !(await isActiveRoomSession(sessionId, DEFAULT_ROOM_ID))) {
        const message = 'チャットルームに参加していないため履歴を取得できません。';
        socket.emit('chat:error', { code: 'FORBIDDEN', message });
        if (typeof ack === 'function') {
          ack({ ok: false, error: message });
        }
        return;
      }

      const messages = await getLatestMessagesForMember(sessionId);
      if (typeof ack === 'function') {
        ack({ ok: true, messages });
      }
    } catch (error) {
      console.error('chat:sync:request 処理中にエラーが発生しました', error);
      const message = '履歴の同期中にエラーが発生しました。';
      socket.emit('chat:error', { code: 'SYNC_ERROR', message });
      if (typeof ack === 'function') {
        ack({ ok: false, error: message });
      }
    }
  });

  socket.on('chat:message:send', async (payload: unknown, ack?: AckCallback) => {
    try {
      if (!sessionId) {
        throw new ChatForbiddenError('チャットルームに参加していないためメッセージを投稿できません。');
      }

      const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
      const saved = await postMessageToDefaultRoom({
        sessionId,
        username: data.username,
        comment: data.comment,
      });

      // DB保存成功後に同一ルームへ配信
      io.to(CHAT_SOCKET_ROOM).emit('chat:message:new', saved);

      if (typeof ack === 'function') {
        ack({ ok: true, message: saved });
      }
    } catch (error) {
      if (error instanceof ChatValidationError || error instanceof ChatForbiddenError) {
        if (typeof ack === 'function') {
          ack({ ok: false, reason: error.code, error: error.message });
        }
        socket.emit('chat:error', { code: error.code, message: error.message });
        return;
      }

      console.error('chat:message:send 処理中にエラーが発生しました', error);
      const message = 'メッセージの保存または送信に失敗しました。';
      if (typeof ack === 'function') {
        ack({ ok: false, reason: 'ERROR', error: message });
      }
      socket.emit('chat:error', { code: 'SEND_ERROR', message });
    }
  });

  socket.on('disconnect', async () => {
    try {
      if (sessionId) {
        await leaveDefaultRoom(sessionId);
      }
    } catch (error) {
      console.error('Socket disconnect 時の席解放処理に失敗しました', error);
    }
  });
});

const listenPort: number = Number(process.env.PORT) || port;

httpServer.listen(listenPort, (): void => {
  console.log(`Server started: http://localhost:${listenPort}`);
});