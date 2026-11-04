# TODOアプリ 設計書 (`docs/todo/02_design.md`)

## 1. アーキテクチャ概要とファイル配置

本アプリケーションは、Express ＋ TypeScript ＋ EJS によるMVCアーキテクチャを採用し、フロントエンドはTailwind CSSによるスタイリングと、ブラウザからのFetch APIを用いた非同期通信（SPA風の操作感）で実装します。

### ディレクトリ・ファイル構成

```text
プロジェクト直下/
├── index.ts                  # エントリーポイント（Expressアプリ起動、ルーティング統合）
├── db.ts                     # Neon PostgreSQL 接続クライアント（DATABASE_URL利用）
├── package.json
├── tsconfig.json
├── public/
│   └── todo/
│       └── todo.js           # ブラウザ用JavaScript（TodoApiクラス含む）
├── views/
│   └── todo/
│       └── index.ejs         # TODO画面（Tailwind CSS適用）
├── src/
│   └── apps/
│       └── todo/
│           ├── todoRouter.ts   # ルーター（/api/v1/todos の定義）
│           ├── todoController.ts # コントローラー（リクエスト・レスポンス制御）
│           └── todoModel.ts    # モデル（DBアクセス・SQL発行）
├── docs/
│   └── todo/
│       ├── 01_requirements.md
│       ├── 02_design.md (本書)
│       ├── 03_implementation_plan.md
│       ├── 04_test_results.md
│       └── v2/
└── sql/
    ├── README.md
    ├── 000_check_connection.sql
    └── todo/
        └── 020_create_todo_tasks.sql # TODOテーブル作成SQL

```

---

## 2. データベース設計 (`sql/todo/020_create_todo_tasks.sql`)

### テーブル定義: `todos`

| カラム名 | データ型 | NULL許容 | デフォルト値 | 説明 |
| --- | --- | --- | --- | --- |
| `id` | SERIAL / INT | NOT NULL | AUTO_INCREMENT相当 | 主キー（1以上の整数） |
| `title` | VARCHAR(100) | NOT NULL | - | TODOのタイトル（1〜100文字、前後空白除去） |
| `completed` | BOOLEAN | NOT NULL | `FALSE` | 完了状態（true: 完了, false: 未完了） |
| `created_at` | TIMESTAMP | NOT NULL | `CURRENT_TIMESTAMP` | 作成日時 |

* **SQLスクリプト例**:

```sql
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    VARCHAR(100) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

```

---

## 3. API設計 (`/api/v1/todos`)

すべて共通のエラーハンドリング、および `{"success": true, "data": ...}` / `{"success": false, "error": { "code": "...", "message": "..." }}` 形式のレスポンスを返却します。

| メソッド | エンドポイント | 説明 | リクエストボディ / パラメータ | レスポンス (成功時) | 想定エラーコード |
| --- | --- | --- | --- | --- | --- |
| **GET** | `/api/v1/todos` | 一覧取得 | なし | `200 OK`: `{"success": true, "data": [...]}` | 500, 503 |
| **POST** | `/api/v1/todos` | 新規登録 | `{ "title": "文字列" }` | `201 Created`: `{"success": true, "data": {...}}` | 400, 422, 500, 503 |
| **PATCH** | `/api/v1/todos/:id` | 完了状態更新 | `{ "completed": boolean }` | `200 OK`: `{"success": true, "data": {...}}` | 400, 404, 422, 500, 503 |
| **DELETE** | `/api/v1/todos/:id` | 削除 | パスパラメータ `id` | `204 No Content` (本文なし) | 400, 404, 500, 503 |

---

## 4. モジュール・クラス設計

### ① バックエンド (`src/apps/todo/`)

* **`todoRouter.ts`**:
* Expressの `Router` を使用し、`/api/v1/todos` に対するルーティングを設定。
* 各メソッド（GET, POST, PATCH, DELETE）を対応するコントローラーメソッドへルーティング。

* **`todoController.ts`**:
* リクエストデータのバリデーション（`title` のトリム・文字数チェック、`id` の数値チェックなど）を実施。
* `todoModel` を呼び出してDB操作を行い、結果に応じたステータスコードとJSONを返却。エラー時はアプリケーション共通のエラー形式で返却。

* **`todoModel.ts`**:
* `db.ts` を用いて Neon PostgreSQL に対するSQLクエリ（`SELECT`, `INSERT`, `UPDATE`, `DELETE`）を実行。

### ② フロントエンド (`public/todo/todo.js` & `views/todo/index.ejs`)

* **`TodoApi` クラス (`public/todo/todo.js`)**:
* バックエンドの REST API (`/api/v1/todos`) と通信する責任を持つクラス。
* 実装メソッドの例:
* `async fetchTodos()` -> GET `/api/v1/todos`
* `async createTodo(title)` -> POST `/api/v1/todos`
* `async updateTodoStatus(id, completed)` -> PATCH `/api/v1/todos/:id`
* `async deleteTodo(id)` -> DELETE `/api/v1/todos/:id`

* **画面表示 (`views/todo/index.ejs`)**:
* Tailwind CSS を読み込み、モダンでシンプルなUI（入力フォーム、TODOリスト、完了トグル、削除ボタン）を構築。
* 画面ロード時やユーザー操作時に `TodoApi` をインスタンス化・呼び出してDOMを動的に更新。

---
