# リアルタイムチャット機能 実装手順書 (`docs/chat/04_implementation.md`)

---

## はじめに：既存情報の確認方法（不明な箇所の調べ方）

本手順書では `02_requirements.md` と `03_design.md` に基づき、工程 A〜E の順で段階的に実装を進めます。実際のプロジェクト情報（`package.json`、ファイルツリー、起動ファイル、`src/apps/todo/`、DB接続・エラー処理）が未確認・未添付の箇所については、次のコマンドで手元のリポジトリを確認しながら進めてください。

```bash
# リポジトリルートで実行：ファイル構成・スクリプト・既存DB/エラー処理の確認
git status
cat package.json
find src views public sql -maxdepth 4 2>/dev/null || ls -la

```

* **npmスクリプト名**: `package.json` の `"scripts"` を確認し、開発／ビルド／起動スクリプト名（例: `dev`、`build`、`start` など）を把握します。
* **DB接続と環境変数**: 既存のDB接続ファイル（例: `src/` や `db/` 配下の接続モジュール）を確認し、`DATABASE_URL` または `DATABASE_URL_POOLED` のどちらを既存コードが参照しているか、プール生成方法や `dotenv` の読み込み位置をそのまま再利用します。
* **起動ファイルとポート競合防止**: 既存の起動エントリ（`index.ts`、`local.ts` 等）を確認し、**既存の Express／HTTP サーバーがポートを `listen` する箇所を1つに統一**します。`Socket.IO` は既存の `http.Server` インスタンスに `new Server(httpServer)` でアタッチし、同じポートで2つサーバーを立てないよう注意します。
* **画面エスケープと機密情報**: EJS（`views/chat/index.ejs`）は `<%= ... %>`、クライアントJS（`public/chat/chat.js`）は `textContent` を使用し、DB接続文字列などの機密情報はサーバー側でのみ読み込みます。

---

## 工程 A：既存アプリの動作確認、ブランチ作成、socket.ioの追加、`/chat` と接続ログの確認

### A-1. 目的

既存機能（TOP / TODO / AI質問）が正常に動くことを確認したうえで作業ブランチを作成し、`socket.io` を導入して `/chat` 画面の表示と `Socket.IO` 接続ログを確認する。

### A-2. 対応する REQ / DES

* **REQ**: `REQ-CHAT-001`, `REQ-CHAT-010`, `REQ-CHAT-011`
* **DES**: `DES-CHAT-001`, `DES-CHAT-002`, `DES-CHAT-006`

### A-3. 変更ファイル

* `package.json` / ロックファイル（`package-lock.json` 等、`socket.io` 追加）
* 既存起動ファイル（`local.ts` / `index.ts` のうちサーバー起動を担うファイル、調べ方は上記参照）
* `src/apps/chat/chatRouter.ts`（新規）
* `src/apps/chat/chatController.ts`（新規）
* `views/chat/index.ejs`（新規）
* `public/chat/chat.js`（新規）

### A-4. 追加・変更する処理

* 既存ルーター（TOP / TODO / AI質問）の後ろかつ 404 / グローバルエラーハンドラーの前に、`/chat` 描画ルートを登録する。
* 既存 `http.Server` に対して `Socket.IO` サーバーをアタッチし、クライアント接続時にサーバー側へ接続ログを出力する。
* `views/chat/index.ejs` で `<%= ... %>` を使って初期表示値を描画し、`public/chat/chat.js` から `io()` で接続する。

#### 工程A 最小例（`/chat` 画面と Socket.IO 接続ログ）

```ejs
<!-- views/chat/index.ejs -->
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title><%= pageTitle %></title>
</head>
<body>
  <h1><%= pageTitle %></h1>
  <p id="conn-status">接続中...</p>
  <!-- 静的配信パスは既存アプリの public 設定に合わせて調整 -->
  <script src="/socket.io/socket.io.js"></script>
  <script src="/chat/chat.js"></script>
</body>
</html>

```

```javascript
// public/chat/chat.js（最小例）
const statusEl = document.getElementById('conn-status');
const socket = io();

socket.on('connect', () => {
  if (statusEl) statusEl.textContent = `接続済み (${socket.id})`;
});

socket.on('disconnect', () => {
  if (statusEl) statusEl.textContent = '切断されました';
});

```

### A-5. コマンドと実行場所

```bash
# リポジトリルートで実行
git checkout -b feat/chat-realtime
npm install socket.io

# package.json の scripts を確認したうえで既存アプリを起動
# 例: npm run dev または npx ts-node local.ts

```

### A-6. 確認操作と期待結果

* **確認操作**: ブラウザで既存画面（TOP / TODO / AI質問）を開いた後、`http://<ローカルホスト>:<ポート>/chat` にアクセスする。
* **期待結果**:
* 既存画面が従来どおり表示される。
* `/chat` が HTTP 200 で表示され、画面ステータスが「接続済み」に変わり、サーバーコンソールに `Socket.IO` の接続ログが出力される。

### A-7. つまずいたときの切り分け

* **`EADDRINUSE`（ポート使用中）**: 既存サーバー起動処理と `Socket.IO` 側で別々に `listen()` を呼んでいないか、または前回のプロセスが残っていないか確認する。
* **`/chat` が 404 になる**: ルーターの登録位置が 404 ハンドラーより後ろになっていないか、マウントパス（`app.use('/', chatRouter)` 等）を確認する。
* **`/socket.io/socket.io.js` や `chat.js` が 404**: `http.Server` に `Socket.IO` がアタッチされているか、静的ファイル配信ミドルウェアのディレクトリ設定を確認する。

---

## 工程 B：検証用 Neon への SQL 適用、Model での投稿保存と最新20件取得

### B-1. 目的

検証用 Neon（PostgreSQL）に `chat_messages` テーブルを作成し、パラメータ化SQLを用いたメッセージ保存と「最新20件を古い順で取得」する `chatModel.ts` を実装する。

### B-2. 対応する REQ / DES

* **REQ**: `REQ-CHAT-004`, `REQ-CHAT-005`, `REQ-CHAT-011`
* **DES**: `DES-CHAT-003`, `DES-CHAT-006`

### B-3. 変更ファイル

* `sql/chat/040_create_chat_messages.sql`（新規）
* `src/apps/chat/chatModel.ts`（新規）
* （任意・一時確認用）検証用スクリプトまたは既存DB接続モジュールの確認

### B-4. 追加・変更する処理

* `sql/chat/040_create_chat_messages.sql` に `chat_messages`（`id`, `room_id`, `username`, `comment`, `created_at`）とインデックスを定義する。
* 既存のDB接続モジュール（`DATABASE_URL` / `DATABASE_URL_POOLED` を読み込む既存プール／クライアント）を再利用し、`$1, $2...` のパラメータ化クエリで保存と取得を行う。
* 取得時はサブクエリで `ORDER BY id DESC LIMIT 20` により最新20件を選び、外側で `ORDER BY id ASC` として古い順に並べ替える。

#### 工程B 最小例（SQL と Model）

```sql
-- sql/chat/040_create_chat_messages.sql
CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id VARCHAR(64) NOT NULL DEFAULT 'default',
  username VARCHAR(50) NOT NULL,
  comment VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id_id
  ON chat_messages (room_id, id DESC);

```

```typescript
// src/apps/chat/chatModel.ts（最小例：既存DB実行関数/プールを再利用）
export interface ChatMessageRecord {
  id: number;
  room_id: string;
  username: string;
  comment: string;
  created_at: string;
}

// 既存コードのDB接続ヘルパー（例: query / pool）を確認してインポートする
export async function insertChatMessage(
  queryFn: (sql: string, params?: unknown[]) => Promise<{ rows: ChatMessageRecord[] }>,
  input: { roomId?: string; username: string; comment: string }
): Promise<ChatMessageRecord> {
  const roomId = input.roomId ?? 'default';
  const result = await queryFn(
    `INSERT INTO chat_messages (room_id, username, comment)
     VALUES ($1, $2, $3)
     RETURNING id, room_id, username, comment, created_at`,
    [roomId, input.username, input.comment]
  );
  return result.rows[0];
}

export async function findLatestMessagesAsc(
  queryFn: (sql: string, params?: unknown[]) => Promise<{ rows: ChatMessageRecord[] }>,
  roomId = 'default'
): Promise<ChatMessageRecord[]> {
  const result = await queryFn(
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

```

### B-5. コマンドと実行場所

```bash
# リポジトリルートで実行
# 1. 既存コードが使う環境変数（DATABASE_URL / DATABASE_URL_POOLED）を確認
grep -rn "DATABASE_URL" src/ index.ts local.ts 2>/dev/null || true

# 2. 検証用 Neon に SQL を適用（psql を使う場合）
psql "$DATABASE_URL" -f sql/chat/040_create_chat_messages.sql

```

### B-6. 確認操作と期待結果

* **確認操作**: 検証用 Neon に SQL を適用したうえで、テストまたは一時スクリプトで25件のメッセージを `insertChatMessage` により保存し、`findLatestMessagesAsc('default')` を呼び出す。
* **期待結果**:
* `chat_messages` に25件保存される。
* `findLatestMessagesAsc` の返却件数が20件となり、先頭が6番目（古い方）〜末尾が25番目（最新）の昇順になっている。

### B-7. つまずいたときの切り分け

* **DB接続エラー（SSL / 接続文字列未設定）**: `.env` の読み込み順（`dotenv` がDBモジュール読み込み前に呼ばれているか）と、既存コードが `DATABASE_URL` と `DATABASE_URL_POOLED` のどちらを参照しているかを確認する。
* **SQL構文・権限エラー**: 適用先の接続先DBが「検証用Neon」になっているか、テーブル作成権限があるかを確認する。

---

## 工程 C：投稿フォーム、サーバー検証、保存後の同一ルーム配信、2タブでの確認

### C-1. 目的

`/chat` にユーザー名（最大50文字）・コメント（最大500文字）の投稿フォームを追加し、クライアント・サーバー双方の入力検証と DB 保存後の同一デフォルトルーム（`chat:default`）配信を実装して、2タブ間でリアルタイム送受信を確認する。

### C-2. 対応する REQ / DES

* **REQ**: `REQ-CHAT-001`, `REQ-CHAT-002`, `REQ-CHAT-003`, `REQ-CHAT-004`, `REQ-CHAT-009`, `REQ-CHAT-011`
* **DES**: `DES-CHAT-001`, `DES-CHAT-002`, `DES-CHAT-004`, `DES-CHAT-006`

### C-3. 変更ファイル

* `src/apps/chat/chatService.ts`（新規）
* `src/apps/chat/chatController.ts`（更新）
* `src/apps/chat/chatRouter.ts`（更新）
* `views/chat/index.ejs`（更新）
* `public/chat/chat.js`（更新）

### C-4. 追加・変更する処理

* **入力検証（クライアント＋サーバー）**:
  * `username`、`comment` が文字列であること、前後空白除去（`trim()`）後に空でないこと、ユーザー名50文字以内・コメント500文字以内を検証する。

* **保存と配信**:
  * `chatService.ts` で検証後、`chatModel.ts` で Neon DB に保存し、保存完了後に `io.to('chat:default').emit('chat:message:new', savedMessage)` で同一ルームへ配信する。

* **画面描画**:
  * `views/chat/index.ejs` の初期履歴描画は `<%= ... %>` を使用し、`public/chat/chat.js` の新着・エラー描画は `textContent` を使用する。

#### 工程C 最小例（検証・保存・配信・描画）

```typescript
// src/apps/chat/chatService.ts（最小例）
export interface ValidatedMessageInput {
  username: string;
  comment: string;
}

export function validateChatInput(rawUsername: unknown, rawComment: unknown): ValidatedMessageInput {
  if (typeof rawUsername !== 'string' || typeof rawComment !== 'string') {
    throw new Error('VALIDATION_ERROR: ユーザー名とコメントは文字列で入力してください。');
  }
  const username = rawUsername.trim();
  const comment = rawComment.trim();

  if (username.length === 0) {
    throw new Error('VALIDATION_ERROR: ユーザー名を入力してください。');
  }
  if (username.length > 50) {
    throw new Error('VALIDATION_ERROR: ユーザー名は50文字以内で入力してください。');
  }
  if (comment.length === 0) {
    throw new Error('VALIDATION_ERROR: コメントを入力してください。');
  }
  if (comment.length > 500) {
    throw new Error('VALIDATION_ERROR: コメントは500文字以内で入力してください。');
  }
  return { username, comment };
}

```

```javascript
// public/chat/chat.js（最小例：textContent による描画と送信）
const messagesEl = document.getElementById('messages');
const errorEl = document.getElementById('error-msg');
const formEl = document.getElementById('chat-form');

function appendMessageItem(msg) {
  if (!messagesEl) return;
  const li = document.createElement('li');
  const author = document.createElement('strong');
  author.textContent = msg.username;
  const body = document.createElement('span');
  body.textContent = `: ${msg.comment}`;
  li.appendChild(author);
  li.appendChild(body);
  messagesEl.appendChild(li);
}

socket.on('chat:message:new', (msg) => {
  appendMessageItem(msg);
});

formEl?.addEventListener('submit', (e) => {
  e.preventDefault();
  if (errorEl) errorEl.textContent = '';
  const u = document.getElementById('username')?.value ?? '';
  const c = document.getElementById('comment')?.value ?? '';
  if (!u.trim() || u.trim().length > 50) {
    if (errorEl) errorEl.textContent = 'ユーザー名は1〜50文字で入力してください。';
    return;
  }
  if (!c.trim() || c.trim().length > 500) {
    if (errorEl) errorEl.textContent = 'コメントは1〜500文字で入力してください。';
    return;
  }
  socket.emit('chat:message:send', { username: u, comment: c }, (ack) => {
    if (!ack?.ok && errorEl) {
      errorEl.textContent = ack?.error ?? '送信に失敗しました。';
    }
  });
});

```

### C-5. コマンドと実行場所

```bash
# リポジトリルートで実行
npm run dev # package.json に合わせた起動コマンドを実行

```

### C-6. 確認操作と期待結果

* **確認操作**: 同じブラウザで2つのタブを開き、両方とも `/chat` にアクセスする。タブ1から有効なユーザー名・コメントを送信し、さらに空文字・空白のみ・51文字ユーザー名・501文字コメントを送信する。
* **期待結果**:
  * 有効な投稿が両方のタブにリアルタイム表示され、`chat_messages` にも保存される。
  * `<script>alert(1)</script>` を入力しても実行されず文字列として表示される。
  * 空文字・空白のみ・文字数超過時は送信が止まり、画面にエラーメッセージが表示される。

### C-7. つまずいたときの切り分け

* **片方のタブにしか届かない**: クライアントがデフォルトルーム（`chat:default`）へ参加した後に `io.to('chat:default').emit(...)` を呼んでいるか確認する。
* **文字数超過が通ってしまう**: クライアント側だけでなくサーバー側でも `username.length > 50` / `comment.length > 500` を判定しているか確認する。

---

## 工程 D：5人制限、切断時の席解放、再入室と履歴同期、画面への例外表示

### D-1. 目的

セッション単位で最大5名（同一ブラウザの複数タブは1名カウント）の定員制限と6人目以降の満席案内（＋ `/chat` リンク・入室/閲覧/投稿制限）、切断時の席解放、再入室時の最新20件取得とID統合・リスナー重複防止、および画面への例外表示を実装する。

### D-2. 対応する REQ / DES

* **REQ**: `REQ-CHAT-005`, `REQ-CHAT-007`, `REQ-CHAT-008`, `REQ-CHAT-009`, `REQ-CHAT-010`
* **DES**: `DES-CHAT-002`, `DES-CHAT-003`, `DES-CHAT-004`, `DES-CHAT-005`, `DES-CHAT-006`

### D-3. 変更ファイル

* `sql/chat/040_create_chat_messages.sql`（または追加DDL：`chat_room_sessions` テーブル追加）
* `src/apps/chat/chatModel.ts`（更新：セッション参加登録・更新・期限切れ回収・人数カウント）
* `src/apps/chat/chatService.ts`（更新：最大5セッション判定、同一ブラウザ複数タブ＝1名扱い、再入室同期）
* `src/apps/chat/chatController.ts`（更新：`GET /chat`、`/api/chat/join`、`/api/chat/leave`、`/api/chat/heartbeat`、`/api/chat/messages`、`/api/chat/messages` の参加資格検証とエラー連携）
* `src/apps/chat/chatRouter.ts`（更新）
* `views/chat/index.ejs`（更新：満席案内と `/chat` へのリンク、エラー表示領域）
* `public/chat/chat.js`（更新：ID統合、再接続時のリスナー固定、ハートビート、切断・エラー表示）

### D-4. 追加・変更する処理

* **セッション単位の5人制限**:
  * 同一セッション（同一ブラウザの複数タブ）からの入室・接続は既存セッション枠に統合し、人数を1名として扱う。
  * 期限切れセッションを除外したアクティブセッション数が5以上の新規セッションは満席とし、履歴非表示・投稿不可・満席案内＋ `/chat` リンクを表示する。

* **HTTP履歴取得の参加資格検証**:
  * `GET /api/chat/messages` は当該セッションがルーム参加中であることを検証し、未参加／満席状態では `403` を返して履歴を返さない。

* **ID統合とリスナー重複防止**:
  * 履歴取得とリアルタイム配信・ポーリングのメッセージを `id` で重複排除し、常に `id` 昇順（古い順）に並べる。
  * ソケットイベントリスナーは初期化時に1回だけ登録し、再接続時に追加登録しない。

* **例外処理連携**:
  * HTTP は `next(err)` で既存のグローバルエラーハンドラーへ渡し、Socket はイベントハンドラを `try / catch` で囲んでサーバークラッシュを防ぎ、ログ出力と画面通知を行う。

#### 工程D 最小例（ID統合・再接続リスナー固定・満席表示）

```javascript
// public/chat/chat.js（最小例：ID統合とリスナー1回登録）
const messageMap = new Map(); // id -> message

function renderSortedMessages() {
  if (!messagesEl) return;
  const sorted = Array.from(messageMap.values()).sort((a, b) => Number(a.id) - Number(b.id));
  messagesEl.textContent = '';
  for (const msg of sorted) {
    appendMessageItem(msg);
  }
}

function mergeMessages(list) {
  for (const msg of list) {
    messageMap.set(String(msg.id), msg);
  }
  renderSortedMessages();
}

// ソケットリスナーは初回のみ登録（connect内で再登録しない）
socket.on('chat:message:new', (msg) => {
  mergeMessages([msg]);
});

socket.on('chat:room:full', (payload) => {
  // 入室・閲覧・投稿を制限し、満席案内と /chat リンクを表示
  if (messagesEl) messagesEl.textContent = '';
  if (formEl) formEl.style.display = 'none';
  if (errorEl) {
    errorEl.textContent = '';
    const p = document.createElement('p');
    p.textContent = payload?.message ?? '現在満席（最大5名）のため入室できません。';
    const link = document.createElement('a');
    link.href = payload?.retryUrl ?? '/chat';
    link.textContent = '/chat へ再アクセス';
    errorEl.appendChild(p);
    errorEl.appendChild(link);
  }
});

socket.on('chat:error', (err) => {
  if (errorEl) errorEl.textContent = err?.message ?? '通信エラーが発生しました。';
});

```

### D-5. コマンドと実行場所

```bash
# リポジトリルートで実行
# chat_room_sessions テーブルを追加した場合は検証用 Neon に適用
psql "$DATABASE_URL" -f sql/chat/040_create_chat_messages.sql
npm run dev

```

### D-6. 確認操作と期待結果

* **確認操作**:
  1. ブラウザAで2タブを開き `/chat` にアクセスする（同一ブラウザ複数タブ＝1名として扱われる）。
  2. 別のブラウザ／シークレットウィンドウ（別セッション）B・C・D・E も `/chat` に参加させ、合計5セッションにする。
  3. 6つ目の別セッションFから `/chat` にアクセスする。
  4. セッションの1つを閉じるか切断し、切断検知／TTL経過後にセッションFから `/chat` リンク経由で再アクセスする。
  5. ネットワーク切断／再接続やDBエラー発生時の画面表示を確認する。

* **期待結果**:
  * 同一ブラウザ2タブは1名としてカウントされ、5セッション目までは入室可能。
  * 6セッション目では満席案内と `/chat` へのリンクが表示され、履歴の閲覧や投稿ができない（`GET /api/chat/messages` も拒否される）。
  * 切断・期限切れで席が空いた後、`/chat` リンクから再入室でき、最新20件が重複なく古い順に表示され、再接続後もメッセージが二重にならない。
  * 例外発生時もサーバーが落ちず、画面にエラーメッセージが表示される。

### D-7. つまずいたときの切り分け

* **同一ブラウザ2タブが2人と数えられる**: セッション識別子がタブ単位（`sessionStorage` 等）ではなく、ブラウザ単位の Cookie／セッションで共有されているか確認する。
* **再接続後にメッセージが2回表示される**: `socket.on('connect', ...)` の中で `socket.on('chat:message:new', ...)` を呼んでいないか、および `messageMap` による `id` 重複排除が効いているか確認する。

---

## 工程 E：複数インスタンス向け同期と共有定員管理、異なる2台での確認、既存機能の回帰確認

### E-1. 目的

`03_design.md` に従い **DB 同期／ポーリング併用** と共有DB（`chat_room_sessions`）による定員管理を仕上げ、接続先が異なる2つのサーバーインスタンスで同期と全台合計5人制限を確認し、既存機能（TOP / TODO / AI質問 / 404 / エラー処理）の回帰確認を行う。

### E-2. 対応する REQ / DES

* **REQ**: `REQ-CHAT-006`, `REQ-CHAT-007`, `REQ-CHAT-008`, `REQ-CHAT-010`, `REQ-CHAT-011`
* **DES**: `DES-CHAT-001`, `DES-CHAT-003`, `DES-CHAT-004`, `DES-CHAT-005`, `DES-CHAT-006`

### E-3. 変更ファイル

* `src/apps/chat/chatService.ts`（更新：ポーリング用取得／差分・最新20件同期、共有DBベースの原子的な席確保・期限切れ回収）
* `src/apps/chat/chatController.ts`（更新：同期API・満席応答の整合）
* `public/chat/chat.js`（更新：定期ポーリングによる DB 同期と `mergeMessages` による ID 統合）
* `docs/chat/06_test_results.md`（任意：検証結果の記録）

### E-4. 追加・変更する処理

* `public/chat/chat.js` に定期ポーリングタイマーを設定し、一定間隔で `GET /api/chat/messages` を呼び出して `mergeMessages(...)` で最新20件（または新着）を ID ベースで統合する。ページ離脱や満席・停止時はタイマーをクリアする。
* `chatModel.ts` / `chatService.ts` では複数インスタンスから同時アクセスされても `chat_room_sessions` の期限切れ回収と席確保（上限5セッション）が競合しないようクエリ／トランザクションを組み立てる。

#### 工程E 最小例（ポーリング併用とクリーンアップ）

```javascript
// public/chat/chat.js（最小例：DB同期／ポーリング併用）
let pollingTimer = null;

async function syncMessagesFromDb() {
  try {
    const res = await fetch('/api/chat/messages', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.messages)) {
      mergeMessages(data.messages);
    }
  } catch {
    if (errorEl) {
      errorEl.textContent = '同期中に通信エラーが発生しました。再試行しています...';
    }
  }
}

function startPolling(intervalMs = 3000) {
  stopPolling();
  pollingTimer = window.setInterval(syncMessagesFromDb, intervalMs);
}

function stopPolling() {
  if (pollingTimer !== null) {
    window.clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

window.addEventListener('beforeunload', stopPolling);

```

### E-5. コマンドと実行場所

```bash
# 異なるポート／接続先で2つのインスタンスを起動（同一の検証用 Neon を参照）
# ターミナル1（インスタンスA：例 ポート3001）
PORT=3001 npm run dev

# ターミナル2（インスタンスB：例 ポート3002）
PORT=3002 npm run dev

```

※ 既存アプリのポート環境変数名（`PORT` 等）は起動ファイル（`local.ts` / `index.ts`）を確認して合わせてください。

### E-6. 確認操作と期待結果

* **確認操作**:
  1. インスタンスA（例: `http://localhost:3001/chat`）にクライアント1を、インスタンスB（例: `http://localhost:3002/chat`）にクライアント2を接続する。
  2. クライアント1からメッセージを送信し、DB保存後にクライアント2側でポーリング／再取得によりメッセージが表示されるか確認する。
  3. インスタンスAとインスタンスBにまたがって合計5セッションを参加させ、6セッション目からインスタンスAまたはBへアクセスして満席案内＋ `/chat` リンクと入室・閲覧・投稿制限を確認する。
  4. 既存機能の回帰確認として、TOP画面、TODO機能、AI質問機能、存在しないURL（404）、およびエラー発生時のエラーハンドラー動作を確認する。

* **期待結果**:
  * 接続先が異なる2インスタンス間でもメッセージが同期され、最新20件の整合性が保たれる。
  * インスタンスを跨いで合計5セッションに達すると6セッション目は満席となり、共有DBの席解放後は `/chat` リンクから再入室できる。
  * TOP・TODO・AI質問・404・共通エラーハンドラーがいずれも従来どおり動作する。

### E-7. つまずいたときの切り分け

* **インスタンスAとBで定員が別々に5人ずつ（計10人）入ってしまう**: 席数カウントをプロセス内メモリや `Socket.IO` のローカルルーム人数で行っていないか確認し、`chat_room_sessions` テーブルの集計結果を参照するよう修正する。
* **ポーリングで画面がちらつく・スクロール位置が飛ぶ**: 毎回 DOM 全体を作り直すのではなく、新規 `id` の要素だけを追記する方式（またはスクロール位置を保持する方式）に調整する。
* **既存機能（TODO / AI質問 / 404）に影響が出ている**: `index.ts` / `local.ts` や共通ミドルウェアでチャット用ハンドラーが既存ルートや 404 / エラーハンドラーを上書きしていないか `git diff` で確認する。
