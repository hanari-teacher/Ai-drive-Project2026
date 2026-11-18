# AI対話アプリ V2 基本・詳細設計書

* **文書管理ID:** DOC-AI-V2-DES
* **保存先パス:** `docs/ai/v2/design.md`
* **関連文書:** `docs/ai/v2/requirements.md`（AI対話アプリ V2 要件定義書）

---

## 1. 設計方針と設計ID一覧

本設計書では、要件定義書（`REQ-V2-01`〜`07`）および確定仕様（タイトル上限100文字、質問文上限1,500文字）を実現するためのアーキテクチャ、ファイル構成、DB構造、API仕様、画面設計、および例外・運用制御を定義する。

### 1.1 設計ID（DES）と要件ID（REQ）の対応表

| 設計ID | 設計対象 | 対応する要件ID | 概要 |
| :--- | :--- | :--- | :--- |
| **DES-V2-01** | システム構成・ファイル配置設計 | REQ-V2-06 | V1およびTODOアプリと完全分離したディレクトリ・ルーター配置と既存 `db.ts` プール共有 |
| **DES-V2-02** | データベース設計（テーブル・制約・並び順） | REQ-V2-01, REQ-V2-03, REQ-V2-04, REQ-V2-06 | 会話テーブルと往復（ターン）テーブルの1対多分離設計、文字数・外部キー制約 |
| **DES-V2-03** | APIエンドポイント・入出力仕様設計 | REQ-V2-01, REQ-V2-02, REQ-V2-04, REQ-V2-07 | `/api/ai/v2/conversations` および `/turns` のリクエスト・レスポンス・ページネーション仕様 |
| **DES-V2-04** | 質問送信・Gemini連携処理フロー設計 | REQ-V2-02, REQ-V2-03, REQ-V2-05 | 検証→履歴5往復取得→`user`/`model`組立→Gemini送信→1往復保存→201応答の処理シーケンス |
| **DES-V2-05** | 画面構成・UI状態遷移設計 | REQ-V2-01, REQ-V2-04, REQ-V2-05, REQ-V2-07 | `/ai/v2/` の画面レイアウト、初期20往復表示＋20件追加表示、送信エラー時の入力保持 |
| **DES-V2-06** | 失敗時・公開停止時（キルスイッチ）制御設計 | REQ-V2-05, REQ-V2-07 | 各種エラー時のHTTPステータス・DB整合性保護、および `AI_DISABLED=true` 時の投稿禁止動作 |

---

## 2. システム構成・ファイル配置設計（DES-V2-01）

* **対応要件ID:** `REQ-V2-06`

### 2.1 ディレクトリおよびファイル配置と役割

V1の構成（`public/ai/index.html`、`src/apps/ai/aiRouter.ts`）および既存プロジェクトの規約に合わせ、`v2/` ディレクトリ配下にV2専用ファイルを以下の通り配置する（ディレクトリでバージョンを区別するため、ファイル名には `V2` を含めない）。

| ファイルパス | 種別 | 役割・責務 |
| :--- | :--- | :--- |
| `index.ts` | 既存変更（最小限） | Expressアプリケーション本体。V2用APIルーター（`/api/ai/v2`）のマウント、および静的ファイル配信（`/ai/v2/`）の設定を追加する（※V1の記述は変更しない）。 |
| `db.ts` | 既存利用（変更なし） | Neon（PostgreSQL）用 `Pool`（`max: 2`, `sslmode=verify-full`）を提供。V2のDBアクセスモジュールからインポートして共有利用する。 |
| `public/ai/v2/index.html` | 新規作成 | V2のフロントエンド画面（HTML / CSS / クライアントJS）。会話作成、一覧表示・切り替え、履歴表示（20往復＋20件追加）、質問送信UIを提供する。 |
| `src/apps/ai/v2/aiRouter.ts` | 新規作成 | `/api/ai/v2` 配下のルーティング定義、キルスイッチ（`AI_DISABLED`）判定ミドルウェア、リクエスト受付とレスポンス返却を行う。 |
| `src/apps/ai/v2/aiService.ts` | 新規作成 | ビジネスロジック層。文字数・存在バリデーション、過去5往復の履歴組み立て、Gemini API（`@google/genai`）呼び出し、DB保存のオーケストレーションを担う。 |
| `src/apps/ai/v2/aiRepository.ts` | 新規作成 | データアクセス層（SQL実行）。`db.ts` の `pool` を使用し、V2専用テーブルへのCRUDおよびページネーション取得を行う。 |
| `sql/ai/v2/032_create_ai_v2_qa_logs.sql` | 新規作成 | V2専用テーブル（会話テーブル・往復テーブル）およびインデックスを作成するDDLスクリプト。 |

> **【要確認事項】**
> * 添付コードが未提供のため、`src/apps/ai/` 配下が `Router` 単体構成か `Controller / Service / Repository` 分割構成か、また `index.ts` における `express.static('public')` のマウント詳細およびエラーハンドリング共通ミドルウェアの有無は、実装着手前に既存 `index.ts` および `src/apps/ai/aiRouter.ts` の実コードを確認すること。

---

## 3. データベース設計（DES-V2-02）

* **対応要件ID:** `REQ-V2-01`, `REQ-V2-03`, `REQ-V2-04`, `REQ-V2-06`
* **DDL保存先:** `sql/ai/v2/032_create_ai_v2_qa_logs.sql`

V1の `ai_qa_logs` テーブルには一切触れず、V2専用に「会話（親）」と「往復／ターン（子）」の2テーブルを1対多で作成する。1回の質問とAI回答のペアを「1往復（1ターン）」として管理する。

### 3.1 テーブル定義：`ai_v2_conversations`（会話テーブル）

話題ごとの会話スレッドを管理する親テーブル。

| 列名 | データ型 | NULL制約 | デフォルト値 | キー・制約 | 説明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` (または `BIGSERIAL`) | `NOT NULL` | 自動採番 | **PRIMARY KEY** | 会話ID（一意識別子） |
| `title` | `VARCHAR(100)` | `NOT NULL` | なし | `CHECK (char_length(trim(title)) BETWEEN 1 AND 100)` | 初期入力された会話タイトル（1〜100文字） |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | なし | 会話作成日時 |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | なし | 最終更新日時（新規往復追加時に現在時刻へ更新） |

* **並び順（一覧取得時）:** `ORDER BY updated_at DESC, id DESC`（新しく作成または対話した会話が一覧の上部に表示される）。

### 3.2 テーブル定義：`ai_v2_turns`（会話往復テーブル）

1つの会話に属する「質問（user）」と「回答（model）」の1往復分を1レコードとして保持する子テーブル。

| 列名 | データ型 | NULL制約 | デフォルト値 | キー・制約 | 説明 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `id` | `SERIAL` (または `BIGSERIAL`) | `NOT NULL` | 自動採番 | **PRIMARY KEY** | 往復（ターン）ID（時系列順序の基準にも利用） |
| `conversation_id` | `INTEGER` (または `BIGINT`) | `NOT NULL` | なし | **FOREIGN KEY** (`ai_v2_conversations(id) ON DELETE CASCADE`) | 所属する会話ID（別会話への混入を構造的に防止） |
| `user_message` | `TEXT` | `NOT NULL` | なし | `CHECK (char_length(trim(user_message)) BETWEEN 1 AND 1500)` | 利用者の質問文（1〜1,500文字） |
| `model_message` | `TEXT` | `NOT NULL` | なし | `CHECK (char_length(model_message) >= 1)` | Geminiが生成した回答文 |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL` | `NOW()` | なし | 往復保存日時 |

* **インデックス:** `CREATE INDEX idx_ai_v2_turns_conv_id ON ai_v2_turns (conversation_id, id DESC);`
* **並び順（取得・表示時）:**
  * **DB取得時（ページネーション・直近5往復抽出）:** `WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3` で最新側から効率的に取得する。
  * **API返却・画面表示・AI送信組立時:** 取得した配列をサーバー側で逆順（`id ASC`：古い順→新しい順）に並べ替えて返却・利用する。

### 3.3 コネクションプール運用方針（`max: 2` 対策）

* `db.ts` の `pool` は最大2接続であるため、Gemini API呼び出し中（数秒かかる外部通信）は**DBコネクションを保持しない**。
* DBアクセスは各ステップで単発の `pool.query(...)` を使用して即座にプールへ返却し、接続枯渇を防ぐ。

---

## 4. APIエンドポイント・入出力仕様設計（DES-V2-03）

* **対応要件ID:** `REQ-V2-01`, `REQ-V2-02`, `REQ-V2-04`, `REQ-V2-07`
* **ベースパス:** `/api/ai/v2`
* **データ形式:** JSON（`Content-Type: application/json`）

### 4.1 エンドポイント一覧

| No | メソッド | URLパス | 概要 | キルスイッチ（`AI_DISABLED=true`）時の挙動 |
| :--- | :--- | :--- | :--- | :--- |
| 1 | `GET` | `/api/ai/v2/conversations` | 会話一覧および公開状態の取得 | **許可**（`200 OK` で一覧と停止中フラグを返す） |
| 2 | `POST` | `/api/ai/v2/conversations` | 新規会話の作成（タイトル初期入力） | **拒否**（`503 Service Unavailable`） |
| 3 | `GET` | `/api/ai/v2/conversations/:id/turns` | 指定会話の往復履歴取得（初期20往復・20件追加） | **許可**（`200 OK` で過去履歴を返す） |
| 4 | `POST` | `/api/ai/v2/conversations/:id/turns` | 質問送信・AI応答生成・1往復保存 | **拒否**（`503 Service Unavailable`） |

### 4.2 各APIの詳細仕様

#### ① 会話一覧取得：`GET /api/ai/v2/conversations`
* **入力:** なし（クエリパラメータ不要）
* **正常応答（`200 OK`）:**
  ```json
  {
    "aiDisabled": false,
    "conversations": [
      {
        "id": 12,
        "title": "TypeScriptの型定義について",
        "createdAt": "2026-11-18T05:00:00.000Z",
        "updatedAt": "2026-11-18T05:10:00.000Z"
      }
    ]
  }
  ```
  ※応答に `aiDisabled` を含めることで、初期ロード時に画面側の公開停止表示制御も同時に行える。

#### ② 新規会話作成：`POST /api/ai/v2/conversations`
* **前提チェック:** `AI_DISABLED === 'true'` の場合は即時 `503` を返却。
* **入力（Request Body）:**
  ```json
  {
    "title": "TypeScriptの型定義について"
  }
  ```
* **入力バリデーション:**
  * `title` が文字列であること。
  * 前後空白除去（`trim()`）後の文字数が **1文字以上 100文字以下** であること。
* **正常応答（`201 Created`）:**
  ```json
  {
    "conversation": {
      "id": 13,
      "title": "TypeScriptの型定義について",
      "createdAt": "2026-11-18T05:15:00.000Z",
      "updatedAt": "2026-11-18T05:15:00.000Z"
    }
  }
  ```
* **異常応答:** `400 Bad Request`（タイトル空・100文字超過）、`503 Service Unavailable`（公開停止中）、`500 Internal Server Error`（DBエラー）

#### ③ 会話の往復履歴取得：`GET /api/ai/v2/conversations/:id/turns`
* **入力（Path / Query）:**
  * `:id`：会話ID（正の整数）
  * `limit`（任意、デフォルト `20`）：取得する往復件数（初期表示 `20`、追加表示 `20`）
  * `offset`（任意、デフォルト `0`）：最新側からスキップする往復件数（初期表示 `0`、1回目追加 `20`、2回目追加 `40`…）
* **処理内容:**
  * 会話 `:id` の存在確認（存在しない場合は `404 Not Found`）。
  * `limit + 1` 件（例：21件）を `ORDER BY id DESC OFFSET $offset` で取得し、超過分が存在するかを判定する（`hasMore = rows.length > limit`）。
  * 返却対象（最大 `limit` 件）を時系列順（`id ASC`）に並べ替える。
* **正常応答（`200 OK`）:**
  ```json
  {
    "conversation": {
      "id": 12,
      "title": "TypeScriptの型定義について"
    },
    "turns": [
      {
        "id": 101,
        "userMessage": "interfaceとtypeの違いは何ですか？",
        "modelMessage": "主な違いは宣言のマージ可否とユニオン型の表現力です...",
        "createdAt": "2026-11-18T05:01:00.000Z"
      }
    ],
    "hasMore": true
  }
  ```
  ※`hasMore: true` の場合、画面上部に「過去の履歴が存在します」および追加読み込みボタンを表示する。

#### ④ 質問送信・1往復作成：`POST /api/ai/v2/conversations/:id/turns`
* **前提チェック:** `AI_DISABLED === 'true'` の場合は即時 `503` を返却。
* **入力（Path / Request Body）:**
  * `:id`：会話ID（正の整数）
  * Body:
    ```json
    {
      "prompt": "具体的なコード例を教えてください。"
    }
    ```
* **入力バリデーション:**
  * `:id` が正の整数であること。
  * `prompt` が文字列であり、前後空白除去（`trim()`）後の文字数が **1文字以上 1,500文字以下** であること。
* **正常応答（`201 Created`）:**
  ```json
  {
    "turn": {
      "id": 102,
      "conversationId": 12,
      "userMessage": "具体的なコード例を教えてください。",
      "modelMessage": "以下にinterfaceとtypeの比較例を示します...",
      "createdAt": "2026-11-18T05:12:00.000Z"
    }
  }
  ```
* **異常応答:** `400 Bad Request`（入力不正・1,500文字超過）、`404 Not Found`（会話が存在しない）、`502 Bad Gateway`（Gemini API呼び出し失敗）、`503 Service Unavailable`（公開停止中・APIキー未設定）、`500 Internal Server Error`（DB保存失敗）

---

## 5. 質問送信・Gemini連携処理フロー設計（DES-V2-04）

* **対応要件ID:** `REQ-V2-02`, `REQ-V2-03`, `REQ-V2-05`

`POST /api/ai/v2/conversations/:id/turns` のリクエスト受信時、以下のステップを厳密な順序で実行する。

```text
[Client] ──POST /turns──▶ [Step 0: 公開状態(AI_DISABLED)確認]
                                │ (false)
                                ▼
                          [Step 1: 入力バリデーション ＆ 会話存在確認(DB)]
                                │ (OK)
                                ▼
                          [Step 2: 同一会話の直近5往復履歴を取得(DB)]
                                │ (最大5レコード)
                                ▼
                          [Step 3: Gemini送信ペイロード(contents)組立]
                                │ (過去user/model × 最大5往復 ＋ 今回user)
                                ▼
                          [Step 4: Gemini API呼び出し (@google/genai)]
                                │ (成功：回答テキスト取得)
                                ▼
                          [Step 5: 1往復のDB保存 ＆ 会話updated_at更新]
                                │ (保存成功)
                                ▼
[Client] ◀──201 Created── [Step 6: 保存した1往復データをJSON応答]
```

### 各ステップの詳細処理

1. **Step 0：公開停止（キルスイッチ）確認**
   * `process.env.AI_DISABLED === 'true'` の場合、以降の処理を一切行わず `503 Service Unavailable` を返す。
2. **Step 1：入力と会話の存在確認**
   * パスパラメータ `:id`（正の整数）およびリクエストボディ `prompt`（1〜1,500文字）を検証する。不正時は `400 Bad Request`。
   * `SELECT id FROM ai_v2_conversations WHERE id = $1` を実行し、対象会話が存在することを確認する。存在しない場合は `404 Not Found`。
3. **Step 2：同じ会話の履歴取得（直近5往復）**
   * `SELECT user_message, model_message FROM ai_v2_turns WHERE conversation_id = $1 ORDER BY id DESC LIMIT 5` を実行する。
   * 取得結果を配列の逆順（古い順→新しい順）に並べ替える。別会話のレコードは `WHERE conversation_id = $1` により完全に除外される。
4. **Step 3：送信コンテキストの組み立て**
   * `@google/genai` の `contents` 配列を以下の構造で構築する（過去最大10要素 ＋ 今回の質問1要素 ＝ 最大11要素）。
   * 過去の各往復（古い順）について：
     1. `{ role: 'user', parts: [{ text: turn.user_message }] }`
     2. `{ role: 'model', parts: [{ text: turn.model_message }] }`
   * 配列の末尾に今回の質問を追加：
     3. `{ role: 'user', parts: [{ text: prompt }] }`
5. **Step 4：Gemini API呼び出し**
   * 環境変数 `GEMINI_API_KEY` および `GEMINI_MODEL`（デフォルト設定値：`gemini-3.5-flash-lite`）を使用して `@google/genai` クライアントの `models.generateContent` を呼び出す。
   * 応答テキストが空または例外が発生した場合はエラーログを出力し、`502 Bad Gateway` を返して処理を中断する（**Step 5へ進まないためDBに不完全なデータは残らない**）。
6. **Step 5：1往復の保存と会話更新日時の更新**
   * `INSERT INTO ai_v2_turns (conversation_id, user_message, model_message) VALUES ($1, $2, $3) RETURNING ...` により、今回の質問と回答を1往復として保存する。
   * 続けて `UPDATE ai_v2_conversations SET updated_at = NOW() WHERE id = $1` を実行し、会話一覧の並び順を最新化する。
7. **Step 6：`201 Created` 応答**
   * 保存された往復オブジェクトを HTTPステータス `201 Created` でクライアントへ返却する。

---

## 6. 画面構成・UI状態遷移設計（DES-V2-05）

* **対応要件ID:** `REQ-V2-01`, `REQ-V2-04`, `REQ-V2-05`, `REQ-V2-07`
* **画面URL:** `/ai/v2/`（`public/ai/v2/index.html`）

### 6.1 画面レイアウト構成（2ペイン構成）

```text
+-----------------------------------------------------------------------+
| ヘッダー：AI対話アプリ V2  [公開停止時バナー：現在新規投稿を停止しています] |
+-----------------------+-----------------------------------------------+
| 【左ペイン：会話一覧】 | 【右ペイン：対話エリア】                       |
|                       | 選択中タイトル：TypeScriptの型定義について      |
| [新規会話タイトル入力] | --------------------------------------------- |
| (最大100文字)         | [通知：過去の履歴が存在します] [過去20件を表示] |
| [ ＋ 新規会話作成 ]   | --------------------------------------------- |
|                       | [User]  interfaceとtypeの違いは何ですか？     |
| --------------------- | [Model] 主な違いは宣言のマージ可否と...       |
| ▶ TypeScriptの型定義  |                                               |
|   SQLのインデックス   | [User]  具体的なコード例を教えてください。    |
|   Expressルーティング | [Model] 以下にinterfaceとtypeの比較例を...    |
|                       | --------------------------------------------- |
|                       | [質問入力欄（最大1,500文字 / 文字数カウンタ）] |
|                       |                                    [ 送信 ]   |
+-----------------------+-----------------------------------------------+
```

### 6.2 主要UIコンポーネントと動作仕様

1. **左ペイン（新規会話作成・一覧切り替え）:**
   * **新規会話作成フォーム:** テキスト入力欄（`maxlength="100"`、プレースホルダ「新しい会話のタイトルを入力」）と「新規作成」ボタンを配置。作成成功時は一覧の先頭に追加し、自動的にその会話を選択状態にする。
   * **会話一覧リスト:** `GET /api/ai/v2/conversations` の結果を描画。選択中の会話はハイライト表示し、クリックすると対象会話の履歴（初期20往復）を読み込んで右ペインを切り替える。
2. **右ペイン上部（過去履歴の追加表示UI）:**
   * 履歴取得APIから `hasMore: true` が返却された場合のみ、メッセージ表示領域の最上部に**「過去の履歴が存在します」**のメッセージと**「過去の履歴をさらに表示（20件）」**ボタンを表示する。
   * ボタンクリック時は現在の表示済み往復数を `offset` に指定し、`limit=20` で追加取得してリストの先頭（上側）へ挿入する。スクロール位置が急変しないよう配慮する。
3. **右ペイン中央（メッセージ表示エリア）:**
   * 会話未選択時は「左のメニューから会話を選択するか、新しい会話を作成してください」と案内を表示する。
   * 選択時は `turns` を上から時系列順に描画し、各往復について「質問（User）」と「回答（Model）」を視覚的に区別して表示する。新規送信成功時は最下部へ自動スクロールする。
4. **右ペイン下部（質問送信フォーム）:**
   * テキストエリア（`maxlength="1500"`）、リアルタイム文字数カウンタ（`0 / 1500`）、および「送信」ボタンを配置。
   * 送信中は多重送信を防ぐため入力欄・送信ボタンを無効化し、「AIが回答を生成中...」のローディング表示を行う。
   * **送信成功時:** 入力欄をクリアし、返却された1往復をメッセージ表示エリアの末尾に追加する。
   * **送信失敗時:** 入力欄のテキストを**クリアせずそのまま保持**し、エラーメッセージを表示して再送信できるようにする。

---

## 7. 失敗時・公開停止時（キルスイッチ）制御設計（DES-V2-06）

* **対応要件ID:** `REQ-V2-05`, `REQ-V2-07`

### 7.1 失敗時（エラー発生時）の動作仕様

| エラー種別 | 発生箇所 | HTTPステータス | 画面（UI）側の動作 | DB・システム整合性 |
| :--- | :--- | :--- | :--- | :--- |
| **入力バリデーションエラー**<br>（空文字、タイトル100文字超、質問1,500文字超） | API受信時 / UI入力時 | `400 Bad Request` | 具体的な文字数・入力エラー内容を画面に表示する。入力内容は保持する。 | DB・Geminiともに未実行のため影響なし。 |
| **対象会話が存在しない**<br>（削除済み・不正ID指定） | 履歴取得 / 質問送信時 | `404 Not Found` | 「指定された会話が見つかりません」と表示し、会話一覧の再取得を促す。 | DB・Geminiともに未実行のため影響なし。 |
| **Gemini APIエラー**<br>（タイムアウト、クォータ超過、APIキー不正、空応答） | Step 4（AI呼び出し） | `502 Bad Gateway` / `503` | 「AIからの応答取得に失敗しました。時間をおいて再送信してください」と表示。**入力中の質問文は消さずに残す。** | Step 5（DB保存）を実行しないため、不完全なレコードや空回答は一切保存されない。 |
| **DB接続・クエリエラー**<br>（Neon接続断、プールタイムアウト） | Step 1, 2, 5 / 取得API | `500 Internal Server Error` | 「データの保存または取得に失敗しました」とエラー通知を表示。質問送信時は入力文を保持する。 | `finally` 句等でコネクションを確実に解放し、プールの枯渇を防ぐ。 |

### 7.2 公開停止時（`AI_DISABLED=true`）の動作仕様

`.env` の `AI_DISABLED=true` が設定されている場合、**「新規投稿（新規会話作成・質問送信）の全面禁止」**と**「既存会話の閲覧維持」**をフロントエンド・バックエンド双方で強制する。

1. **バックエンドAPIの制御（`src/apps/ai/v2/aiRouter.ts`）:**
   * `POST /api/ai/v2/conversations` および `POST /api/ai/v2/conversations/:id/turns` に対して、環境変数判定ガード（`process.env.AI_DISABLED === 'true'`）を適用する。
   * 停止中の場合、処理を実行せず以下のレスポンスを即座に返却する（Gemini API呼び出し・DB書き込みは一切行わない）。
     * **HTTPステータス:** `503 Service Unavailable`
     * **レスポンスBody:** `{ "error": "現在、AI対話アプリの新規投稿は停止されています。", "aiDisabled": true }`
   * `GET /api/ai/v2/conversations` および `GET /api/ai/v2/conversations/:id/turns` は停止中も正常稼働（`200 OK`）させ、過去の学習履歴の確認を可能とする。
2. **フロントエンド画面の制御（`public/ai/v2/index.html`）:**
   * 初期ロード時の `GET /api/ai/v2/conversations` で `aiDisabled: true` を受信した場合、または `POST` APIから `503` を受信した場合、以下のUI制御を行う。
     * 画面上部に公開停止中バナー（「現在、公開停止設定により新規会話の作成および質問の送信を停止しています（過去の履歴閲覧のみ可能）」）を表示する。
     * 左ペインの「新規会話タイトル入力欄」「新規作成ボタン」を `disabled` にする。
     * 右ペインの「質問入力欄」「送信ボタン」を `disabled` にする。
     * 左ペインの会話クリックによる切り替え、および右ペインの「過去の履歴をさらに表示（20件）」操作は通常通り利用可能とする。