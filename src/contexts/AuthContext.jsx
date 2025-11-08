import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 初期化時にlocalStorageから認証情報を読み込む
  useEffect(() => {
    const savedUser = localStorage.getItem('authUser');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        console.error('認証情報の読み込みに失敗しました', e);
        localStorage.removeItem('authUser');
      }
    }
    setLoading(false);
  }, []);

  // ログイン
  const login = (username, password) => {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.username === username);
    
    if (user && user.password === password) {
      const userData = { username: user.username, email: user.email };
      setUser(userData);
      localStorage.setItem('authUser', JSON.stringify(userData));
      return { success: true };
    } else {
      return { success: false, error: 'ユーザー名またはパスワードが正しくありません' };
    }
  };

  // 会員登録
  const register = (username, email, password, confirmPassword) => {
    // バリデーション
    if (!username || !email || !password || !confirmPassword) {
      return { success: false, error: 'すべての項目を入力してください' };
    }
    
    if (password !== confirmPassword) {
      return { success: false, error: 'パスワードが一致しません' };
    }
    
    if (password.length < 6) {
      return { success: false, error: 'パスワードは6文字以上である必要があります' };
    }

    const users = JSON.parse(localStorage.getItem('users') || '[]');
    
    // ユーザー名の重複チェック
    if (users.find(u => u.username === username)) {
      return { success: false, error: 'このユーザー名は既に使用されています' };
    }

    // メールアドレスの重複チェック
    if (users.find(u => u.email === email)) {
      return { success: false, error: 'このメールアドレスは既に登録されています' };
    }

    // 新規ユーザーを追加
    const newUser = {
      username,
      email,
      password, // 実際のアプリではハッシュ化すべき
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    localStorage.setItem('users', JSON.stringify(users));

    // 自動ログイン
    const userData = { username: newUser.username, email: newUser.email };
    setUser(userData);
    localStorage.setItem('authUser', JSON.stringify(userData));
    
    return { success: true };
  };

  // ログアウト
  const logout = () => {
    setUser(null);
    localStorage.removeItem('authUser');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, loading }}>
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

