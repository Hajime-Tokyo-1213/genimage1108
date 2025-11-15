# 画像生成アプリ

Google Gemini APIとOpenAI APIを使用した画像生成・プロンプト管理アプリケーション

## 機能

- 🖼️ 画像生成（Imagen 4 / Gemini 2.5 Flash Image）
- 📝 プロンプトYAMLメーカー
- 🎨 スタイルライブラリ
- 🤖 AI選択肢生成機能
- 📦 画像一括ダウンロード

## セットアップ

### 必要な環境変数

`.env`ファイルを作成し、以下の環境変数を設定してください：

```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_OPENAI_API_KEY=your_openai_api_key_here
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
# 任意: 本番URLを固定したい場合は設定してください
VITE_SITE_URL=https://your-production-domain.com
```

`VITE_SITE_URL` を設定しない場合は、フロントエンドを表示している現在のオリジン（`window.location.origin`）がメールリンクのリダイレクト先として利用されます。

### ローカル開発

```bash
npm install
npm run dev
```

### ビルド

```bash
npm run build
```

## Vercelデプロイ手順

### 1. Vercelアカウントの作成

1. [Vercel](https://vercel.com)にアクセス
2. GitHubアカウントでサインイン

### 2. プロジェクトのインポート

1. Vercelダッシュボードで「Add New Project」をクリック
2. GitHubリポジトリ `Hajime-Tokyo-1213/genimage1108` を選択
3. プロジェクト設定：
   - **Framework Preset**: Vite
   - **Root Directory**: `./` (デフォルト)
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 3. 環境変数の設定

Vercelダッシュボードで以下の環境変数を設定：

1. プロジェクトの「Settings」→「Environment Variables」に移動
2. 以下の環境変数を追加：

   | 名前 | 値 |
   |------|-----|
   | `VITE_GEMINI_API_KEY` | あなたのGemini APIキー |
   | `VITE_OPENAI_API_KEY` | あなたのOpenAI APIキー |
   | `VITE_SUPABASE_URL` | Supabase プロジェクトのURL |
   | `VITE_SUPABASE_ANON_KEY` | Supabase anonキー |
   | `VITE_SITE_URL` | (任意) 本番のフロントエンドURL |

3. 各環境（Production, Preview, Development）に適用するか選択
4. 「Save」をクリック

### 4. デプロイ

1. 「Deploy」ボタンをクリック
2. ビルドが完了するまで待機（通常1-2分）
3. デプロイ完了後、提供されたURLでアプリにアクセス可能

### 5. Supabase 側の設定

1. Supabase ダッシュボード → **Authentication** → **URL Configuration** へ移動
2. **Site URL** に Vercel の本番 URL（例: `https://your-production-domain.com`）を設定
3. **Additional Redirect URLs** にローカル開発用のURL（`http://localhost:5173/auth/callback` など）を必要に応じて追加

メールからの確認リンクは `/auth/callback` または `/auth/v1/verify` にリダイレクトされ、アプリ側で自動的にセッションを確立します。

## APIキーの取得方法

### Gemini APIキー

1. [Google AI Studio](https://makersuite.google.com/app/apikey)にアクセス
2. 「Create API Key」をクリック
3. 生成されたAPIキーをコピー

### OpenAI APIキー

1. [OpenAI Platform](https://platform.openai.com/api-keys)にアクセス
2. 「Create new secret key」をクリック
3. 生成されたAPIキーをコピー（一度しか表示されないので注意）

## 注意事項

- APIキーは絶対にGitHubにコミットしないでください
- `.env`ファイルは`.gitignore`に含まれています
- Vercelの環境変数は暗号化されて保存されます

## ライセンス

MIT

