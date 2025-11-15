import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

const Login = () => {
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [registerUsername, setRegisterUsername] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const result = await login(loginEmail, loginPassword);
    if (result.success) {
      navigate('/image-generator');
    } else {
      setError(result.error);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const result = await register(
      registerUsername,
      registerEmail,
      registerPassword,
      registerConfirmPassword
    );
    if (result.success) {
      if (result.requiresConfirmation) {
        setInfoMessage('確認メールを送信しました。メール内のリンクからアカウントを有効化してください。');
      } else {
        navigate('/image-generator');
      }
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
                <label htmlFor="email">メールアドレス</label>
                <input
                  id="email"
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="password">パスワード</label>
                <input
                  id="password"
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              {infoMessage && <div className="info-message">{infoMessage}</div>}
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
                  type="text"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-email">メールアドレス</label>
                <input
                  id="reg-email"
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="reg-password">パスワード</label>
                <input
                  id="reg-password"
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  required
                  minLength={6}
                />
                <small>6文字以上で入力してください</small>
              </div>
              <div className="form-group">
                <label htmlFor="confirmPassword">パスワード（確認）</label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={registerConfirmPassword}
                  onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {error && <div className="error-message">{error}</div>}
              {infoMessage && <div className="info-message">{infoMessage}</div>}
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

