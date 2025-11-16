import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import supabase from '../lib/supabaseClient';
import './Auth.css';

const getParam = (primary, fallback) => {
  if (primary) return primary;
  return fallback || null;
};

const AuthCallback = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState({ message: '認証処理を実行しています…', error: false });

  useEffect(() => {
    let isMounted = true;
    const handleAuthCallback = async () => {
      const hashParams = new URLSearchParams(location.hash?.replace(/^#/, '') || '');
      const searchParams = new URLSearchParams(location.search || '');
      const extractParam = (key) => getParam(hashParams.get(key), searchParams.get(key));

      try {
        const errorDescription = extractParam('error_description') || extractParam('error');
        if (errorDescription) {
          throw new Error(errorDescription);
        }

        const accessToken = extractParam('access_token');
        const refreshToken = extractParam('refresh_token');
        const code = extractParam('code');
        const token = extractParam('token') || extractParam('token_hash');
        const type = (extractParam('type') || '').toLowerCase();
        const email = extractParam('email') || extractParam('email_address');

        let response;
        if (accessToken && refreshToken) {
          response = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        } else if (code) {
          response = await supabase.auth.exchangeCodeForSession(code);
        } else if (token) {
          const allowedOtpTypes = ['signup', 'magiclink', 'recovery', 'invite', 'email_change'];
          const otpType = allowedOtpTypes.includes(type) ? type : 'signup';
          const payload = { type: otpType };
          if (email) {
            payload.email = email;
            payload.token = token;
          } else {
            payload.token_hash = token;
          }
          response = await supabase.auth.verifyOtp(payload);
        } else {
          throw new Error('認証情報が見つかりません。リンクが無効か、有効期限が切れています。');
        }

        if (response.error) {
          throw response.error;
        }

        if (!isMounted) return;
        setStatus({ message: '認証が完了しました。画面を移動します…', error: false });
        setTimeout(() => navigate('/image-generator', { replace: true }), 1200);
      } catch (err) {
        if (!isMounted) return;
        setStatus({
          message: err instanceof Error ? err.message : '認証処理に失敗しました。もう一度お試しください。',
          error: true,
        });
      }
    };

    handleAuthCallback();
    return () => {
      isMounted = false;
    };
  }, [location.hash, location.search, navigate]);

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>アカウント確認</h1>
        <p className={status.error ? 'error-message' : 'info-message'}>{status.message}</p>
        {!status.error && <p>このままお待ちください…</p>}
      </div>
    </div>
  );
};

export default AuthCallback;
