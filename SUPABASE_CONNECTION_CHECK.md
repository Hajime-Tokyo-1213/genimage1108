# Supabase接続先確認ガイド

## 問題の症状
- マイグレーションを実行したが、Table Editorに`full_image_url`カラムが表示されない
- データが保存されない
- プロジェクト名やURLが正しいか確認したい

## 確認手順

### 1. Supabaseダッシュボードでプロジェクト情報を確認

1. **Supabaseダッシュボードにログイン**
   - https://supabase.com/dashboard にアクセス

2. **プロジェクトのURLとAPIキーを確認**
   - 左メニューから **Settings** → **API** をクリック
   - 以下の情報を確認：
     - **Project URL**: `https://xxxxx.supabase.co` の形式
     - **anon public** キー: `VITE_SUPABASE_ANON_KEY` に使用する値

3. **現在のプロジェクト名を確認**
   - ダッシュボードの左上に表示されているプロジェクト名を確認
   - 例: "Hajime-Tokyo-1213's genimage1108"

### 2. アプリ側の環境変数を確認

#### ローカル開発環境の場合

1. **`.env`ファイルを確認**
   ```bash
   # プロジェクトルートで実行
   cat .env
   ```

2. **以下の値が正しいか確認**
   ```env
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   - `VITE_SUPABASE_URL` が Supabaseダッシュボードの **Project URL** と一致しているか
   - `VITE_SUPABASE_ANON_KEY` が Supabaseダッシュボードの **anon public** キーと一致しているか

3. **環境変数が読み込まれているか確認**
   - アプリを起動している場合、一度停止して再起動
   ```bash
   npm run dev
   ```

#### 本番環境（Vercel）の場合

1. **Vercelダッシュボードにログイン**
   - https://vercel.com/dashboard にアクセス

2. **プロジェクトの設定を確認**
   - プロジェクトを選択
   - **Settings** → **Environment Variables** を開く
   - `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` の値を確認

3. **環境変数が正しいか確認**
   - Supabaseダッシュボードの値と一致しているか確認

### 3. ブラウザのコンソールで接続先を確認

1. **アプリを開く**（ローカルまたは本番）
   - ブラウザの開発者ツールを開く（F12）
   - **Console**タブを選択

2. **以下のコードを実行**
   ```javascript
   // Supabaseクライアントの接続先を確認
   console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL);
   console.log('Supabase Key (最初の20文字):', import.meta.env.VITE_SUPABASE_ANON_KEY?.substring(0, 20));
   ```

   または、アプリのコードに一時的に追加：
   ```javascript
   // src/lib/supabaseClient.js の最後に追加（確認後削除）
   console.log('🔍 Supabase接続情報:', {
     url: supabaseUrl,
     keyPrefix: supabaseAnonKey?.substring(0, 20) + '...'
   });
   ```

3. **Supabaseダッシュボードの値と比較**
   - コンソールに表示されたURLが、Supabaseダッシュボードの **Project URL** と一致しているか確認

### 4. Table Editorでカラムが表示されない場合の対処法

#### 方法1: ページをリフレッシュ
- Table Editorのページをリロード（F5 または Cmd+R / Ctrl+R）
- カラム一覧が更新される場合があります

#### 方法2: SQL Editorで直接確認
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
4. Table Editorの表示が古いだけの可能性があります

#### 方法3: 別のデータベースを見ている可能性
- Supabaseには複数のデータベース（ブランチ）がある場合があります
- Table Editorの上部で **"Production"** が選択されているか確認
- SQL Editorで実行した環境と、Table Editorで見ている環境が同じか確認

### 5. データが保存されない場合の確認

#### ブラウザのコンソールでエラーを確認
1. アプリを開く
2. 開発者ツール（F12）→ **Console**タブ
3. 画像を生成して保存を試みる
4. エラーメッセージがないか確認

#### よくあるエラー
- `"column full_image_url does not exist"` → マイグレーションが未実行、または別のデータベースに実行した
- `"Auth session missing!"` → ログインが必要
- `"Failed to fetch"` → ネットワークエラー、またはURLが間違っている

### 6. 接続先が間違っている場合の修正方法

#### ローカル開発環境の場合
1. `.env`ファイルを編集
   ```env
   VITE_SUPABASE_URL=https://正しいプロジェクトID.supabase.co
   VITE_SUPABASE_ANON_KEY=正しいanonキー
   ```
2. アプリを再起動
   ```bash
   # 一度停止してから
   npm run dev
   ```

#### 本番環境（Vercel）の場合
1. Vercelダッシュボード → プロジェクト → **Settings** → **Environment Variables**
2. `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を編集
3. **Save** をクリック
4. 新しいデプロイを実行（自動的に再デプロイされる場合もあります）

### 7. 完全な接続テスト

以下のSQLをSupabaseのSQL Editorで実行して、接続をテスト：

```sql
-- 1. カラムの存在確認
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'image_histories'
ORDER BY ordinal_position;

-- 2. テーブルの構造確認
SELECT * FROM image_histories LIMIT 1;

-- 3. カラム追加の再実行（念のため）
ALTER TABLE image_histories 
ADD COLUMN IF NOT EXISTS full_image_url TEXT;
```

## トラブルシューティングチェックリスト

- [ ] Supabaseダッシュボードの **Project URL** を確認
- [ ] Supabaseダッシュボードの **anon public** キーを確認
- [ ] `.env`ファイル（ローカル）またはVercelの環境変数が正しいか確認
- [ ] アプリを再起動したか
- [ ] ブラウザのコンソールでエラーがないか確認
- [ ] Table Editorのページをリフレッシュしたか
- [ ] SQL Editorでカラムの存在を確認したか
- [ ] Table EditorとSQL Editorで同じ環境（Production）を見ているか確認

