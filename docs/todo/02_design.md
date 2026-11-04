# TODOアプリ V1 設計書 (`docs/todo/02_design.md`)

## 1. 作るものとファイルの役割

本設計書では、既存の Express ＋ TypeScript ＋ EJS 構成に新規追加する TODOアプリ（v1）の内部構造を定義します。

### ファイル構成と役割

* **`index.ts`** (共通・既存): アプリケーションのエントリーポイント。`todoRouter` を適切なパスにマウントする。**（※マウント先のプレフィックスや既存コードとの統合方法は要確認）**
* **`src/apps/todo/todoRouter.ts`** (新規): `/api/v1/todos` に対するルーティング定義（GET, POST, PATCH, DELETE）。
* **`src/apps/todo/todoController.ts`** (新規): リクエストの受け取り、入力値の検証（バリデーション）、Modelの呼び出し、レスポンスの返却（JSON / ステータスコード制御）を担当。
* **`src/apps/todo/todoModel.ts`** (新規): Neon PostgreSQL（データベース）との通信・SQL実行を担当。
* **`views/todo/index.ejs`** (新規): TODO一覧・登録・操作を行うクライアント画面。
* **`public/todo/todo.js`** (新規): ブラウザ側でバックエンドのREST APIを呼び出すための `TodoApi` クラスおよび画面操作ロジックを実装。
* **`sql/todo/020_create_todo_tasks.sql`** (新規): TODO用テーブル作成スクリプト。

---

## 2. リクエストはどこを通るか

ブラウザ画面からの操作、またはAPIリクエストの基本的なデータフローは以下の通りです。

``` text
[ ブラウザ / 画面 (views/todo/index.ejs & public/todo/todo.js) ]
       │  (Fetch API / JSON)
       ▼
[ index.ts (Express App) ] ──( app.use() )──> [ todoRouter.ts (Router) ]
                                                       │
                                                       ▼
                                            [ todoController.ts (Controller) ]
                                                       │
                                                       ▼
                                              [ todoModel.ts (Model) ]
                                                       │
                                                       ▼
                                         [ Neon PostgreSQL (Database) ]

```

---

## 3. DBの設計

データベースには学生自身の Neon PostgreSQL を使用します。

### テーブル名: `todo_tasks` (`sql/todo/020_create_todo_tasks.sql`)

| カラム名 | データ型 | NULL許容 | 初期値 / 制約 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | `SERIAL` | 否 | `PRIMARY KEY` | タスクID（1以上の自動採番整数） |
| `title` | `VARCHAR(100)` | 否 | `NOT NULL` | タスクのタイトル（1〜100文字） |
| `completed` | `BOOLEAN` | 否 | `DEFAULT FALSE NOT NULL` | 完了フラグ（未完了: false, 完了: true） |
| `created_at` | `TIMESTAMPTZ` | 否 | `DEFAULT CURRENT_TIMESTAMP NOT NULL` | 作成日時 |

---

## 4. APIの共通ルール

* **ベースURL:** `/api/v1/todos`
* **リクエストヘッダー:** `Content-Type: application/json` （POST, PATCH時）
* **共通レスポンス形式:**
* 成功時（データあり）: `{"data": [...]}` または作成・更新されたオブジェクト。
* 成功時（データなし / DELETE）: 204 の場合は本文なし。
* エラー時: `{"error": {"code": ステータスコード, "message": "エラーメッセージ"}}`

---

## 5. 各機能の設計 (REQ-01 〜 REQ-04)

| 項目 | 5.1 REQ-01: 一覧取得 | 5.2 REQ-02: 登録 | 5.3 REQ-03: 完了状態変更 | 5.4 REQ-04: 削除 |
| --- | --- | --- | --- | --- |
| **HTTPメソッド** | `GET` | `POST` | `PATCH` | `DELETE` |
| **URL** | `/api/v1/todos` | `/api/v1/todos` | `/api/v1/todos/:id` | `/api/v1/todos/:id` |
| **リクエスト本文** | なし | `{"title": "string"}` | `{"completed": boolean}` | なし |
| **成功時ステータス** | `200 OK` | `201 Created` | `200 OK` | `204 No Content` |
| **成功時レスポンスJSON** | `{"data": [...]}` （0件時は `{"data": []}`） | 作成されたタスクオブジェクト | 更新されたタスクオブジェクト | 本文なし（`""`） |
| **失敗時ステータス** | `500`, `503` | `400`, `422`, `500`, `503` | `400`, `422`, `404`, `500`, `503` | `400`, `404`, `500`, `503` |
| **DB処理** | `SELECT id, title, completed, created_at FROM todo_tasks ORDER BY id DESC;` | `INSERT INTO todo_tasks (title) VALUES ($1) RETURNING ...;` | `UPDATE todo_tasks SET completed = $1 WHERE id = $2 RETURNING ...;` | `DELETE FROM todo_tasks WHERE id = $1;` |
| **TodoApiメソッド** | `async getAll()` | `async create(title)` | `async updateCompleted(id, completed)` | `async delete(id)` |
| **確認方法** | ブラウザアクセス または `curl` でのGET実行 | フォーム入力・登録ボタン または `curl` でのPOST実行 | チェックボックスのトグル操作 または `curl` でのPATCH実行 | 削除ボタン押下 または `curl` でのDELETE実行 |

---

## 6. 画面とTodoApiの設計

* **画面 (`views/todo/index.ejs`):**
* 画面パス: `/todo` （サーバー側でルーティング設定し、EJSをレンダリングする。**※ルーティングの登録方法は要確認**）
* 構成: タイトル入力フォーム、TODOリスト表示エリア（DOM動的描画）。

* **TodoApi クラス (`public/todo/todo.js`):**
* ブラウザ側から `fetch` を用いてバックエンドAPIと通信するラッパークラス。
* 実装メソッド: `getAll()`, `create(title)`, `updateCompleted(id, completed)`, `delete(id)`。エラー時は例外をスローし、画面側で適切にハンドリングする。

---

## 7. エラーはどこで処理するか

* **Controller層:** リクエストパラメータの型チェック、入力値のバリデーション（`title` の文字数・trim処理、`id` の数値判定、`completed` の型判定）を行い、不正な場合は `400` または `422` を返却する。データベース未達やクエリ失敗時は `try-catch` で捕捉し、ログ出力の上 `500` または `503` を返却する。
* **Model層:** データベース操作に伴うエラー（接続エラー等）をスローし、Controller層へ伝播させる。
* **クライアント（`todo.js`）:** APIからのエラーレスポンス（4xx, 5xx）を検知し、ユーザーにアラートやトースト等でフィードバックを提供する。

---

## 8. 実装への注意事項

* `index.ts` へのルーター登録は最小限に抑え、ルーティングの本体は `src/apps/todo/todoRouter.ts` にカプセル化する。
* 既存の `/` および `/api/db-check` のルート・接続ロジックには一切影響を与えないようにする。
* 共通の `DATABASE_URL` 環境変数をそのまま利用し、Vercelデプレ時とローカル開発時で挙動が変わらないようにする。
* 個人情報は一切扱わず、架空のテストデータのみを使用すること。

---

設計書の作成にあたり、以下の点について確認させてください。
`index.ts` において、`todoRouter` をマウントする際のプレフィックス（例: `app.use('/todo', todoRouter)` なのか、あるいはAPIルーターと画面用ルーターを分離するのか）について、すでに想定している構成があれば教えてください。
