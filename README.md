# TikTok Bot (Node.js)

個人利用向けの TikTok 投稿ボットです。TikTok の公式 Content Posting API を使い、`SELF_ONLY`（自分限定）でアップロードします。

## 構成

```text
tiktok-bot/
├─ inbox/   # 投稿待ち mp4
├─ done/    # 成功時に移動
├─ failed/  # 失敗時に移動
├─ logs/    # 実行ログ
├─ src/
├─ config.json
├─ tokens.json   # OAuth後に作成（git管理しない）
├─ .env          # git管理しない
└─ .env.example
```

## 事前準備

1. Node.js 18+ をインストール
2. TikTok Developers でアプリ作成
3. Redirect URI に `http://127.0.0.1:3000/callback`（または任意）を登録
4. このリポジトリで依存をインストール

```bash
npm install
```

## 初回OAuth（1回だけ）

1. `.env.example` を `.env` にコピー
2. `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` / `TIKTOK_REDIRECT_URI` を設定
3. 下記を実行

```bash
npm run oauth
```

4. ログに出る `authUrl` をブラウザで開いて許可
5. 成功すると `tokens.json` が作成され、以降は再利用されます（期限切れ時は自動リフレッシュ）

## 実行方法

1. `inbox` に `*.mp4` を入れる
2. `config.json` を調整
   - `max_per_run`: 1回で処理する最大本数
   - `default_caption_template`: 例 `{{filename}} を自動投稿`
   - `default_hashtags`: 例 `[#自動投稿, #bot]`
3. 実行

```bash
npm start
```

実行時の動作:
- `inbox` の mp4 を名前順で最大 `max_per_run` 本処理
- キャプションをテンプレート＋ハッシュタグで生成
- OAuthトークンで TikTok API (`init -> upload -> status`) を実行
- 成功: `done` に移動
- 失敗: `failed` に移動
- ログ: `logs/YYYY-MM-DD.log`

## Windows タスクスケジューラで定期実行

1. 「タスク スケジューラ」→「タスクの作成」
2. 全般
   - 名前: `TikTok Bot`
   - 「ユーザーがログオンしているかどうかにかかわらず実行する」を必要に応じて設定
3. トリガー
   - 毎日/毎時間など任意
4. 操作
   - プログラム/スクリプト: `C:\Program Files\nodejs\node.exe`
   - 引数の追加: `src\index.js`
   - 開始（オプション）: `C:\path\to\tiktok-bot`
5. 条件/設定
   - 失敗時の再試行などを必要に応じて設定

> 初回OAuthだけは手動実行（`npm run oauth`）を推奨します。

## 注意

- `.env` と `tokens.json` は機密情報を含むため git 管理しません。
- APIレスポンスの仕様変更に備え、必要に応じて `src/tiktokClient.js` の判定を調整してください。
