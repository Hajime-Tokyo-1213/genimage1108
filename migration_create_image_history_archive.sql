-- 画像履歴アーカイブテーブルを作成
-- このテーブルは、画像を削除しても残る永続的なアーカイブです
-- base64エンコードされた画像データ、プロンプト、作成日時、タイトルを保存します

-- テーブルが存在しない場合のみ作成
CREATE TABLE IF NOT EXISTS image_history_archive (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  prompt TEXT NOT NULL DEFAULT '',
  image_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL DEFAULT ''
);

-- 外部キー制約を追加（存在しない場合のみ）
DO $$ 
BEGIN
  -- テーブルが存在し、制約が存在しない場合のみ制約を追加
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'image_history_archive'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'image_history_archive_user_id_fkey'
  ) THEN
    ALTER TABLE image_history_archive 
    ADD CONSTRAINT image_history_archive_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- インデックスを作成（パフォーマンス向上のため）
CREATE INDEX IF NOT EXISTS idx_image_history_archive_user_id ON image_history_archive(user_id);
CREATE INDEX IF NOT EXISTS idx_image_history_archive_created_at ON image_history_archive(created_at DESC);

-- Row Level Security (RLS) を有効化
ALTER TABLE image_history_archive ENABLE ROW LEVEL SECURITY;

-- RLSポリシー: ユーザーは自分のデータのみ閲覧・操作可能（既に存在する場合はスキップ）
DO $$ 
BEGIN
  -- SELECTポリシー
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'image_history_archive' 
    AND policyname = 'Users can view their own archive data'
  ) THEN
    CREATE POLICY "Users can view their own archive data"
      ON image_history_archive
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  -- INSERTポリシー
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'image_history_archive' 
    AND policyname = 'Users can insert their own archive data'
  ) THEN
    CREATE POLICY "Users can insert their own archive data"
      ON image_history_archive
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- UPDATEポリシー
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'image_history_archive' 
    AND policyname = 'Users can update their own archive data'
  ) THEN
    CREATE POLICY "Users can update their own archive data"
      ON image_history_archive
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- 注意: 削除ポリシーは作成しません（アーカイブは削除されないようにするため）
-- 必要に応じて、管理者のみが削除できるポリシーを追加できます

-- テーブルにコメントを追加
COMMENT ON TABLE image_history_archive IS '画像生成履歴の永続的なアーカイブ（画像削除時も残る）';
COMMENT ON COLUMN image_history_archive.id IS '画像ID（UUID）';
COMMENT ON COLUMN image_history_archive.user_id IS 'ユーザーID（外部キー）';
COMMENT ON COLUMN image_history_archive.prompt IS 'プロンプト（画像生成に使用したテキスト）';
COMMENT ON COLUMN image_history_archive.image_base64 IS '画像データ（Base64エンコード）';
COMMENT ON COLUMN image_history_archive.created_at IS '作成日時';
COMMENT ON COLUMN image_history_archive.title IS '画像タイトル';

