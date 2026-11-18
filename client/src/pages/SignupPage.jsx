import React from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '@/layouts/AuthLayout';
import SignupForm from '@/components/auth/SignupForm';
import ReportButton from '@/components/ReportButton';
import { useAuth } from '@/hooks/useAuth';

export default function SignupPage() {
  const { completeSignup } = useAuth();
  const navigate = useNavigate();

  const handleComplete = async (data) => {
    await completeSignup(data);
    navigate('/dashboard', { replace: true });
  };

  return (
    <>
      <AuthLayout>
        <SignupForm onComplete={handleComplete} />
      </AuthLayout>
      <ReportButton section="signup" floating />
    </>
  );
}
