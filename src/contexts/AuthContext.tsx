import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import supabase from '../lib/supabaseClient';
import { loginUser, registerUser, logoutUser } from '../lib/authService';

type AuthResult = { success: boolean; error?: string; requiresConfirmation?: boolean };

type AuthContextValue = {
  user: Record<string, unknown> | null;
  session: Record<string, unknown> | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (username: string, email: string, password: string, confirmPassword: string) => Promise<AuthResult>;
  logout: () => Promise<void>;
};

type AuthProviderProps = {
  children: ReactNode;
};

const normalizeUser = (rawUser: Record<string, any> | null) => {
  if (!rawUser) {
    return null;
  }
  const username = rawUser.user_metadata?.username || rawUser.username || rawUser.email?.split?.('@')?.[0] || 'ユーザー';
  return { ...rawUser, username };
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<Record<string, unknown> | null>(null);
  const [session, setSession] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(data.session);
        setUser(normalizeUser((data.session as any)?.user ?? null));
      } catch (err) {
        console.error('認証情報の取得に失敗しました', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) return;
      setSession(nextSession ?? null);
      setUser(normalizeUser((nextSession as any)?.user ?? null));
    });

    initializeSession();

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  const login = async (email: string, password: string): Promise<AuthResult> => {
    try {
      const { data, error } = await loginUser(email, password);
      if (error) {
        return { success: false, error: error.message };
      }
      setSession(data.session);
      setUser(normalizeUser((data.session as any)?.user ?? null));
      return { success: true };
    } catch (err) {
      console.error('ログインに失敗しました', err);
      return { success: false, error: err instanceof Error ? err.message : 'ログインに失敗しました' };
    }
  };

  const register = async (
    username: string,
    email: string,
    password: string,
    confirmPassword: string
  ): Promise<AuthResult> => {
    if (!username || !email || !password || !confirmPassword) {
      return { success: false, error: 'すべての項目を入力してください' };
    }

    if (password !== confirmPassword) {
      return { success: false, error: 'パスワードが一致しません' };
    }

    if (password.length < 6) {
      return { success: false, error: 'パスワードは6文字以上である必要があります' };
    }

    try {
      const { data, error } = await registerUser(username, email, password);

      if (error) {
        return { success: false, error: error.message };
      }

      setSession(data.session || null);
      setUser(normalizeUser((data.session as any)?.user ?? null));

      return {
        success: true,
        requiresConfirmation: !data.session,
      };
    } catch (err) {
      console.error('会員登録に失敗しました', err);
      return { success: false, error: err instanceof Error ? err.message : '会員登録に失敗しました' };
    }
  };

  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      setSession(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
