# TODOアプリ V1 実装手順書 (`docs/todo/03_implementation_plan.md`)

本手順書は、`01_requirements.md` および `02_design.md` に基づき、既存の Express ＋ TypeScript ＋ EJS 構成に TODOアプリ（v1）を安全に実装・デプロイするためのステップを定義したものです。

---

## 全体の前提確認（用語・仕様の一致）

* **テーブル名:** `todo_tasks` （カラム: `id`, `title`, `completed`, `created_at`）
* **APIエンドポイント:** `/api/v1/todos` （GET, POST, PATCH, DELETE）
* **画面パス:** `/todo`
* **既存ルート:** `/` および `/api/db-check` は一切変更・破壊しない。

---

## 工程1: SQLファイル作成（Git保存用）

* **対象ファイル:** `sql/todo/020_create_todo_tasks.sql`
* **作業内容:** テーブル作成用のSQL文を記述し、Gitに保存する。

```sql
CREATE TABLE IF NOT EXISTS todo_tasks (
    id SERIAL PRIMARY KEY,
    VARCHAR(100) NOT NULL,
    completed BOOLEAN DEFAULT FALSE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

```

* **確認コマンド:** `git status` / `git add sql/todo/020_create_todo_tasks.sql`
* **期待結果:** ファイルが正しくGit管理下に登録されること。
* **失敗時の確認方法:** ファイルパスやファイル名（`020_create_todo_tasks.sql`）が正しいか確認する。

## 工程2: Neon SQL Editorでのテーブル手動作成

* **対象環境:** Neon PostgreSQL (クラウド上のDB)
* **作業内容:** NeonのSQL Editorを開き、工程1で作成したSQL（`020_create_todo_tasks.sql` の中身）を実行してテーブルを作成する。
* **確認コマンド:** Neonコンソール上のテーブル一覧に `todo_tasks` が表示されること、または `SELECT * FROM todo_tasks;` がエラーなく実行できること。
* **期待結果:** テーブルが作成され、エラーが発生しないこと。
* **失敗時の確認方法:** 接続しているDB（Neonのプロジェクト）や `DATABASE_URL` が正しいか、SQLの構文エラーがないかを確認する。

## 工程3: REQ-01 一覧APIの実装

* **対象ファイル:**
* `src/apps/todo/todoModel.ts`
* `src/apps/todo/todoController.ts`
* `src/apps/todo/todoRouter.ts`
* `index.ts`（最小限のルーター登録）

* **作業内容:**
* Modelで全件取得クエリ（`SELECT id, title, completed, created_at FROM todo_tasks ORDER BY id DESC;`）を実装。
* Controllerで結果を整形し `{"data": [...]}`（0件時は `{"data": []}`）として返却する処理を実装。
* Routerで `GET /api/v1/todos` を定義。
* `index.ts` に `app.use('/api/v1/todos', todoRouter)` もしくは適切なルーターマウントを追加（既存ルートは維持）。

* **確認コマンド:** `npm run dev` 起動後、別ターミナルで `curl -i http://localhost:3000/api/v1/todos` を実行する。
* **期待結果:** ステータスコード `200 OK` が返り、データ0件なら `{"data": []}` が返ること。
* **【REQ-01 完了と言える状態】** データ0件ならGETのdataが空配列になり、画面に「TODOがありません」と表示されること。

* **失敗時の確認方法:** サーバーのコンソールログ、`db.ts` の接続設定、エンドポイントのパスを確認する。

## 工程4: REQ-02 登録APIの実装

* **対象ファイル:** `src/apps/todo/todoModel.ts`, `src/apps/todo/todoController.ts`, `src/apps/todo/todoRouter.ts`
* **作業内容:**
* Modelに `INSERT INTO todo_tasks (title) VALUES ($1) RETURNING ...;` を実装。
* Controllerで `title` のバリデーション（trim処理、1〜100文字チェック）を行い、不正なら `422`、JSONパース失敗なら `400` を返す。成功時は `201 Created` と作成データを返す。
* Routerに `POST /api/v1/todos` を追加。

* **確認コマンド:**
`curl -i -X POST http://localhost:3000/api/v1/todos -H "Content-Type: application/json" -d '{"title":"テストタスク"}'`
* **期待結果:** ステータスコード `201 Created` と作成されたタスクのJSONが返ること。空文字や100文字超を投げた場合に `422` が返ること。
* **【REQ-02 完了と言える状態】** バリデーションを通過した有効なタイトルがDBに保存され、作成されたデータがステータス201とともに返却されること。

* **失敗時の確認方法:** リクエストヘッダーに `Content-Type: application/json` が付いているか、コントローラーのバリデーションロジックを確認する。

## 工程5: REQ-03 完了状態の部分更新APIの実装

* **対象ファイル:** `src/apps/todo/todoModel.ts`, `src/apps/todo/todoController.ts`, `src/apps/todo/todoRouter.ts`
* **作業内容:**
* Modelに `UPDATE todo_tasks SET completed = $1 WHERE id = $2 RETURNING ...;` を実装。
* Controllerで `:id` の整数判定、`completed` のブール値判定を行い、存在しないIDの場合は `404 Not Found` を返す。成功時は `200 OK` と更新後データを返す。
* Routerに `PATCH /api/v1/todos/:id` を追加。

* **確認コマンド:**
`curl -i -X PATCH http://localhost:3000/api/v1/todos/1 -H "Content-Type: application/json" -d '{"completed":true}'`
* **期待結果:** ステータスコード `200 OK` と `completed: true` に更新されたタスクが返ること。存在しないIDでは `404` が返ること。
* **【REQ-03 完了と言える状態】** 指定したIDの完了状態（completed）が反転・更新され、存在しないIDの場合は404エラーになること。

* **失敗時の確認方法:** URLパラメータのパース処理やSQLのプレースホルダー（`$1, $2`）の順序を確認する。

## 工程6: REQ-04 削除APIの実装

* **対象ファイル:** `src/apps/todo/todoModel.ts`, `src/apps/todo/todoController.ts`, `src/apps/todo/todoRouter.ts`
* **作業内容:**
* Modelに `DELETE FROM todo_tasks WHERE id = $1 RETURNING id;`（または行数確認）を実装。
* ControllerでIDの存在確認を行い、存在しない場合は `404`、成功時は `204 No Content`（本文なし）を返す。
* Routerに `DELETE /api/v1/todos/:id` を追加。

* **確認コマンド:**
`curl -i -X DELETE http://localhost:3000/api/v1/todos/1`
* **期待結果:** ステータスコード `204 No Content` が返り、レスポンスボディが空であること。
* **【REQ-04 完了と言える状態】** 指定したIDのデータがDBから完全に削除され、レスポンスとして204（本文なし）が返ること。

* **失敗時の確認方法:** レスポンスに本文（body）を出力しようとしてエラーになっていないか、ステータスコードの設定を確認する。

## 工程7: TodoApi クラスの実装（ブラウザ用）

* **対象ファイル:** `public/todo/todo.js`
* **作業内容:**
* `fetch` APIを用いて、`/api/v1/todos` に対する `getAll()`, `create(title)`, `updateCompleted(id, completed)`, `delete(id)` の各メソッドを持つ `TodoApi` クラスを実装する。

* **確認コマンド:** ブラウザの開発者ツール（Console）で `TodoApi` インスタンスを作成し、メソッドを手動呼び出しして動作確認する。
* **期待結果:** 各APIに対して正しくリクエストが飛び、期待通りのPromise（JSONデータ）が返ること。
* **失敗時の確認方法:** URLのパスやfetchのオプション（Method, Headers, bodyのJSON.stringify等）に誤りがないか確認する。

## 工程8: 画面（EJS）およびUI連動の実装

* **対象ファイル:**
* `views/todo/index.ejs`
* `src/apps/todo/todoRouter.ts` （画面表示用のGET `/todo` ルート追加）

* **作業内容:**
* `/todo` アクセス時にEJSテンプレートをレンダリングするサーバー側ルートを追加。
* `views/todo/index.ejs` に入力フォーム、TODOリスト一覧エリア、削除・完了チェックボックスを配置し、`public/todo/todo.js`（TodoApi）と連携させて動的に描画・操作できるようにする。

* **确认コマンド:** `npm run dev` 起動後、ブラウザで `http://localhost:3000/todo` にアクセスする。
* **期待結果:** 画面が正しく表示され、タスクの追加、完了状態の切り替え、削除がブラウザ上だけで完結（非同期通信）してスムーズに行えること。
* **失敗時の確認方法:** ブラウザの開発者ツールの「Console」や「Network」タブを開き、JavaScriptのエラーやAPI通信のエラー（4xx, 5xx）が発生していないか確認する。

## 工程9: ローカル環境での総合確認

* **対象環境:** ローカル開発環境 (`npm run dev`)
* **作業内容:**
* 既存の `/` および `/api/db-check` が壊れていないことを確認する。
* `/todo` にてREQ-01〜REQ-04の操作が一連の流れとして正常に動作することを確認する。

* **確認コマンド:**
* `curl http://localhost:3000/`
* `curl http://localhost:3000/api/db-check`

* **期待結果:** すべての既存機能および新規TODOアプリが意図通りに動作すること。
* **失敗時の確認方法:** サーバーログを頼りに、ルーティングの競合や環境変数（`DATABASE_URL`）の読み込み漏れを確認する。

## 工程10: Preview環境での確認（Vercel）

* **対象環境:** Vercel Preview環境
* **作業内容:**
* コードをGitにコミット・プッシュし、プルリクエストを作成してVercelのPreviewデプロイを実行する。
* Vercelの環境変数に `DATABASE_URL` が正しく設定されていることを確認する。

* **確認コマンド:** Vercelが発行するPreview URLにブラウザでアクセスし、`/todo` が動作することを確認する。
* **期待結果:** ローカルと同様にDBと接続し、CRUD操作が正常に行えること。
* **失敗時の確認方法:** VercelのDeployment Logsを確認し、ビルドエラーやDB接続エラー（503等）が出ていないか確認する。

## 工程11: PR作成・マージ & Production環境確認

* **対象環境:** Vercel Production環境
* **作業内容:**
* Previewでの動作確認後、main（または指定のプロダクションブランチ）へプルリクエストをマージする。
* Production環境のデプロイ完了を待ち、本番URLで最終確認を行う。

* **確認コマンド:** 本番URLの `/todo` および `/api/db-check` にアクセスする。
* **期待結果:** すべての機能が本番環境でエラーなく動作すること。
* **失敗時の確認方法:** Productionのデプロイログおよび環境変数の設定状態を再確認する。
