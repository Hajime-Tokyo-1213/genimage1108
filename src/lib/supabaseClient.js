import { createClient } from '@supabase/supabase-js';

const getEnvVar = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env[key]) {
    return import.meta.env[key];
  }
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  return undefined;
};

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL is not defined');
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not defined');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb_session',
  },
});

export const requireSession = async (client = supabase) => {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw new Error(error.message || 'セッションの取得に失敗しました');
  }
  if (!data.session) {
    const err = new Error('この操作にはログインが必要です');
    err.status = 401;
    throw err;
  }
  return data.session;
};

export default supabase;
