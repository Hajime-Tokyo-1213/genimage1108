import { ErrorWithCode, AppError } from '../types';

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

/**
 * エラーを正規化する
 */
export const normalizeError = (error: unknown): AppError => {
  if (error instanceof Error) {
    const errorWithCode = error as ErrorWithCode;
    return {
      message: error.message || 'エラーが発生しました',
      code: errorWithCode.code,
      details: errorWithCode.details,
      hint: errorWithCode.hint,
    };
  }
  
  if (typeof error === 'string') {
    return { message: error };
  }
  
  return { message: '不明なエラーが発生しました' };
};

/**
 * エラータイプを判定する
 */
export const getErrorType = (error: unknown): ErrorType => {
  const normalized = normalizeError(error);
  
  if (normalized.code === 'TOKEN_EXPIRED' || normalized.code === 'PGRST116') {
    return ErrorType.AUTH;
  }
  
  if (normalized.message?.includes('network') || normalized.message?.includes('fetch')) {
    return ErrorType.NETWORK;
  }
  
  if (normalized.code?.startsWith('PGRST') || normalized.message?.includes('relation')) {
    return ErrorType.DATABASE;
  }
  
  if (normalized.message?.includes('API') || normalized.message?.includes('api')) {
    return ErrorType.API;
  }
  
  return ErrorType.UNKNOWN;
};

/**
 * ユーザーフレンドリーなエラーメッセージを生成
 */
export const getUserFriendlyMessage = (error: unknown, context?: ErrorContext): string => {
  const normalized = normalizeError(error);
  const errorType = getErrorType(error);
  
  switch (errorType) {
    case ErrorType.AUTH:
      if (normalized.code === 'TOKEN_EXPIRED') {
        return 'セッションの有効期限が切れました。再度ログインしてください。';
      }
      return '認証エラーが発生しました。再度ログインしてください。';
    
    case ErrorType.NETWORK:
      return 'ネットワークエラーが発生しました。インターネット接続を確認してください。';
    
    case ErrorType.DATABASE:
      if (normalized.message?.includes('does not exist') || normalized.message?.includes('relation')) {
        return 'データベーステーブルが存在しません。マイグレーションを実行してください。';
      }
      return 'データベースエラーが発生しました。';
    
    case ErrorType.API:
      return normalized.message || 'APIエラーが発生しました。';
    
    case ErrorType.VALIDATION:
      return normalized.message || '入力値が正しくありません。';
    
    default:
      return normalized.message || 'エラーが発生しました。';
  }
};

/**
 * エラーをログ出力する
 */
export const logError = (error: unknown, context?: ErrorContext): void => {
  const normalized = normalizeError(error);
  const errorType = getErrorType(error);
  
  console.error(`[${errorType}] ${normalized.message}`, {
    error: normalized,
    context,
    timestamp: new Date().toISOString(),
  });
};

/**
 * エラーを処理してユーザーに表示するためのメッセージを返す
 */
export const handleError = (error: unknown, context?: ErrorContext): string => {
  logError(error, context);
  return getUserFriendlyMessage(error, context);
};