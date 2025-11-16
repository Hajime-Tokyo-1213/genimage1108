# APIドキュメント

## カスタムフック

### useImageGeneration

画像生成を行うカスタムフック。AI APIとの通信を管理し、ローディング状態とエラーハンドリングを提供します。

**型定義:**
```typescript
interface UseImageGenerationOptions {
  onSuccess?: (image: ImageData) => void;
  onError?: (errorMessage: string) => void;
}

interface UseImageGenerationReturn {
  generate: (
    prompt: string, 
    mode: 'new' | 'edit', 
    regenerateId?: string | null, 
    uploadedImage?: string
  ) => Promise<void>;
  loading: boolean;
  error: string | null;
}
```

**使用方法:**
```typescript
const { generate, loading, error } = useImageGeneration({
  onSuccess: (image) => {
    console.log('画像生成成功:', image);
  },
  onError: (errorMessage) => {
    console.error('エラー:', errorMessage);
  },
});

await generate('美しい夕日の風景', 'new');
```

**パラメータ:**
- `prompt`: 画像生成用のプロンプトテキスト
- `mode`: 生成モード ('new' または 'edit')
- `regenerateId`: 再生成時の元画像ID（オプション）
- `uploadedImage`: アップロードされた画像のBase64データ（編集モード時）

### useImageHistory

画像履歴の管理を行うカスタムフック。履歴の読み込み、保存、削除機能を提供します。

**型定義:**
```typescript
interface UseImageHistoryOptions {
  onError?: (errorMessage: string) => void;
}

interface UseImageHistoryReturn {
  images: ImageData[];
  historyPage: number;
  hasMoreHistory: boolean;
  historyLoading: boolean;
  loadHistories: () => Promise<void>;
  saveImageHistory: (image: ImageData) => Promise<void>;
  deleteImageHistory: (imageId: string) => Promise<void>;
  refreshHistories: () => Promise<void>;
}
```

**使用方法:**
```typescript
const {
  images,
  historyLoading,
  loadHistories,
  saveImageHistory,
  deleteImageHistory
} = useImageHistory({
  onError: (errorMessage) => {
    console.error('履歴エラー:', errorMessage);
  },
});

// 履歴を読み込み
await loadHistories();

// 画像を履歴に保存
await saveImageHistory(generatedImage);

// 画像を履歴から削除
await deleteImageHistory('image-id-123');
```

### useStyleManagement

スタイルの管理を行うカスタムフック。スタイルの作成、更新、削除、読み込み機能を提供します。

**型定義:**
```typescript
interface UseStyleManagementOptions {
  onError?: (errorMessage: string) => void;
}

interface UseStyleManagementReturn {
  styles: Style[];
  stylesLoading: boolean;
  loadStyles: () => Promise<void>;
  saveStyle: (style: Style) => Promise<void>;
  deleteStyle: (styleId: string) => Promise<void>;
  addStyle: (style: Partial<Style>) => Promise<void>;
}
```

**使用方法:**
```typescript
const {
  styles,
  stylesLoading,
  loadStyles,
  addStyle,
  deleteStyle
} = useStyleManagement({
  onError: (errorMessage) => {
    console.error('スタイルエラー:', errorMessage);
  },
});

// スタイルを読み込み
await loadStyles();

// 新しいスタイルを追加
await addStyle({
  name: '水彩画風',
  prompt: 'watercolor painting style, soft colors'
});

// スタイルを削除
await deleteStyle('style-id-123');
```

## サービス

### imageGenerationService

画像生成APIを呼び出すサービス。複数のAI APIプロバイダーに対応し、フォールバック機能を提供します。

**型定義:**
```typescript
interface GenerateImageParams {
  prompt: string;
  mode: 'new' | 'edit';
  uploadedImage?: string;
  apiKey: string;
}

interface ImageGenerationResponse {
  id: string;
  prompt: string;
  imageUrl: string;
  createdAt: string;
  base64Data: string;
}
```

**使用方法:**
```typescript
import { generateImage } from '../services/imageGenerationService';

const params: GenerateImageParams = {
  prompt: '美しい山の風景',
  mode: 'new',
  apiKey: process.env.GOOGLE_AI_API_KEY
};

try {
  const result = await generateImage(params);
  console.log('生成された画像:', result);
} catch (error) {
  console.error('生成エラー:', error);
}
```

**機能:**
- Google Gemini 2.5 Flash API（メイン）
- Google Imagen 4 API（フォールバック）
- 自動リトライ機能
- エラーハンドリング

## ユーティリティ関数

### errorHandler

統一的なエラーハンドリングを提供するユーティリティ。

**主要関数:**
```typescript
// エラーを正規化
function normalizeError(error: unknown): ErrorWithCode

// エラータイプを判定
function getErrorType(error: ErrorWithCode): ErrorType

// ユーザーフレンドリーなメッセージを取得
function getUserFriendlyMessage(
  error: ErrorWithCode, 
  context?: ErrorContext
): string

// エラーをハンドリング（ログ + メッセージ変換）
function handleError(error: unknown, context?: ErrorContext): string
```

**使用例:**
```typescript
import { handleError } from '../utils/errorHandler';

try {
  await someRiskyOperation();
} catch (error) {
  const userMessage = handleError(error, {
    component: 'ImageGenerator',
    action: 'generate'
  });
  setError(userMessage);
}
```

### env

環境変数の管理を行うユーティリティ。

**主要関数:**
```typescript
// 環境変数を取得
function getEnvVar(key: string): string | undefined

// サイトURLを解決
function resolveSiteUrl(): string
```

### uuid

UUID生成を行うユーティリティ。

**主要関数:**
```typescript
// UUID v4を生成
function generateUUID(): string
```

## 型定義

### ImageData
```typescript
interface ImageData {
  id: string;
  prompt: string;
  thumbnailUrl?: string | null;
  fullImageUrl?: string | null;
  imageUrl?: string | null;
  createdAt: string;
  revision?: number;
  title?: string;
  saved?: boolean;
}
```

### Style
```typescript
interface Style {
  id: string;
  name: string;
  prompt: string;
  thumbnail?: string | null;
  source?: string;
  createdAt: string;
  yaml?: Record<string, any> | null;
}
```

### ErrorWithCode
```typescript
interface ErrorWithCode extends Error {
  code?: string;
  status?: number;
}
```

### ErrorContext
```typescript
interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  [key: string]: any;
}
```

## 認証

### AuthContext

アプリケーション全体で認証状態を管理するコンテキスト。

**提供される値:**
```typescript
interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}
```

**使用方法:**
```typescript
import { useAuth } from '../contexts/AuthContext';

const { user, loading, login, logout } = useAuth();

if (loading) {
  return <div>Loading...</div>;
}

if (!user) {
  return <LoginForm onLogin={login} />;
}
```

## パフォーマンス最適化

### React.memo使用コンポーネント

**HistoryItem**
```typescript
const HistoryItem = memo(({
  image,
  isActive,
  isSelected,
  onCheckboxChange,
  onImageClick,
  onDeleteImage,
  // ... その他のプロップス
}) => {
  // コンポーネント実装
}, (prevProps, nextProps) => {
  // カスタム比較関数
  return (
    prevProps.image.id === nextProps.image.id &&
    prevProps.image.saved === nextProps.image.saved &&
    prevProps.isActive === nextProps.isActive
    // ... その他の比較
  );
});
```

### メモ化されたコンピューテッド値

**buildFinalPrompt**
```typescript
const buildFinalPrompt = useMemo(() => {
  // 複雑なプロンプト構築ロジック
  return computedPrompt;
}, [currentYamlData, yamlInput, selectedStyleId, styles, objectInputs, prompt]);
```

**reversedImages**
```typescript
const reversedImages = useMemo(() => {
  return [...images].reverse();
}, [images]);
```