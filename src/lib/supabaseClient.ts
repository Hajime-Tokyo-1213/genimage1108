import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { getEnvVar } from '../utils/env';
import { ErrorWithCode } from '../types';

const supabaseUrl = getEnvVar('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnvVar('VITE_SUPABASE_ANON_KEY');

if (!supabaseUrl) {
  throw new Error('VITE_SUPABASE_URL is not defined');
}

if (!supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_ANON_KEY is not defined');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb_session',
  },
});

/**
 * セッションを取得する（セッションが存在しない場合はエラーをスロー）
 * @param client - Supabaseクライアント（デフォルト: supabase）
 * @returns セッション
 * @throws セッションが存在しない場合、またはエラーが発生した場合
 */
export const requireSession = async (client: SupabaseClient = supabase): Promise<Session> => {
  const { data, error } = await client.auth.getSession();
  
  if (error) {
    const err: ErrorWithCode = new Error(error.message || 'セッションの取得に失敗しました');
    err.code = error.name;
    throw err;
  }
  
  if (!data.session) {
    const err: ErrorWithCode = new Error('この操作にはログインが必要です');
    err.status = 401;
    throw err;
  }
  
  return data.session;
};

export default supabase;