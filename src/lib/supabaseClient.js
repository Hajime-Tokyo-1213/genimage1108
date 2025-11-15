const SESSION_STORAGE_KEY = 'sb_session';
const AUTH_LISTENERS = new Set();

const getLocalStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage;
};

const getEnv = (key) => {
  const value = import.meta.env[key];
  if (!value) {
    throw new Error(`${key} is not defined in environment variables`);
  }
  return value;
};

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (err) {
    console.error('Failed to parse session from storage', err);
    return null;
  }
};

const getStoredSession = () => {
  const storage = getLocalStorage();
  if (!storage) return null;
  return safeJsonParse(storage.getItem(SESSION_STORAGE_KEY));
};

const persistSession = (session) => {
  const storage = getLocalStorage();
  if (!storage) return;
  if (session) {
    storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } else {
    storage.removeItem(SESSION_STORAGE_KEY);
  }
  AUTH_LISTENERS.forEach(listener => {
    try {
      listener(session);
    } catch (err) {
      console.error('Auth listener failed', err);
    }
  });
};

const handleAuthResponse = async (response) => {
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error('Failed to parse Supabase auth response', err);
    }
  }
  if (!response.ok) {
    const message = data?.error_description || data?.message || data?.error || 'Supabase authentication failed';
    return { data: null, error: new Error(message) };
  }
  const session = data?.session || (data?.access_token
    ? {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type,
        expires_in: data.expires_in,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 0),
        user: data.user,
      }
    : null);
  if (session) {
    persistSession(session);
  }
  return { data: { session, user: session?.user || data?.user }, error: null };
};

const buildAuthHeaders = () => ({
  apikey: getEnv('VITE_SUPABASE_ANON_KEY'),
  'Content-Type': 'application/json',
});

const request = async (path, { method = 'GET', body, headers = {}, accessToken } = {}) => {
  const url = `${getEnv('VITE_SUPABASE_URL')}${path}`;
  const finalHeaders = {
    apikey: getEnv('VITE_SUPABASE_ANON_KEY'),
    ...headers,
  };
  if (body !== undefined) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  const token = accessToken || getStoredSession()?.access_token || getEnv('VITE_SUPABASE_ANON_KEY');
  finalHeaders['Authorization'] = `Bearer ${token}`;
  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error('Failed to parse Supabase response', err);
    }
  }
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || text || 'Supabase request failed';
    throw new Error(message);
  }
  return data;
};

export const supabaseAuth = {
  async getSession() {
    return { data: { session: getStoredSession() }, error: null };
  },
  onAuthStateChange(callback) {
    AUTH_LISTENERS.add(callback);
    return {
      data: {
        subscription: {
          unsubscribe: () => AUTH_LISTENERS.delete(callback),
        },
      },
    };
  },
  async signInWithPassword({ email, password }) {
    if (!email || !password) {
      return { data: null, error: new Error('メールアドレスとパスワードを入力してください') };
    }
    const response = await fetch(`${getEnv('VITE_SUPABASE_URL')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const result = await handleAuthResponse(response);
    if (!result.error && !result.data.session) {
      return { data: result.data, error: new Error('メールアドレスの確認が必要です。受信トレイを確認してください。') };
    }
    return result;
  },
  async signUp({ email, password, options }) {
    const response = await fetch(`${getEnv('VITE_SUPABASE_URL')}/auth/v1/signup`, {
      method: 'POST',
      headers: buildAuthHeaders(),
      body: JSON.stringify({ email, password, data: options?.data || {} }),
    });
    return handleAuthResponse(response);
  },
  async signOut() {
    const session = getStoredSession();
    if (session?.access_token) {
      try {
        await fetch(`${getEnv('VITE_SUPABASE_URL')}/auth/v1/logout`, {
          method: 'POST',
          headers: {
            ...buildAuthHeaders(),
            Authorization: `Bearer ${session.access_token}`,
          },
        });
      } catch (err) {
        console.warn('Failed to revoke Supabase session', err);
      }
    }
    persistSession(null);
    return { error: null };
  },
};

export const supabaseRest = request;
export const getSupabaseSession = getStoredSession;
