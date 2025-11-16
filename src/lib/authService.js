import { supabase, requireSession } from './supabaseClient.js';

const getEnvVar = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
};

const resolveSiteUrl = () => {
  const envSiteUrl = getEnvVar('VITE_SITE_URL') || getEnvVar('SITE_URL');
  if (envSiteUrl) {
    return envSiteUrl.replace(/\/$/, '');
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return undefined;
};

const ensureCredentials = (email, password) => {
  if (!email || !password) {
    throw new Error('メールアドレスとパスワードを入力してください');
  }
};

export const loginUser = async (email, password, client = supabase) => {
  ensureCredentials(email, password);
  return client.auth.signInWithPassword({ email, password });
};

export const registerUser = async (username, email, password, client = supabase) => {
  ensureCredentials(email, password);
  if (!username) {
    throw new Error('ユーザー名を入力してください');
  }
  const siteUrl = resolveSiteUrl();
  const options = {
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

export const logoutUser = async (client = supabase) => client.auth.signOut();

export const ensureFreshSession = async (client = supabase) => {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message || 'セッションの取得に失敗しました');
  }
  let session = data.session;
  if (!session) {
    const err = new Error('この操作にはログインが必要です');
    err.status = 401;
    throw err;
  }
  const expiresAtMs = session.expires_at ? session.expires_at * 1000 : null;
  const isExpired = expiresAtMs ? expiresAtMs <= Date.now() : false;
  if (isExpired) {
    if (typeof client.auth.refreshSession === 'function') {
      const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
      if (refreshError || !refreshed?.session) {
        const err = new Error('セッションの有効期限が切れました');
        err.code = 'TOKEN_EXPIRED';
        throw err;
      }
      session = refreshed.session;
    } else {
      const err = new Error('セッションの有効期限が切れました');
      err.code = 'TOKEN_EXPIRED';
      throw err;
    }
  }
  return session;
};

export const persistImageHistory = async (image, client = supabase) => {
  const session = await ensureFreshSession(client);
  const payload = {
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
  // カラムが存在しない場合はエラーになるので、エラーハンドリングで対応
  if (image.fullImageUrl || image.imageUrl) {
    payload.full_image_url = image.fullImageUrl ?? image.imageUrl ?? null;
  }
  
  console.log('🔍 画像履歴保存リクエスト:', {
    id: payload.id,
    user_id: payload.user_id,
    prompt_length: payload.prompt?.length || 0,
    has_thumbnail: !!payload.thumbnail_url,
    has_full_image: !!payload.full_image_url,
    revision: payload.revision,
    title: payload.title,
    saved: payload.saved
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
      console.error('❌ 画像履歴保存エラー（再試行後）:', {
        error: retryError,
        message: retryError.message,
        details: retryError.details,
        hint: retryError.hint,
        code: retryError.code
      });
      throw retryError;
    }
    // カラムが存在しない場合は警告を出すが、処理は続行
    console.warn('full_image_urlカラムが存在しません。データベースにカラムを追加してください。');
  } else if (error) {
    console.error('❌ 画像履歴保存エラー:', {
      error: error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
      payload: payload
    });
    throw error;
  }
  
  console.log('✅ 画像履歴保存成功:', data);
  return payload;
};

export const removeImageHistory = async (imageId, client = supabase) => {
  const session = await requireSession(client);
  const { error } = await client
    .from('image_histories')
    .delete()
    .eq('id', imageId)
    .eq('user_id', session.user.id);
  if (error) {
    throw error;
  }
};

// 削除されない履歴アーカイブに保存（画像削除時も残す）
export const persistImageArchive = async (image, client = supabase) => {
  const session = await ensureFreshSession(client);
  
  // base64データを取得（fullImageUrlまたはimageUrlから）
  let base64Data = null;
  if (image.fullImageUrl) {
    // data:image/png;base64,xxxxx の形式からbase64部分を抽出
    const parts = image.fullImageUrl.split(',');
    if (parts.length > 1) {
      base64Data = parts[1];
    } else {
      base64Data = image.fullImageUrl;
    }
  } else if (image.imageUrl) {
    const parts = image.imageUrl.split(',');
    if (parts.length > 1) {
      base64Data = parts[1];
    } else {
      base64Data = image.imageUrl;
    }
  }
  
  const payload = {
    id: image.id,
    user_id: session.user.id,
    prompt: image.prompt || '',
    image_base64: base64Data,
    created_at: image.createdAt || new Date().toISOString(),
    title: image.title || '',
  };
  
  console.log('🔍 画像アーカイブ保存リクエスト:', {
    id: payload.id,
    user_id: payload.user_id,
    prompt_length: payload.prompt?.length || 0,
    has_base64: !!payload.image_base64,
    base64_length: payload.image_base64 ? payload.image_base64.length : 0,
    created_at: payload.created_at
  });
  
  const { data, error } = await client
    .from('image_history_archive')
    .upsert(payload, { onConflict: 'id' });
  
  if (error) {
    console.error('❌ 画像アーカイブ保存エラー:', {
      error: error,
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
    // エラーが発生しても警告のみ（テーブルが存在しない場合など）
    console.warn('画像アーカイブの保存に失敗しましたが、処理は続行します:', error.message);
    return null;
  }
  
  console.log('✅ 画像アーカイブ保存成功:', data);
  return payload;
};

// 画像アーカイブを取得
export const getImageArchive = async (client = supabase, limit = 100, offset = 0) => {
  const session = await requireSession(client);
  const { data, error } = await client
    .from('image_history_archive')
    .select('*')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (error) {
    console.error('❌ 画像アーカイブ取得エラー:', error);
    throw error;
  }
  
  return data || [];
};
