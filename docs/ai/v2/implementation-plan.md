# AI対話アプリ V2 実装手順書

* **文書管理ID:** DOC-AI-V2-IMP
* **保存先パス:** `docs/ai/v2/implementation-plan.md`
* **参照文書:** `docs/ai/v2/requirements.md`、`docs/ai/v2/design.md`
* **対象環境:** Node.js / TypeScript / Express / PostgreSQL (Neon) / `@google/genai`

---

## 0. 実装前のルールと進め方

1. **V1・他機能への非干渉:** V1（`/ai/`、`/api/ai`、`ai_qa_logs`）および TOP（`/`）・TODOアプリ（`/todo`、`/todo_v1`、`/api/v1/todo`）の既存コード・テーブルは変更しない。

2. **ファイル命名規約:** `v2/` ディレクトリ配下に配置するため、ファイル名には `V2` を含めない。

3. **要確認事項の扱い:** 本手順書内で `【要確認】` と記載されたコマンドや既存ファイル（`package.json`、`db.ts`、`aiController.ts`、`aiMiddleware.ts`、`docs/ai/v2/requirements.md` の原文など）は、各タスク開始前にローカルリポジトリの実ファイルを確認してから進めること。
4. **進捗記録:** 各タスクの「実測・判定（学生記入欄）」は、作業・テスト完了後に各自で記入する。

---

## フェーズ1：V1の疎通確認とブランチ作成

### TASK-V2-01：既存リポジトリ構成・未添付ファイルの確認と作業ブランチ作成

* **対応REQ / DES:** `REQ-V2-06` / `DES-V2-01`

* **確認先・変更ファイル:**
* 確認先：`docs/ai/v2/requirements.md`、`package.json`、`db.ts`、`src/apps/ai/aiController.ts`、`src/apps/ai/aiMiddleware.ts`、`public/ai/index.html`、`sql/` 配下
* Git操作：作業用ブランチ（例：`feature/ai-v2`）

* **具体的な操作:**

1. `git status` で作業ツリーがクリーンであることを確認し、`main`（または基準ブランチ）から V2 実装用ブランチを作成する。

```bash
git checkout -b feature/ai-v2

```

2. `【要確認】` `package.json` の `scripts`（開発サーバー起動コマンド、ビルドコマンド等）およびインストール済みパッケージ（`@google/genai`、`pg`、`express`）を確認する。

3. `【要確認】` `src/apps/ai/aiController.ts` と `src/apps/ai/aiMiddleware.ts` を開き、V1のエラーレスポンス形式・`checkAiEnabled` の実装・Geminiモデル参照方法（`process.env.GEMINI_MODEL` 等）を確認する。

4. `【要確認】` `docs/ai/v2/requirements.md` を開き、設計書（`DOC-AI-V2-DES`）と要件ID（`REQ-V2-01`〜`07`）に差異がないか確認する。

* **期待する結果:**
* V2用の作業ブランチが作成され、V1の実装パターンとプロジェクト固有のコマンドが把握できていること。

* **次へ進む条件:**
* 作業ブランチ上でコマンド実行および実ファイル確認が完了していること。

* **実測・判定（学生記入欄）:**
* 作成ブランチ名：`（記入）`
* 確認した起動コマンド：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）

---

### TASK-V2-02：V1・TOP・TODOの事前疎通確認（ベースライン確認）

* **対応REQ / DES:** `REQ-V2-06` / `DES-V2-01`

* **確認先・変更ファイル:**
* 確認先：`.env`、`index.ts`、ローカル起動サーバー（`http://localhost:3000`）

* **具体的な操作:**

1. `.env` に `DATABASE_URL`、`GEMINI_API_KEY`、`GEMINI_MODEL`、`AI_DISABLED=false` が設定されていることを確認する（値の漏洩に注意し、Gitへコミットしないこと）。
2. `【要確認】` `package.json` に定義された開発サーバー起動コマンド（例：`npm run dev` または `npx ts-node index.ts`）でサーバーを起動する。
3. ブラウザまたは `curl` で以下の既存URLにアクセスし、V2実装前の正常動作を確認する。

* TOP：`GET http://localhost:3000/`（`テスト！ AIチャット作成` が表示されること）
* DB接続：`GET http://localhost:3000/api/db-check`（`{"status":"ok","database":"connected"}` が返ること）
* TODO：`GET http://localhost:3000/todo` または `GET http://localhost:3000/todo_v1`
* AI V1画面：`GET http://localhost:3000/ai/`（または `/ai/index.html`）
* AI V1 API：`GET http://localhost:3000/api/ai/history` および `POST http://localhost:3000/api/ai/ask`

* **期待する結果:**
* すべての既存ルートがエラーなく動作し、V1で質問送信・履歴取得ができること。

* **次へ進む条件:**
* V1および既存機能のベースライン動作に問題がないこと。

* **実測・判定（学生記入欄）:**
* V1 `/api/ai/history` 応答ステータス：`（記入）`
* V1 `/api/ai/ask` 動作確認結果：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）

---

## フェーズ2：V2テーブル・会話作成・一覧・履歴API

### TASK-V2-03：V2専用データベーステーブルの作成（DDL作成と適用）

* **対応REQ / DES:** `REQ-V2-01`, `REQ-V2-03`, `REQ-V2-04`, `REQ-V2-06` / `DES-V2-02`

* **確認先・変更ファイル:**
* 新規作成：`sql/ai/v2/032_create_ai_v2_qa_logs.sql`

* 確認先：`sql/` 配下の既存SQLファイル（連番・記述形式の確認）

* **具体的な操作:**

1. `sql/ai/v2/` ディレクトリを作成し、`sql/ai/v2/032_create_ai_v2_qa_logs.sql` を新規作成する。

2. 設計書 `DES-V2-02` に基づき、以下のDDLを記述する。

* `ai_v2_conversations` テーブル（`id` PK、`title VARCHAR(100) NOT NULL` + 1〜100文字の `CHECK` 制約、`created_at`、`updated_at`）

* `ai_v2_turns` テーブル（`id` PK、`conversation_id` FK `REFERENCES ai_v2_conversations(id) ON DELETE CASCADE`、`user_message TEXT NOT NULL` + 1〜1,500文字の `CHECK` 制約、`model_message TEXT NOT NULL` + 1文字以上の `CHECK` 制約、`created_at`）

* インデックス `idx_ai_v2_turns_conv_id ON ai_v2_turns (conversation_id, id DESC)`

3. `【要確認】` 既存プロジェクトのSQL実行手順（`psql "$DATABASE_URL" -f sql/ai/v2/032_create_ai_v2_qa_logs.sql` またはNeon SQL Editor等）を用いてDDLを実行する。
4. `\dt` や `SELECT` 文で `ai_v2_conversations` と `ai_v2_turns` が作成されたこと、および既存の `ai_qa_logs` テーブルが影響を受けていないことを確認する。

* **期待する結果:**
* 2つのV2専用テーブルとインデックスが作成され、V1の `ai_qa_logs` に変更がないこと。

* **次へ進む条件:**
* DB上に `ai_v2_conversations` と `ai_v2_turns` が存在し、制約が有効であること。

* **実測・判定（学生記入欄）:**
* SQL実行結果・テーブル確認結果：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）

---

### TASK-V2-04：V2リポジトリ層（DBアクセス）の実装

* **対応REQ / DES:** `REQ-V2-01`, `REQ-V2-03`, `REQ-V2-04`, `REQ-V2-06` / `DES-V2-01`, `DES-V2-02`

* **確認先・変更ファイル:**
* 新規作成：`src/apps/ai/v2/aiRepository.ts`

* 確認先：`db.ts`（`pool` のエクスポート形式）

* **具体的な操作:**
1. `src/apps/ai/v2/` ディレクトリを作成し、`aiRepository.ts` を新規作成する。

2. `../../../db` から既存の `pool` をインポートする（`pool` の最大接続数 `max: 2` を意識し、トランザクションを長時間保持せず単発の `pool.query` で都度接続を解放する）。

3. 以下のDB操作関数を実装する。

* `findAllConversations()`: `SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM ai_v2_conversations ORDER BY updated_at DESC, id DESC`

* `createConversation(title: string)`: `INSERT INTO ai_v2_conversations (title) VALUES ($1) RETURNING id, title, created_at AS "createdAt", updated_at AS "updatedAt"`
* `findConversationById(id: number)`: `SELECT id, title, created_at AS "createdAt", updated_at AS "updatedAt" FROM ai_v2_conversations WHERE id = $1`
* `findTurnsByConversationId(conversationId: number, limit: number, offset: number)`: `SELECT id, user_message AS "userMessage", model_message AS "modelMessage", created_at AS "createdAt" FROM ai_v2_turns WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3`

* `findRecentTurnsForContext(conversationId: number, limit = 5)`: 直近5往復を取得し、配列を逆順（`id ASC`）に並べ替えて返す

* `createTurnAndTouchConversation(conversationId: number, userMessage: string, modelMessage: string)`: `ai_v2_turns` への `INSERT` と `ai_v2_conversations` の `updated_at = NOW()` 更新を行う

* **期待する結果:**
* TypeScriptの型エラーがなく、すべてのクエリがプレースホルダ（`$1`, `$2`...）によるパラメータバインドで実装されていること。

* **次へ進む条件:**
* `aiRepository.ts` のコンパイルエラーがゼロであること。

* **実測・判定（学生記入欄）:**
* 確認内容：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）

---

### TASK-V2-05：会話一覧・新規会話作成・履歴取得APIの実装とマウント

* **対応REQ / DES:** `REQ-V2-01`, `REQ-V2-04`, `REQ-V2-06`, `REQ-V2-07` / `DES-V2-01`, `DES-V2-03`, `DES-V2-06`

* **確認先・変更ファイル:**
* 新規作成：`src/apps/ai/v2/aiService.ts`、`src/apps/ai/v2/aiRouter.ts`（必要に応じて `aiController.ts` / `aiMiddleware.ts`）

* 既存変更：`index.ts`（V2ルーターのマウント追加のみ）

* **具体的な操作:**
1. `src/apps/ai/v2/aiService.ts` に以下のビジネスロジックを実装する。
   * **会話一覧取得:** `findAllConversations()` の結果と `aiDisabled: process.env.AI_DISABLED === 'true'` を返す。
   * **新規会話作成:** `title` の型・`trim()` 後1〜100文字チェック（違反時はステータス400エラー）を行い、DBへ保存する。
   * **履歴取得:** `:id` の正の整数チェック、`limit`（デフォルト20）・`offset`（デフォルト0）の検証、会話存在確認（未存在時は404）、`limit + 1` 件取得による `hasMore` 判定、および返却配列の時系列順（`id ASC`）並べ替えを行う。
2. `src/apps/ai/v2/aiRouter.ts` に以下のエンドポイントと `AI_DISABLED === 'true'` 判定ガード（停止時は `503 Service Unavailable` を返却）を実装する。
   * `GET /conversations`（停止中も許可）
   * `POST /conversations`（停止中は `503` で拒否）
   * `GET /conversations/:id/turns`（停止中も許可）
3. `index.ts` を編集し、`app.use('/api/ai', aiRouter);` の近くに V2 ルーターを追加する（**必ずグローバルエラーハンドラーより前に配置**すること）。

```ts
import aiV2Router from './src/apps/ai/v2/aiRouter';
// ...
app.use('/api/ai/v2', aiV2Router);

```

1. `curl` 等で `POST /api/ai/v2/conversations`、`GET /api/ai/v2/conversations`、`GET /api/ai/v2/conversations/:id/turns` の正常系（201 / 200）と異常系（空タイトル400、101文字400、存在しないID 404）を検証する。

* **期待する結果:**
* 会話の作成・一覧取得・空の履歴取得およびバリデーション・404応答が仕様通り動作すること。

* **次へ進む条件:**
* 上記3つのAPIが `curl` で期待通りのJSON・HTTPステータスを返すこと。

* **実測・判定（学生記入欄）:**
* `POST /api/ai/v2/conversations` 応答：`（記入）`
* `GET /api/ai/v2/conversations` 応答：`（記入）`
* 異常系（400 / 404）応答：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）

---

## フェーズ3：文脈付き送信と保存

### TASK-V2-06：文脈付き質問送信・Gemini連携・1往復保存APIの実装

* **対応REQ / DES:** `REQ-V2-02`, `REQ-V2-03`, `REQ-V2-05`, `REQ-V2-07` / `DES-V2-03`, `DES-V2-04`, `DES-V2-06`

* **確認先・変更ファイル:**
* 変更：`src/apps/ai/v2/aiService.ts`、`src/apps/ai/v2/aiRouter.ts`

* 確認先：`src/apps/ai/aiController.ts`（V1での `@google/genai` 呼び出し記述）

* **具体的な操作:**

1. `src/apps/ai/v2/aiService.ts` に `DES-V2-04` の Step 1〜6 に従い質問送信処理（`postTurn`）を実装する。

* **Step 1（検証・存在確認）:** `:id`（正の整数）と `prompt`（`trim()` 後1〜1,500文字）を検証（不正時は400）。会話存在確認（未存在時は404）。
* **Step 2（直近5往復取得）:** `findRecentTurnsForContext(conversationId, 5)` で同一会話の最新5往復を古い順で取得。
* **Step 3（`contents` 組立）:** 過去往復を `{ role: 'user', parts: [{ text }] }` と `{ role: 'model', parts: [{ text }] }` のペアで並べ、末尾に今回の `{ role: 'user', parts: [{ text: prompt }] }` を追加。
* **Step 4（Gemini API呼び出し）:** `GEMINI_API_KEY` 未設定時は `503`、`@google/genai` 呼び出し失敗・空テキスト時はエラーログ出力のうえ `502 Bad Gateway` をスローし、**Step 5 を実行しない**。
* **Step 5（DB保存・更新日時更新）:** `createTurnAndTouchConversation` で1往復を保存し、`ai_v2_conversations.updated_at` を更新（DB失敗時は `500`）。

1. `src/apps/ai/v2/aiRouter.ts` に `POST /conversations/:id/turns` を追加し、`AI_DISABLED === 'true'` 判定ガードを適用する（停止時は `503`、成功時は `201 Created` で `{ turn: ... }` を返却）。


3. `curl` 等で同一会話へ2回連続で質問を送信し、2回目の回答が1回目の文脈を踏まえていること、および DB の `ai_v2_turns` に2レコード保存されていることを確認する。




* **期待する結果:**
* 直近5往復までの文脈を引き継いだ回答が生成され、1往復単位でDBへ保存されること。またAI失敗時にDBへゴミデータが残らないこと。




* **次へ進む条件:**
* API単体で2往復以上の文脈付き対話と履歴再取得（`GET /conversations/:id/turns`）が正常に動作すること。




* **実測・判定（学生記入欄）:**
* 1往復目・2往復目の文脈継承確認結果：`（記入）`
* バリデーション（0文字・1,501文字・存在しないID）結果：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）



---

## フェーズ4：画面（フロントエンド）

### TASK-V2-07：V2画面レイアウトと会話作成・一覧・選択UIの実装

* **対応REQ / DES:** `REQ-V2-01`, `REQ-V2-06` / `DES-V2-01`, `DES-V2-05`


* **確認先・変更ファイル:**
* 新規作成：`public/ai/v2/index.html`（必要に応じて同ディレクトリ内に CSS / JS を分割可）


* 確認先：`public/ai/index.html`（V1のスタイルやXSS対策エスケープ処理の参考）


* **具体的な操作:**
1. `public/ai/v2/index.html` を作成する（`index.ts` で `public` が静的公開されているため、`http://localhost:3000/ai/v2/` でアクセス可能）。


2. 設計書 `DES-V2-05` に基づき、2ペイン構成（左ペイン：新規会話作成フォーム＋会話一覧、右ペイン：選択中会話の対話エリア）を実装する。


3. 画面初期表示時に `GET /api/ai/v2/conversations` を呼び出し、左ペインに会話一覧を描画する。


4. 新規会話作成フォーム（`maxlength="100"`、入力文字数確認）から `POST /api/ai/v2/conversations` を実行し、作成成功後に一覧先頭へ追加して自動選択状態にする実装を行う。


5. 左ペインの会話クリック時に選択中ハイライトを切り替え、右ペインのタイトル更新と履歴取得（`GET /api/ai/v2/conversations/:id/turns?limit=20&offset=0`）を行う。


6. ユーザー入力・AI応答の表示には必ずHTMLエスケープ（`textContent` 等）を用い、XSSを防止する。


* **期待する結果:**
* ブラウザで `/ai/v2/` を開き、新規会話の作成・一覧表示・会話切り替えがエラーなく動作すること。




* **次へ進む条件:**
* 複数会話を作成し、左ペインのクリックで右ペインの表示対象会話が切り替わること。




* **実測・判定（学生記入欄）:**
* 画面表示・会話作成・切り替え確認結果：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）



---

### TASK-V2-08：質問送信UI・過去20件追加読み込み・公開停止表示制御の実装

* **対応REQ / DES:** `REQ-V2-02`, `REQ-V2-04`, `REQ-V2-05`, `REQ-V2-07` / `DES-V2-05`, `DES-V2-06`


* **確認先・変更ファイル:**
* 変更：`public/ai/v2/index.html`




* **具体的な操作:**
1. **質問送信フォームの実装:**
* テキストエリア（`maxlength="1500"`）、リアルタイム文字数カウンタ（`0 / 1500`）、送信ボタンを配置する。


* 送信中は入力欄・送信ボタンを `disabled` にし、「AIが回答を生成中...」のローディング表示を行う。


* 送信成功時は入力欄をクリアして最新1往復を末尾に追加・最下部へスクロールし、左ペインの会話一覧の並び順も最新化する。


* **送信失敗時は入力欄のテキストを消さずに保持し**、エラーメッセージを表示する。




2. **過去履歴の追加表示UI（20往復＋20件追加）の実装:**
* `hasMore: true` の場合のみ、履歴エリア上部に「過去の履歴が存在します」の案内と「過去の履歴をさらに表示（20件）」ボタンを表示する。


* ボタン押下時に現在の表示往復数を `offset`、`limit=20` として追加取得し、既存表示の上側へ挿入する（全件表示し終えて `hasMore: false` になったらボタンを非表示にする）。




3. **公開停止（`AI_DISABLED=true`）時のUI制御:**
* 初期ロード時の `aiDisabled: true` または `POST` APIの `503` 応答を受信した際、画面上部に公開停止中バナーを表示し、新規会話作成フォームおよび質問送信フォームを `disabled` にする（会話一覧の切り替えと過去履歴の追加表示は操作可能のまま維持する）。






* **期待する結果:**
* 質問送信、ローディング、失敗時の入力保持、20件超履歴の追加読み込み、公開停止中のUI制限がすべて設計通り動作すること。




* **次へ進む条件:**
* ブラウザ操作で一通りの対話フローが完結し、コンソールエラーが出ていないこと。


* **実測・判定（学生記入欄）:**
* 質問送信・文字数カウンタ・追加読み込み確認結果：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）



---

## フェーズ5：総合テストと提出

### TASK-V2-09：機能・異常系・非干渉・公開停止の総合動作確認テスト

* **対応REQ / DES:** `REQ-V2-01`〜`REQ-V2-07` / `DES-V2-01`〜`DES-V2-06`


* **確認先・変更ファイル:**
* 対象：ブラウザ（`/ai/v2/`、`/ai/`、`/`、`/todo`）、API（`/api/ai/v2/*`）、`.env`、DB（`ai_v2_conversations`、`ai_v2_turns`、`ai_qa_logs`）




* **具体的な操作（以下の全7項目を順に実施し、下のテスト結果表に記録する）:**
1. **同じ会話での追加質問（文脈維持・5往復上限）:**
* 新規会話を作成し、前提条件を含む質問（例：「私の好きな食べ物はカレーです」）を送信後、「私の好きな食べ物は何ですか？」と追加質問して文脈が通じることを確認する。さらに6往復以上対話し、直近5往復の文脈で動作することを確認する。




2. **別会話への文脈混入防止:**
* 会話Aで伝えた固有名詞や前提条件について、新規作成した会話Bで質問し、会話Aの内容が混入していないことを確認する。




3. **再読み込み後の再開と20件追加表示:**
* ブラウザをリロード（`F5`）し、会話一覧から既存の会話を選択して履歴が復元され、そのまま続きの質問ができることを確認する。また21往復以上の会話で初期20往復表示＋「過去の履歴をさらに表示（20件）」ボタンで古い履歴が読み込めることを確認する。




4. **不正または存在しないID・入力値への応答:**
* `GET /api/ai/v2/conversations/999999/turns` や `POST /api/ai/v2/conversations/abc/turns`、`POST /api/ai/v2/conversations/999999/turns` を実行し、`404` または `400` が返りサーバーがクラッシュしないことを確認する。タイトル101文字、質問1,501文字、空白のみ送信も `400` になることを確認する。




5. **AI失敗・DB保存失敗時の挙動と入力保持:**
* 一時的に `.env` の `GEMINI_API_KEY` を不正値（例：`invalid_key`）に変更してサーバーを再起動し、画面から質問を送信する。エラー通知が表示されること、**入力した質問文がフォームにそのまま残っていること**、DBの `ai_v2_turns` に不完全なレコードが保存されていないことを確認後、APIキーを元に戻す。


* DB接続エラー時もサーバーが落ちずエラー応答と入力保持が行われることを確認する（可能な範囲で接続文字列テストまたはコードレビューで確認）。




6. **V1とTOP・TODOへの影響確認:**
* TOP（`/`）、TODO（`/todo`、`/todo_v1`）、AI V1（`/ai/` での質問送信・履歴表示）を操作し、V2実装前と変わらず正常動作することを確認する。




7. **V2 API停止時（`AI_DISABLED=true`）の動作:**
* `.env` を `AI_DISABLED=true` に変更してサーバーを再起動する。


* `/ai/v2/` を開き、公開停止バナー表示・新規作成と質問送信の無効化・既存会話と履歴の閲覧維持を確認する。


* `curl` で `POST /api/ai/v2/conversations` と `POST /api/ai/v2/conversations/:id/turns` を直接叩き、`503 Service Unavailable` で拒否されることを確認する。確認後、`AI_DISABLED=false` に戻す。






* **期待する結果:**
* 全7項目のテストがすべて期待通りの動作となり、サーバー異常終了やデータ不整合が発生しないこと。




* **次へ進む条件:**
* 全テスト項目の判定が `OK` であること。



#### テスト結果記録表（学生記入欄）

| No | テスト観点 | 具体的な確認操作 | 実測結果（HTTPステータス・画面挙動） | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 同じ会話での追加質問 | 同一会話で連続質問（文脈継承・5往復超） |  | `[ ] OK  [ ] NG` |
| 2 | 別会話への文脈混入防止 | 会話Aの前提を会話Bで質問 |  | `[ ] OK  [ ] NG` |
| 3 | 再読み込み後の再開・20件追加 | リロード後の履歴復元・続き送信・20件追加表示 |  | `[ ] OK  [ ] NG` |
| 4 | 不正または存在しないID・文字数超過 | 存在しないID(999999)・文字列ID(abc)・文字数超過 |  | `[ ] OK  [ ] NG` |
| 5 | AI失敗・DB保存失敗 | APIキー不正時のエラー表示・入力文保持・DB未保存 |  | `[ ] OK  [ ] NG` |
| 6 | V1とTOP・TODOへの影響 | `/`、`/todo`、`/todo_v1`、`/ai/` の正常動作 |  | `[ ] OK  [ ] NG` |
| 7 | V2 API停止時（`AI_DISABLED=true`） | 閲覧許可・UI無効化・POST APIの `503` 拒否 |  | `[ ] OK  [ ] NG` |

---

### TASK-V2-10：ドキュメント最終確認・コミット・提出

* **対応REQ / DES:** `REQ-V2-01`〜`REQ-V2-07` / `DES-V2-01`〜`DES-V2-06`


* **確認先・変更ファイル:**
* 確認先：`git status`、`git diff`、`docs/ai/v2/implementation-plan.md`、`.env`（復元確認）


* **具体的な操作:**
1. テスト用に書き換えた `.env`（`GEMINI_API_KEY`、`AI_DISABLED=false`）が通常運用状態に戻っていることを必ず確認する。


2. `git status` と `git diff` を実行し、不要な一時ファイルや機密情報が含まれていないこと、および V1・TODO の不要な変更がないことを確認する。


3. 実装過程で仕様の補足やファイル構成の微調整があった場合は、`docs/ai/v2/design.md` および本手順書の該当箇所を更新し、すべてのタスク欄に実測・判定を記録する。
4. `【要確認】` プロジェクトのビルド／型チェックコマンド（例：`npm run build` または `npx tsc --noEmit`）があれば実行し、エラーがないことを確認する。
5. 変更ファイルをステージング・コミットし、指定の提出方法（GitHubプッシュ / PR作成 / 成果物提出フォーム等）に従って提出する。
```bash
git add docs/ai/v2/implementation-plan.md sql/ai/v2/ src/apps/ai/v2/ public/ai/v2/ index.ts
git commit -m "feat(ai-v2): implement multi-turn conversation app V2"

```




* **期待する結果:**
* クリーンなコミット履歴で全成果物とテスト記録済みの実装手順書が提出されていること。


* **次へ進む条件:**
* 提出完了（全工程完了）。


* **実測・判定（学生記入欄）:**
* コミットハッシュ / PR URL：`（記入）`
* 判定：`[ ] OK  [ ] NG`（備考：          ）