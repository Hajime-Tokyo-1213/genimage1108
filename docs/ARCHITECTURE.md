# アーキテクチャドキュメント

## 概要
このドキュメントでは、画像生成アプリケーションのアーキテクチャについて説明します。このアプリケーションは、React、TypeScript、Supabaseを使用して構築された、AI画像生成とプロンプト管理を行うWebアプリケーションです。

## ディレクトリ構造
```
src/
├── components/          # Reactコンポーネント
│   ├── ImageGenerator.jsx     # メイン画像生成コンポーネント
│   ├── PromptMaker.tsx        # プロンプト作成コンポーネント
│   ├── HistoryItem.jsx        # 履歴アイテムコンポーネント
│   └── ImageHistoryTable.jsx # 画像履歴テーブル
├── hooks/               # カスタムフック
│   ├── useImageGeneration.ts  # 画像生成フック
│   ├── useImageHistory.ts     # 画像履歴フック
│   └── useStyleManagement.ts  # スタイル管理フック
├── services/            # ビジネスロジック
│   └── imageGenerationService.ts # 画像生成API呼び出し
├── utils/               # ユーティリティ関数
│   ├── env.ts          # 環境変数管理
│   ├── errorHandler.ts # エラーハンドリング
│   └── uuid.ts         # UUID生成
├── types/               # TypeScript型定義
│   └── index.ts        # 共通型定義
├── lib/                 # 外部ライブラリのラッパー
│   ├── supabaseClient.ts      # Supabaseクライアント
│   └── authService.js         # 認証サービス
├── contexts/            # Reactコンテキスト
│   └── AuthContext.jsx        # 認証コンテキスト
└── test/                # テスト設定
    └── setup.ts         # テストセットアップ
```

## 主要なコンポーネント

### ImageGenerator
- **役割**: メインの画像生成インターフェース
- **機能**: プロンプト入力、画像生成、履歴表示、スタイル管理
- **依存**: useImageGeneration, useImageHistory, useStyleManagement

### PromptMaker
- **役割**: 高度なプロンプト作成とテンプレート管理
- **機能**: YAMLベースのプロンプト構造化、テンプレート保存/読み込み
- **特徴**: OpenAI APIを使用した自動プロンプト解析

### HistoryItem
- **役割**: 個別の画像履歴アイテム表示
- **機能**: 画像表示、タイトル編集、ドラッグ&ドロップ
- **最適化**: React.memoによる再レンダリング最適化

### ImageHistoryTable
- **役割**: 画像履歴の一覧表示
- **機能**: ページネーション、フィルタリング、一括操作

## データフロー

### 1. 画像生成フロー
```
ユーザー入力 → ImageGenerator → useImageGeneration → imageGenerationService → AI API
              ↓
画像履歴保存 ← useImageHistory ← 生成結果 ← API レスポンス
```

### 2. 認証フロー
```
ユーザー → AuthContext → Supabase Auth → セッション管理
```

### 3. データ永続化フロー
```
ユーザー操作 → カスタムフック → authService → Supabase Database
```

## 状態管理戦略

### カスタムフック使用
- **useImageGeneration**: 画像生成の状態とロジック
- **useImageHistory**: 履歴管理の状態とロジック  
- **useStyleManagement**: スタイル管理の状態とロジック

### パフォーマンス最適化
- **useCallback**: イベントハンドラーのメモ化
- **useMemo**: 重い計算のメモ化
- **React.memo**: コンポーネントの再レンダリング最適化

## 外部サービス連携

### AI画像生成API
- **主要**: Google Gemini 2.5 Flash
- **フォールバック**: Google Imagen 4
- **機能**: テキストから画像生成、画像編集

### Supabase
- **認証**: Email/Passwordベース認証
- **データベース**: PostgreSQL
- **ストレージ**: 画像ファイル保存
- **リアルタイム**: リアルタイムデータ同期

## セキュリティ考慮事項

### 認証・認可
- Supabase RLSによるデータアクセス制御
- セッション管理とトークンの自動更新
- ユーザー固有データの分離

### APIキー管理
- 環境変数による機密情報管理
- フロントエンドでのAPIキー暗号化は行わず、バックエンドプロキシの利用を推奨

## エラーハンドリング

### 統一エラーハンドリング
- `errorHandler.ts`による一元的エラー処理
- ユーザーフレンドリーなエラーメッセージ
- エラータイプ別の処理分岐

### レジリエンス設計
- APIフォールバック機能
- 自動リトライ機能
- オフライン対応（部分的）

## パフォーマンス特性

### 最適化戦略
- コンポーネントレベルでのメモ化
- 仮想化によるリスト表示最適化
- 画像のレイジーローディング

### メトリクス
- 初期ロード時間: < 3秒
- 画像生成時間: 5-15秒（API依存）
- リスト表示: 1000件まで快適動作

## 拡張性

### アーキテクチャの拡張ポイント
- 新しいAI API プロバイダーの追加
- プラグインシステムの実装
- マルチテナント対応
- モバイルアプリ対応

### 技術的負債の管理
- 定期的なリファクタリング
- TypeScript移行の推進
- テストカバレッジの向上
- ドキュメントの継続的更新