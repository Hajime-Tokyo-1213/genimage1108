# Supabase開発環境セットアップ

## 1. Supabaseダッシュボードでの設定

### メール認証を無効化（開発用）
1. Supabaseダッシュボードにログイン
2. Authentication > Settings に移動
3. Email Auth セクションで「Confirm email」のチェックを外す
4. 「Save」をクリック

これにより、メール確認なしですぐにログインできるようになります。

## 2. テストユーザーの作成

### 方法1: アプリから登録
1. http://localhost:3000/ にアクセス
2. 「会員登録はこちら」をクリック
3. 以下を入力：
   - ユーザー名: testuser
   - メールアドレス: test@example.com
   - パスワード: password123（6文字以上）
4. 登録をクリック

### 方法2: Supabaseダッシュボードから直接作成
1. Authentication > Users に移動
2. 「Add user」→「Create new user」
3. Email と Password を入力
4. 「Auto Confirm User」にチェックを入れる
5. 「Create user」をクリック

### 登録済みユーザー情報の確認方法

#### Supabaseダッシュボードで確認
1. **Supabaseダッシュボードにログイン**
   - https://supabase.com/dashboard にアクセス

2. **ユーザー一覧を表示**
   - 左メニューから **Authentication** → **Users** をクリック
   - 登録済みのユーザー一覧が表示されます

3. **確認できる情報**
   - **Email**: 登録時のメールアドレス
   - **User UID**: ユーザーの一意のID（UUID形式）
   - **Created**: 登録日時
   - **Last Sign In**: 最終ログイン日時
   - **User Metadata**: ユーザー名（`username`）など

4. **ユーザー名の確認**
   - ユーザーをクリックして詳細を表示
   - **User Metadata** セクションに `username` が表示されます

#### 注意事項
- **パスワードは確認できません**（セキュリティ上、ハッシュ化されて保存されているため）
- パスワードを忘れた場合は、**Authentication** → **Users** → ユーザーを選択 → **Send password reset email** でリセットできます
- または、新しいパスワードを設定する場合は、ユーザーを選択 → **Reset password** で設定できます

#### ブラウザのコンソールで確認（開発用）
アプリにログインしている状態で、ブラウザのコンソール（F12）で以下を実行：

```javascript
// 現在ログインしているユーザー情報を確認
console.log('User:', JSON.parse(localStorage.getItem('sb_session') || '{}'));
```

または、アプリのコードに一時的に追加（確認後削除）：

```javascript
// src/contexts/AuthContext.tsx の useEffect 内などに追加
console.log('🔍 現在のユーザー情報:', {
  id: user?.id,
  email: user?.email,
  username: user?.username
});
```

## 3. ログインしてテスト

1. http://localhost:3001/ でログイン
2. プロンプトモードに移動
3. テンプレートを作成して「保存」ボタンをクリック
4. スタイルライブラリに追加してみる

## 4. データベースマイグレーション

### 方法1: Supabaseダッシュボードから実行（推奨・簡単）

1. Supabaseダッシュボードにログイン
2. 左側のメニューから **SQL Editor** をクリック
3. **New query** をクリック
4. 以下のSQLをコピー＆ペースト：

```sql
-- 画像履歴テーブルにフルサイズ画像URLカラムを追加
ALTER TABLE image_histories 
ADD COLUMN IF NOT EXISTS full_image_url TEXT;

-- カラムにコメントを追加（オプション）
COMMENT ON COLUMN image_histories.full_image_url IS 'フルサイズ画像のBase64データURL（data:image/...;base64,...形式）';
```

5. **Run** ボタンをクリック（または `Ctrl+Enter` / `Cmd+Enter`）
6. 成功メッセージが表示されれば完了

### 方法2: Supabase CLIを使用（上級者向け）

1. Supabase CLIをインストール（未インストールの場合）：
   ```bash
   npm install -g supabase
   ```

2. プロジェクトにログイン：
   ```bash
   supabase login
   ```

3. プロジェクトをリンク：
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. マイグレーションファイルを実行：
   ```bash
   supabase db push
   ```

または、SQLファイルを直接実行：
   ```bash
   supabase db execute -f migration_add_full_image_url.sql
   ```

### マイグレーションの確認

マイグレーションが成功したか確認するには：

#### 方法1: Table Editorで確認（表示が更新されない場合があります）
1. Supabaseダッシュボード → **Table Editor** に移動
2. `image_histories` テーブルを選択
3. ページをリフレッシュ（F5 または Cmd+R / Ctrl+R）
4. カラム一覧に `full_image_url` が表示されていれば成功

#### 方法2: SQL Editorで確認（推奨・確実）
1. **SQL Editor** を開く
2. 以下のSQLを実行：
   ```sql
   -- カラムが存在するか確認
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'image_histories' 
   AND column_name = 'full_image_url';
   ```
3. 結果が返ってくれば、カラムは存在しています

#### 接続先の確認方法
詳細は `SUPABASE_CONNECTION_CHECK.md` を参照してください。

## トラブルシューティング

### エラーが出る場合
ブラウザの開発者ツール（F12）でコンソールエラーを確認してください。

### よくあるエラー
- "Auth session missing!" → ログインが必要
- "prompt_templates table not found" → テーブル作成が必要
- "column full_image_url does not exist" → マイグレーションが未実行