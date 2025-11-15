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
  console.log('[persistImageHistory] 保存開始:', {
    imageId: image.id,
    hasPrompt: !!image.prompt,
    hasThumbnail: !!image.thumbnailUrl,
    createdAt: image.createdAt,
  });

  const session = await ensureFreshSession(client);
  console.log('[persistImageHistory] セッション確認成功:', {
    userId: session.user.id,
    sessionExpires: session.expires_at,
  });

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

  console.log('[persistImageHistory] 送信データ:', {
    id: payload.id,
    user_id: payload.user_id,
    promptLength: payload.prompt?.length || 0,
    thumbnailLength: payload.thumbnail_url?.length || 0,
    created_at: payload.created_at,
    revision: payload.revision,
  });

  const { data, error } = await client
    .from('image_histories')
    .upsert(payload, { onConflict: 'id' });

  if (error) {
    console.error('[persistImageHistory] Supabaseエラー:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code,
    });
    throw error;
  }

  console.log('[persistImageHistory] 保存成功:', {
    imageId: payload.id,
    responseData: data,
  });

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
