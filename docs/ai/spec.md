# AI質問機能 詳細設計書 (`docs/ai/spec.md`)

## 1. ブラウザ、Express、Gemini API、DBの役割

* **ブラウザ (Client / `public/ai/app.js`)**: ユーザーからの質問テキストの入力受付、非同期通信（Fetch API）によるバックエンドへの送信、ローディング等の状態管理、レスポンスの描画および0件・エラー時の表示制御を行う。
* **Express (Server / `src/apps/ai/`)**: ルーティング、入力値のバリデーション（不正な場合はAIを呼ばず即座に400応答）、コントローラーを介した業務ロジックの制御、AIサービスおよびDBモデルの連携、エラーハンドリング、公開停止（デモ制御）の判定を行う。
* **Gemini API (External AI Service)**: バックエンド（Service層）からのリクエストを受け取り、質問に対するテキスト回答を生成・返却する。
* **DB (PostgreSQL / `sql/ai/030_create_ai_qa_logs.sql`)**: ユーザーからの質問とAIからの回答のペア、および作成日時等の履歴データを永続化し、履歴一覧取得時に提供する。

---

## 2. ファイル構成とRouter／Controller／Service／Modelの責務

| ファイルパス | 責務・役割 |
| --- | --- |
| `index.ts` / `db.ts` / `local.ts` | 共通アプリの起動、共有DB接続（`pg`）、ローカルサーバー起動の管理。 |
| `src/apps/ai/aiRouter.ts` | `/api/ai` 配下のルーティング定義。HTTPメソッドとエンドポイントをコントローラーに接続する。 |
| `src/apps/ai/aiController.ts` | リクエストの受け付け、入力検証（バリデーション）、Service・Modelの呼び出し順序の制御（検証失敗時の早期リターン）、レスポンス返却。 |
| `src/apps/ai/aiService.ts` | Gemini APIとの通信処理、プロンプト構築、SDK呼び出し、タイムアウト制御。 |
| `src/apps/ai/aiModel.ts` | PostgreSQL (`ai_qa_logs` テーブル) に対するSQL発行（履歴の保存・取得、トランザクション管理）。 |
| `src/apps/ai/aiError.ts` ・ `aiMiddleware.ts` | 公開停止（デモ制御）のチェック（`POST /api/ai/ask` のみを対象とする）、公開用例外のハンドリング、問い合わせIDの付与。 |
| `public/ai/index.html` ・ `app.js` | 質問画面の静的レイアウトおよび非同期Fetch、画面状態（待機・成功・0件・失敗）の切り替え描画。 |
| `sql/ai/030_create_ai_qa_logs.sql` | 履歴保存用テーブルの作成、制約、インデックス定義のSQL。 |

---

## 3. 画面要素、初期取得・待機・成功・0件・失敗の状態

* **画面要素**:
* ナビゲーション（TOPやTODO画面、およびAI質問画面間の相互リンク導線）
* 質問入力フォーム（テキストエリア、送信ボタン）
* 応答表示エリア（最新の回答表示）
* 過去の質問履歴一覧エリア


* **状態遷移**:
1. **初期取得 (Initial)**: ページ読み込み時にDBから過去の履歴を取得し、一覧に描画する。履歴がなければ「0件」の状態を表示。
2. **待機 (Loading)**: 質問送信後、送信ボタンを無効化（ローディング表示）し、AIからの応答を待つ。
3. **成功 (Success)**: AIからの回答取得およびDB保存が完了したら、回答を表示し履歴一覧を更新する。
4. **0件 (Empty)**: 履歴データが一件もない場合、専用のプレースホルダーメッセージ（「履歴はありません」）を表示。
5. **Failure (失敗)**: 通信エラーやAPIエラー時、入力されたテキストを保持したままエラーメッセージを表示し、再送を可能にする。



---

## 4. APIのURL・メソッド・入力・応答・エラー

### 4.1. 質問送信・生成API

* **URL**: `/api/ai/ask`
* **メソッド**: `POST`
* **入力 (Request Body - JSON)**:
```json
{
  "prompt": "TypeScriptのInterfaceとTypeの違いは何ですか？"
}

```


* **応答 (Response - Success: 200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "prompt": "TypeScriptのInterfaceとTypeの違いは何ですか？",
    "answer": "InterfaceとTypeは多くの点で似ていますが...",
    "created_at": "2026-11-11T12:00:00.000Z"
  }
}

```


* **エラー応答 (Error Response - 400 / 500 / 503)**:
```json
{
  "success": false,
  "error": {
    "code": "AI_SERVICE_UNAVAILABLE",
    "message": "現在AI機能は一時的に利用できません。",
    "inquiry_id": "req-xyz-12345"
  }
}

```



### 4.2. 履歴取得API

* **URL**: `/api/ai/history`
* **メソッド**: `GET`
* **入力**: なし
* **応答 (Response - Success: 200 OK)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "prompt": "...",
      "answer": "...",
      "created_at": "..."
    }
  ]
}

```



---

## 5. ai_qa_logsの項目・制約・インデックス・SQL

### 5.1. テーブル定義 (`sql/ai/030_create_ai_qa_logs.sql`)

```sql
CREATE TABLE IF NOT EXISTS ai_qa_logs (
    id SERIAL PRIMARY KEY,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 検索・一覧表示のパフォーマンス向上のためのインデックス
CREATE INDEX IF NOT EXISTS idx_ai_qa_logs_created_at ON ai_qa_logs(created_at DESC);

```

---

## 6. デモ制御、JSON解析、既存ルート、404、例外処理の登録順

Expressアプリ (`index.ts` 等) におけるミドルウェアおよびルーターの登録順序：

1. **共通ミドルウェア**: セキュリティヘッダー、`express.json()` (JSON解析)
2. **静的ファイル配信**: `public/` の配信
3. **既存ルート**: TOP画面、TODOアプリ用ルーター (`src/apps/todo/`)
4. **AIルート及びデモ制御ミドルウェア**: `/api/ai` (`src/apps/ai/aiRouter.ts`) ※デモ停止（公開停止）チェックは新規質問送信 `POST /api/ai/ask` の実行前でのみ動作させ、履歴取得はメンテナンス中であっても許可する。
5. **404 Not Found ハンドラー**: 存在しないルートへのアクセスに対するハンドリング
6. **グローバルエラーハンドラー**: アプリケーション全体で発生した例外を受け取る最終エラー処理ミドルウェア

---

## 7. 秘密情報、XSS、SQLパラメーター、限定ログ

* **秘密情報**: Gemini APIキーやDB接続情報はソースコードに含めず、`dotenv` を用いた環境変数（`process.env.GEMINI_API_KEY`, `process.env.DATABASE_URL` 等）からのみ取得し、ログ出力やレスポンスに含めない。
* **XSS対策**: フロントエンドでの描画時は、HTMLとして直接解釈させず、安全なテキストバインディング（`textContent` やテンプレートエンジンのエスケープ機構）を利用する。
* **SQLインジェクション対策**: `pg` クライアントのパラメーター化クエリ（Parameterized Query: `$1`, `$2`）を徹底し、文字列結合によるSQL構築を行わない。
* **限定ログ**: エラーログ等を出力する際、ユーザーの入力した機微なプロンプト全文や秘密値が過度にログに残らないよう制限する。

---

## 8. 待機期限・SDKの再試行無効化・部分成功の扱い

* **待機期限 (Timeout)**: 外部AI API呼び出しには明確なタイムアウト（例: 最大30秒）を設定し、無限待ちによるサーバーリソース枯渇を防ぐ。
* **SDKの再試行無効化**: 予期せぬ多重課金やレイテンシを防ぐため、AI SDK側の自動リトライ機構は無効化し、エラー時は明示的にアプリケーション側でハンドリングする。
* **部分成功の扱い（アトミックな保証）**: AI回答の取得に成功した後、DBへの保存に失敗した場合はデータの整合性を最優先し、トランザクションをロールバックしてクライアントにはエラー（500 Internal Server Error）を返却する（部分成功は許容せず、アトミックな処理とする）。

---

## 9. PreviewとProductionの運用

* **Preview環境**: 開発・ステージング環境。モックの利用やデバッグログの有効化、簡易的なエラー出力を行い、動作検証を行う。
* **Production環境**: 本番環境。デバッグ情報の非表示、厳格なエラーハンドリング、環境変数による公開停止フラグの切り替え運用を行う。

---

## 10. REQ-AI-* と DES-AI-*、確認方法の対応表

| 要件ID (REQ-AI-*) | 設計ID (DES-AI-*) | 設計上の実現方針 | 確認方法 (テスト・検証手順) |
| --- | --- | --- | --- |
| **REQ-AI-F001** | DES-AI-F001 | TOP/TODO画面からの導線配置および `/ai` 画面UIの実装 | ブラウザでTOP画面を開き、AI画面へのリンクをクリックしてフォームが表示されることを確認する。 |
| **REQ-AI-F002** | DES-AI-F002 | `aiRouter` と `aiController` による入力検証（早期リターン）、非同期Fetchと待機・応答表示 | フォームに質問を入力し送信ボタンを押すと、ローディングを経て画面に回答が描画されることを確認する。 |
| **REQ-AI-F003** | DES-AI-F003 | `aiModel` と PostgreSQL による履歴の保存・一覧取得（DB失敗時はロールバック） | 質問送信後、データベースの `ai_qa_logs` にレコードが保存され、画面の履歴一覧に表示されることを確認する。 |
| **REQ-AI-F004** | DES-AI-F004 | 履歴件数 0件時のプレースホルダー表示制御 | DBが空の初期状態でAI画面を開き、「履歴はありません」等のメッセージが表示されることを確認する。 |
| **REQ-AI-F005** | DES-AI-F005 | エラー検知時のメッセージ表示と入力値の保持・再送 | 意図的な通信エラー発生時、アプリが落ちずにエラーが表示され、入力テキストが消えずに再送できることを確認する。 |
| **REQ-AI-F006** | DES-AI-F006 | 環境変数による公開停止制御（`POST /api/ai/ask` のみを対象制限） | 公開停止フラグを有効にして質問送信を行った際、質問機能の代わりに停止中メッセージが表示されることを確認する。 |
| **REQ-AI-N001** | DES-AI-N001 | Router / Controller / Service の責務分離アーキテクチャ | ディレクトリ構成およびコードの依存関係がルール通りに分離されていることをコードレビューで確認する。 |
| **REQ-AI-N002** | DES-AI-N002 | `dotenv` を用いた環境変数管理と秘密情報の直書き禁止 | ソースコード上にキーが含まれておらず、`.env` 設定のみで動作することを確認する。 |
| **REQ-AI-N003** | DES-AI-N003 | ミドルウェア・ルーターの正しい登録順序による既存機能維持 | 既存のTODOアプリや404・エラーハンドラーが従来通り正常に動作することを確認する。 |