import 'dotenv/config'; // ローカル開発時に .env の値を環境変数へ読み込む
import { Pool } from 'pg'; // PostgreSQLの接続プールを利用する

// 接続文字列が未設定のままアプリを起動しないようにする
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URLが設定されていません');
}

// Neonへの接続を管理するプールを作成する
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // .envまたはVercelに設定した接続文字列
  max: 2, // このアプリのプロセスが保持する接続数の上限
});