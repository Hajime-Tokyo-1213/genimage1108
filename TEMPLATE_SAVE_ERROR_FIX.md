# テンプレート保存エラー（400エラー）の修正方法

## エラーの内容

```
uoaswfcwqyyjqtvnqarl.supabase.co/rest/v1/prompt_templates?on_conflict=id:1
Failed to load resource: the server responded with a status of 400 ()
```

## 考えられる原因

### 1. `prompt_templates`テーブルが存在しない
- テーブルが作成されていない可能性があります

### 2. カラムの型が一致していない
- `id`カラムがUUID型なのに、文字列（`Date.now().toString()`）を送信している
- `yaml`や`field_options`がJSON型として正しく設定されていない

### 3. カラム名が一致していない
- コードで使用しているカラム名と、データベースのカラム名が異なる

### 4. `onConflict`の指定が正しくない
- `id`カラムが主キーとして設定されていない

## 確認方法

### ステップ1: テーブルの存在確認

Supabaseダッシュボードで確認：

1. **Table Editor** を開く
2. `prompt_templates` テーブルが存在するか確認
3. 存在しない場合は、テーブルを作成する必要があります

### ステップ2: テーブル構造の確認

SQL Editorで以下を実行：

```sql
-- テーブルの構造を確認
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'prompt_templates'
ORDER BY ordinal_position;
```

### ステップ3: 必要なカラムの確認

以下のカラムが必要です：
- `id` (TEXT または UUID) - 主キー
- `user_id` (UUID) - 外部キー（auth.users参照）
- `name` (TEXT)
- `yaml` (JSONB または JSON)
- `original_prompt` (TEXT)
- `field_options` (JSONB または JSON)
- `created_at` (TIMESTAMPTZ)

## テーブル作成SQL（存在しない場合）

```sql
-- prompt_templatesテーブルを作成
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  yaml JSONB DEFAULT '{}'::jsonb,
  original_prompt TEXT DEFAULT '',
  field_options JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS（Row Level Security）を有効化
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- ポリシー: ユーザーは自分のテンプレートのみアクセス可能
CREATE POLICY "Users can view their own templates"
  ON prompt_templates
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own templates"
  ON prompt_templates
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own templates"
  ON prompt_templates
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own templates"
  ON prompt_templates
  FOR DELETE
  USING (auth.uid() = user_id);

-- インデックスを作成（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id 
  ON prompt_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_created_at 
  ON prompt_templates(created_at DESC);
```

## 修正方法

### 方法1: IDの型をUUIDに変更（推奨）

テーブルがUUID型のIDを使用している場合、コードを修正：

```javascript
// 修正前
id: Date.now().toString(),

// 修正後（UUID v4を生成）
import { randomUUID } from 'crypto'; // Node.js環境の場合
// または
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
id: generateUUID(),
```

### 方法2: テーブルのID型をTEXTに変更

テーブルがTEXT型のIDを使用するように変更：

```sql
-- 既存のテーブルがある場合（注意: データが失われる可能性があります）
ALTER TABLE prompt_templates ALTER COLUMN id TYPE TEXT;
```

## デバッグ方法

### ブラウザのコンソールで詳細なエラーを確認

```javascript
// ネットワークタブでリクエストの詳細を確認
// F12 → Network タブ → 失敗したリクエストをクリック
// Response タブでエラーの詳細を確認
```

### エラーメッセージを改善

コードを修正して、より詳細なエラー情報を表示：

```javascript
catch (err) {
  console.error('テンプレート保存エラーの詳細:', {
    error: err,
    message: err.message,
    details: err.details,
    hint: err.hint,
    code: err.code
  });
  surfaceTemplateError('テンプレートの保存に失敗しました', err);
}
```

