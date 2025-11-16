import { SupabaseClient, Session } from '@supabase/supabase-js';
import { supabase, requireSession } from './supabaseClient';
import { getEnvVar, resolveSiteUrl } from '../utils/env';
import { normalizeError, logError } from '../utils/errorHandler';
import { ImageData, ErrorWithCode } from '../types';

/**
 * 認証情報を検証する
 */
const ensureCredentials = (email: string, password: string): void => {
  if (!email || !password) {
    const err: ErrorWithCode = new Error('メールアドレスとパスワードを入力してください');
    err.code = 'VALIDATION';
    throw err;
  }
};

/**
 * ユーザーログイン
 */
export const loginUser = async (
  email: string,
  password: string,
  client: SupabaseClient = supabase
) => {
  ensureCredentials(email, password);
  return client.auth.signInWithPassword({ email, password });
};

/**
 * ユーザー登録
 */
export const registerUser = async (
  username: string,
  email: string,
  password: string,
  client: SupabaseClient = supabase
) => {
  ensureCredentials(email, password);
  if (!username) {
    const err: ErrorWithCode = new Error('ユーザー名を入力してください');
    err.code = 'VALIDATION';
    throw err;
  }
  const siteUrl = resolveSiteUrl();
  const options: { data: { username: string }; emailRedirectTo?: string } = {
    data: { username },
  };
  if (siteUrl) {
    options.emailRedirectTo = `${siteUrl}/auth/callback`;
  }
  return client.auth.signUp({
    email,
    password,
    options,
  });
};

/**
 * ユーザーログアウト
 */
export const logoutUser = async (client: SupabaseClient = supabase) => {
  return client.auth.signOut();
};

/**
 * 有効なセッションを取得する（期限切れの場合はリフレッシュを試みる）
 */
export const ensureFreshSession = async (client: SupabaseClient = supabase): Promise<Session> => {
  const { data, error } = await client.auth.getSession();
  
  if (error) {
    const err: ErrorWithCode = new Error(error.message || 'セッションの取得に失敗しました');
    err.code = error.name;
    throw err;
  }
  
  let session = data.session;
  if (!session) {
    const err: ErrorWithCode = new Error('この操作にはログインが必要です');
    err.status = 401;
    throw err;
  }
  
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
  const isExpired = expiresAtMs ? expiresAtMs <= Date.now() : false;
  
  if (isExpired) {
    if (typeof client.auth.refreshSession === 'function') {
      const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshed?.session) {
        const err: ErrorWithCode = new Error('セッションの有効期限が切れました');
        err.code = 'TOKEN_EXPIRED';
        throw err;
      }
      session = refreshed.session;
    } else {
      const err: ErrorWithCode = new Error('セッションの有効期限が切れました');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }
  }
  
  return session;
};

/**
 * 画像履歴を保存
 */
export const persistImageHistory = async (
  image: ImageData,
  client: SupabaseClient = supabase
): Promise<ImageData> => {
  try {
    const session = await ensureFreshSession(client);
    const payload: Record<string, any> = {
      id: image.id,
      user_id: session.user.id,
      prompt: image.prompt,
      thumbnail_url: image.thumbnailUrl ?? image.imageUrl ?? null,
      created_at: image.createdAt,
      revision: image.revision ?? 0,
      title: image.title ?? '',
      saved: image.saved ?? false,
    };
    
    // フルサイズ画像も保存（full_image_urlカラムが存在する場合）
    if (image.fullImageUrl || image.imageUrl) {
      payload.full_image_url = image.fullImageUrl ?? image.imageUrl ?? null;
    }
    
    logError('🔍 画像履歴保存リクエスト', {
      component: 'authService',
      action: 'persistImageHistory',
      userId: session.user.id,
      imageId: payload.id,
      has_thumbnail: !!payload.thumbnail_url,
      has_full_image: !!payload.full_image_url
    });
    
    const { data, error } = await client
      .from('image_histories')
      .upsert(payload, { onConflict: 'id' });
    
    // full_image_urlカラムが存在しない場合は、そのフィールドを除外して再試行
    if (error && error.message && error.message.includes('full_image_url')) {
      console.warn('⚠️ full_image_urlカラムが存在しないため、そのフィールドを除外して再試行します');
      delete payload.full_image_url;
      const { error: retryError } = await client
        .from('image_histories')
        .upsert(payload, { onConflict: 'id' });
      if (retryError) {
        logError(retryError, {
          component: 'authService',
          action: 'persistImageHistory',
          userId: session.user.id,
          retry: true
        });
        throw retryError;
      }
      console.warn('full_image_urlカラムが存在しません。データベースにカラムを追加してください。');
    } else if (error) {
      logError(error, {
        component: 'authService',
        action: 'persistImageHistory',
        userId: session.user.id,
        imageId: payload.id
      });
      throw error;
    }
    
    console.log('✅ 画像履歴保存成功:', data);
    return payload as ImageData;
  } catch (error) {
    logError(error, {
      component: 'authService',
      action: 'persistImageHistory',
      imageId: image.id
    });
    throw error;
  }
};

/**
 * 画像履歴を削除
 */
export const removeImageHistory = async (
  imageId: string,
  client: SupabaseClient = supabase
): Promise<void> => {
  try {
    const session = await requireSession(client);
    const { error } = await client
      .from('image_histories')
      .delete()
      .eq('id', imageId)
      .eq('user_id', session.user.id);
    if (error) {
      throw error;
    }
  } catch (error) {
    logError(error, {
      component: 'authService',
      action: 'removeImageHistory',
      imageId
    });
    throw error;
  }
};

/**
 * 画像アーカイブに保存
 */
export const persistImageArchive = async (
  image: ImageData,
  client: SupabaseClient = supabase
): Promise<ImageData | null> => {
  try {
    const session = await ensureFreshSession(client);
    
    // base64データを取得
    let base64Data: string | null = null;
    if (image.fullImageUrl) {
      const parts = image.fullImageUrl.split(',');
      base64Data = parts.length > 1 ? parts[1] : image.fullImageUrl;
    } else if (image.imageUrl) {
      const parts = image.imageUrl.split(',');
      base64Data = parts.length > 1 ? parts[1] : image.imageUrl;
    }
    
    const payload = {
      id: image.id,
      user_id: session.user.id,
      prompt: image.prompt || '',
      image_base64: base64Data,
      created_at: image.createdAt || new Date().toISOString(),
      title: image.title || '',
    };
    
    logError('🔍 画像アーカイブ保存リクエスト', {
      component: 'authService',
      action: 'persistImageArchive',
      userId: session.user.id,
      imageId: payload.id,
      has_base64: !!payload.image_base64
    });
    
    const { data, error } = await client
      .from('image_history_archive')
      .upsert(payload, { onConflict: 'id' });
    
    if (error) {
      logError(error, {
        component: 'authService',
        action: 'persistImageArchive',
        userId: session.user.id,
        imageId: payload.id
      });
      // エラーが発生しても警告のみ（テーブルが存在しない場合など）
      console.warn('画像アーカイブの保存に失敗しましたが、処理は続行します:', error.message);
      return null;
    }
    
    console.log('✅ 画像アーカイブ保存成功:', data);
    return payload as ImageData;
  } catch (error) {
    logError(error, {
      component: 'authService',
      action: 'persistImageArchive',
      imageId: image.id
    });
    return null;
  }
};

/**
 * 画像アーカイブを取得
 */
export const getImageArchive = async (
  client: SupabaseClient = supabase,
  limit: number = 100,
  offset: number = 0
) => {
  try {
    const session = await requireSession(client);
    const { data, error } = await client
      .from('image_history_archive')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      logError(error, {
        component: 'authService',
        action: 'getImageArchive',
        userId: session.user.id
      });
      throw error;
    }
    
    return data || [];
  } catch (error) {
    logError(error, {
      component: 'authService',
      action: 'getImageArchive',
      limit,
      offset
    });
    throw error;
  }
};