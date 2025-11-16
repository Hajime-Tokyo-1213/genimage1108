-- 画像履歴テーブルにフルサイズ画像URLカラムを追加
-- このマイグレーションを実行すると、フルサイズ画像がデータベースに保存されるようになります

ALTER TABLE image_histories 
ADD COLUMN IF NOT EXISTS full_image_url TEXT;

-- カラムにコメントを追加（オプション）
COMMENT ON COLUMN image_histories.full_image_url IS 'フルサイズ画像のBase64データURL（data:image/...;base64,...形式）';

