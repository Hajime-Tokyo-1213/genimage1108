import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabaseAuth } from '../lib/supabaseClient';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        const { data } = await supabaseAuth.getSession();
        if (!isMounted) return;
        setSession(data.session);
        setUser(data.session?.user ?? null);
      } catch (err) {
        console.error('認証情報の取得に失敗しました', err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    const { data: listener } = supabaseAuth.onAuthStateChange((nextSession) => {
      if (!isMounted) return;
      setSession(nextSession || null);
      setUser(nextSession?.user ?? null);
    });

    initializeSession();

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  const login = async (email, password) => {
    try {
      const { data, error } = await supabaseAuth.signInWithPassword({ email, password });
      if (error) {
        return { success: false, error: error.message };
      }
      setSession(data.session);
      setUser(data.session?.user ?? null);
      return { success: true };
    } catch (err) {
      console.error('ログインに失敗しました', err);
      return { success: false, error: err.message || 'ログインに失敗しました' };
    }
  };

  const register = async (username, email, password, confirmPassword) => {
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
      const { data, error } = await supabaseAuth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });

      if (error) {
        return { success: false, error: error.message };
      }

      setSession(data.session || null);
      setUser(data.session?.user ?? null);

      return {
        success: true,
        requiresConfirmation: !data.session,
      };
    } catch (err) {
      console.error('会員登録に失敗しました', err);
      return { success: false, error: err.message || '会員登録に失敗しました' };
    }
  };

  const logout = async () => {
    try {
      await supabaseAuth.signOut();
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

