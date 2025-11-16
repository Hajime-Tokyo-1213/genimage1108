// 画像関連の型定義
export interface ImageData {
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

export interface ImageHistory extends ImageData {
  user_id: string;
}

export interface ImageArchive {
  id: string;
  user_id: string;
  prompt: string;
  image_base64: string | null;
  created_at: string;
  title: string;
}

// スタイル関連の型定義
export interface Style {
  id: string;
  name: string;
  prompt: string;
  thumbnail?: string | null;
  source?: string;
  createdAt: string;
  yaml?: Record<string, any> | null;
}

// エラー関連の型定義
export interface ErrorWithCode extends Error {
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
}

export interface AppError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

// エラー関連の型定義
export enum ErrorType {
  NETWORK = 'NETWORK',
  AUTH = 'AUTH',
  VALIDATION = 'VALIDATION',
  DATABASE = 'DATABASE',
  API = 'API',
  UNKNOWN = 'UNKNOWN',
}

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  [key: string]: any;
}