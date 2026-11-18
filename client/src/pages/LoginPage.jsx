import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '@/layouts/AuthLayout';
import LoginForm from '@/components/auth/LoginForm';
import ReportButton from '@/components/ReportButton';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const { login, guestLogin, requestPasswordReset, verifyPasswordResetCode, completePasswordReset } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const testerModeEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TESTER_MODE === 'true';
  const signupNotice = location.state?.signupNotice || '';
  const signupEmail = location.state?.signupEmail || '';

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchType = search.get('type');
    const hashType = hash.get('type');
    const isRecoveryLink = searchType === 'recovery'
      || hashType === 'recovery';

    if (isRecoveryLink) {
      navigate(`/reset-password${window.location.search}${window.location.hash}`, { replace: true });
    }
  }, [navigate]);

  const handleLogin = async (email, password) => {
    await login(email, password);
    navigate('/dashboard');
  };

  const handleGuestLogin = async () => {
    await guestLogin();
    navigate('/dashboard');
  };

  const handlePasswordReset = async (email) => {
    await requestPasswordReset(email);
  };

  const handleVerifyPasswordResetCode = async (email, token) => {
    return verifyPasswordResetCode(email, token);
  };

  const handleCompletePasswordReset = async ({ session, password }) => {
    return completePasswordReset({ session, password });
  };

  const verifiedNotice = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('verified') === '1'
    ? 'Your email has been verified. You can sign in now.'
    : '';

  return (
    <>
      <AuthLayout>
        <LoginForm
          onSubmit={handleLogin}
          onGuestLogin={handleGuestLogin}
          onRequestPasswordReset={handlePasswordReset}
          onVerifyPasswordResetCode={handleVerifyPasswordResetCode}
          onCompletePasswordReset={handleCompletePasswordReset}
          testerModeEnabled={testerModeEnabled}
          initialSuccess={signupNotice || verifiedNotice}
          initialEmail={signupEmail}
        />
      </AuthLayout>
      <ReportButton section="login" floating />
    </>
  );
}
