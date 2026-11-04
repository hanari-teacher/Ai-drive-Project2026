# TODOアプリ 実装手順書 (`docs/todo/03_implementation_plan.md`)

本手順書は、Express ＋ TypeScript ＋ EJS、Neon PostgreSQL、Vercel環境を用いたTODOアプリの実装・構築ステップを定義するものです。

---

## 1. 実装フェーズ概要

以下の5つのステップに分けて実装を進めます。

1. **Step 1: データベースの準備とマイグレーション**
2. **Step 2: バックエンドモデル・コントローラー・ルーターの実装**
3. **Step 3: フロントエンド（EJS画面 ＆ Tailwind CSS）の実装**
4. **Step 4: ブラウザ用JavaScript (`TodoApi` クラス) の実装と結合**
5. **Step 5: ローカル動作確認およびVercelデプロイ検証**

---

## 2. 詳細な実装ステップ

### Step 1: データベースの準備とマイグレーション

* **作業内容**:
* Neon PostgreSQL上にTODOテーブルを作成するためのSQLスクリプトを配置・実行します。

* **対象ファイル**: `sql/todo/020_create_todo_tasks.sql`
* **手順**:

1. `sql/todo/020_create_todo_tasks.sql` に以下のSQLを記述します。

```sql
CREATE TABLE IF NOT EXISTS todos (
    id SERIAL PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

```

1. 既存の接続確認スクリプト（`sql/000_check_connection.sql` 等）または外部ツール（psqlやNeonコンソール）を利用して上記SQLを実行し、テーブルが正しく作成されることを確認します。

---

### Step 2: バックエンドの実装

* **作業内容**:
* `src/apps/todo/` 配下にModel、Controller、Routerを実装し、既存のExpressアプリ（`index.ts` および `db.ts`）に組み込みます。

* **対象ファイル**:
* `src/apps/todo/todoModel.ts`
* `src/apps/todo/todoController.ts`
* `src/apps/todo/todoRouter.ts`
* `index.ts` （ルーターの登録）

* **手順**:

1. **`todoModel.ts`**: `db.ts` をインポートし、Neon DBに対して `SELECT`, `INSERT`, `UPDATE`, `DELETE` クエリを実行する関数を実装します。
2. **`todoController.ts`**:
   * `title` の前後空白除去・1〜100文字チェック、`id` の数値チェックなどのバリデーションを実装します。
   * アプリ共通のエラーレスポンス形式（`{ success: false, error: { code, message } }`）および成功レスポンス（`{ success: true, data }`）を返すように制御します。
   * HTTPステータスコード（200, 201, 204, 400, 404, 422, 500, 503）を適切に振り分けます。

3. **`todoRouter.ts`**: ExpressのRouterを用い、各HTTPメソッド（GET, POST, PATCH, DELETE）をコントローラーの対応関数にルーティングします。

4. **`index.ts`**: `/api/v1/todos` として `todoRouter` をマウントします。また、`/todo` の画面用ルートを追加します。

---

### Step 3: フロントエンド（EJS画面）の実装

* **作業内容**:
* Tailwind CSSを適用したTODO管理画面のテンプレートを作成します。

* **対象ファイル**: `views/todo/index.ejs`
* **手順**:

1. CDN等を利用してTailwind CSSを読み込みます。
2. 画面内に以下の要素を配置します。
   * ヘッダー / タイトル
   * TODO新規登録フォーム（入力欄 ＋ 登録ボタン）
   * TODO一覧表示エリア（動的にリストやカードを描画するコンテナ）

3. ブラウザ用JavaScript（`/todo/todo.js`）を `<script>` タグで読み込みます。

---

### Step 4: ブラウザ用JavaScript (`TodoApi` クラス) の実装と結合

* **作業内容**:
* API通信をカプセル化するクラスを実装し、画面のイベント（一覧取得、登録、完了切り替え、削除）と結合します。

* **対象ファイル**: `public/todo/todo.js`
* **手順**:

1. `TodoApi` クラスを定義し、Fetch APIを用いたメソッドを実装します。
   * `fetchTodos()`
   * `createTodo(title)`
   * `updateTodoStatus(id, completed)`
   * `deleteTodo(id)`

2. DOMContentLoadedイベント等で `TodoApi` をインスタンス化し、以下のインタラクションを実装します。
   * ページ読み込み時に一覧を取得して画面に描画する。
   * フォーム送信時にバリデーション（クライアント側）と登録処理を行い、一覧を更新する。
   * 完了チェックボックス変更時にステータスを更新する。
   * 削除ボタンクリック時に該当TODOを削除する。

---

### Step 5: ローカル動作確認およびVercelデプロイ検証

* **作業内容**:
* ローカル環境およびVercel環境での動作テストを実施します。

* **手順**:
  
1. **ローカル確認**:
   * `npm run dev`（または該当する起動コマンド）でサーバーを起動します。
   * ブラウザで `http://localhost:3000/todo` にアクセスし、REQ-01〜04の操作（一覧・登録・更新・削除）が意図通りに動くことを確認します。

2. **Vercelデプロイ確認**:
   * 変更をGitリポジトリにプッシュし、Vercel（Preview環境）への自動デプロイを実行します。
   * デプロイ先のプレビューURLにアクセスし、Neon DBとの接続、および一連のTODO操作が正常に動作することを検証します。
