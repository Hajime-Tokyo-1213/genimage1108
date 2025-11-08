# Gemini API 画像生成アプリ

## セットアップ

1. Google AI Studio (https://aistudio.google.com/app/apikey) でAPIキーを取得してください

2. プロジェクトのルートディレクトリに `.env` ファイルを作成し、以下の内容を追加してください：

```
# 画像生成用（Google AI Studio）
VITE_GEMINI_API_KEY=your_api_key_here

# プロンプト変換用（OpenAI）
VITE_OPENAI_API_KEY=your_openai_api_key_here
```

3. 依存関係をインストール（既にインストール済みの場合はスキップ）：

```bash
npm install
```

4. 開発サーバーを起動：

```bash
npm run dev
```

5. ブラウザで `http://localhost:3000/image-generator` にアクセスしてください

## 使用方法

### 新規作成モード
1. 「新規作成」ラジオボタンを選択
2. プロンプト入力欄に生成したい画像の説明を入力してください
3. 「画像を生成」ボタンをクリック
4. 生成された画像が表示されます

### 画像修正モード
1. 「画像を修正」ラジオボタンを選択
2. 画像をアップロード（ファイル選択またはドラッグ＆ドロップ）
3. プロンプト入力欄に修正内容を入力してください（例：「登場人物の上着を黄色にしてください」）
4. 「画像を生成」ボタンをクリック
5. 修正された画像が表示されます

### プロンプトモード
1. 「プロンプトモード」タブをクリック
2. マスタープロンプトを入力（例: `A beautiful sunset, color: vibrant orange, style: photorealistic, --ar 16:9`）
3. 「テンプレート生成」ボタンをクリック（OpenAI APIで自動解析）
4. キーボード操作（↑↓で項目選択、→で選択肢、←で自由入力）で編集
5. テンプレート名を入力して「保存」ボタンをクリック

### その他の機能
- 「画像をダウンロード」ボタンで画像を保存できます
- 生成画像一覧から複数選択して一括ダウンロード可能
- スタイルライブラリからプロンプトを適用可能

## API仕様

- **新規作成**: Imagen 4 API（Google AI Studio）を使用
- **画像編集**: Gemini 2.5 Flash Image API（Google AI Studio）を使用
- **プロンプト変換**: OpenAI API（gpt-4o-mini）を使用

## 注意事項

- 実際のAPIエンドポイントは、Googleの最新ドキュメントを確認して調整が必要な場合があります
- APIキーは機密情報です。`.env` ファイルをGitにコミットしないでください（`.gitignore` に追加済み）
- OpenAI APIキーは https://platform.openai.com/api-keys で取得できます
- プロンプト変換にはOpenAI APIの使用料が発生します（gpt-4o-miniは比較的安価です）

