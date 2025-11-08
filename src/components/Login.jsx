import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    setError('');
    
    const result = login(username, password);
    if (result.success) {
      navigate('/image-generator');
    } else {
      setError(result.error);
    }
  };

  const handleRegister = (e) => {
    e.preventDefault();
    setError('');
    
    const formData = new FormData(e.target);
    const email = formData.get('email');
    const confirmPassword = formData.get('confirmPassword');
    
    const result = register(username, email, password, confirmPassword);
    if (result.success) {
      navigate('/image-generator');
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>画像生成アプリ</h1>
        
        {!showRegister ? (
          <>
            <h2>ログイン</h2>
            <form onSubmit={handleLogin} className="auth-form">
              <div className="form-group">
                <label htmlFor="username">ユーザー名</label>
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">パスワード</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="auth-button">
                ログイン
              </button>
            </form>
            <p className="auth-switch">
              アカウントをお持ちでない方は{' '}
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className="link-button"
              >
                会員登録
              </button>
            </p>
          </>
        ) : (
          <>
            <h2>会員登録</h2>
            <form onSubmit={handleRegister} className="auth-form">
              <div className="form-group">
                <label htmlFor="reg-username">ユーザー名</label>
                <input
                  id="reg-username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">メールアドレス</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-password">パスワード</label>
                <input
                  id="reg-password"
                  name="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <small>6文字以上で入力してください</small>
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">パスワード（確認）</label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              <button type="submit" className="auth-button">
                会員登録
              </button>
            </form>
            <p className="auth-switch">
              既にアカウントをお持ちの方は{' '}
              <button
                type="button"
                onClick={() => setShowRegister(false)}
                className="link-button"
              >
                ログイン
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Login;

