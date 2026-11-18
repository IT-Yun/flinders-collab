import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Lock, Mail } from 'lucide-react';
import AuthLayout from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';

const RESET_COOLDOWN_SECONDS = 60;

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { requestPasswordReset, verifyPasswordResetCode, completePasswordReset } = useAuth();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resetSession, setResetSession] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const sendCode = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setError('');
    setSuccess('');

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(normalizedEmail);
      setCooldown(RESET_COOLDOWN_SECONDS);
      setStep('verify');
      setSuccess(`If an account exists for ${normalizedEmail}, a 6-digit code has been sent.`);
    } catch (err) {
      setError(err.message || 'Failed to send reset code.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    setError('');
    setSuccess('');
    const token = code.join('');

    if (token.length < 6) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setLoading(true);
    try {
      const session = await verifyPasswordResetCode(email.trim().toLowerCase(), token);
      setResetSession(session);
      setStep('password');
      setSuccess('Code verified. Set your new password.');
    } catch (err) {
      setError(err.message || 'Invalid reset code.');
    } finally {
      setLoading(false);
    }
  };

  const updatePassword = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await completePasswordReset({ session: resetSession, password });
      setSuccess('Your password has been updated. Redirecting to login...');
      window.setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (err) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="space-y-5">
        <div className="text-center space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">Reset password</h2>
          <p className="text-sm text-muted-foreground/70">Use a 6-digit verification code to update your password</p>
        </div>

        {step === 'email' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="reset-email" className="text-[13px] font-semibold text-foreground/70">Email</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <Input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  className="h-12 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
                  disabled={loading}
                />
              </div>
            </div>

            <Button
              type="button"
              onClick={sendCode}
              disabled={loading || cooldown > 0}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-semibold text-[15px] shadow-lg shadow-blue-600/20 text-white"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send reset code'}
            </Button>
          </div>
        )}

        {step === 'verify' && (
          <div className="space-y-4">
            <p className="text-center text-sm text-muted-foreground">
              Enter the 6-digit code sent to <span className="font-semibold text-foreground">{email}</span>.
            </p>
            <div className="flex justify-center gap-2">
              {code.map((digit, index) => (
                <input
                  key={index}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => {
                    if (!/^\d*$/.test(e.target.value)) return;
                    const next = [...code];
                    next[index] = e.target.value.slice(-1);
                    setCode(next);
                  }}
                  className="h-12 w-11 rounded-xl border-2 border-border/40 bg-muted/30 text-center text-lg font-bold focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep('email')} className="flex-1">
                Back
              </Button>
              <Button type="button" onClick={verifyCode} disabled={loading} className="flex-1">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</> : 'Verify code'}
              </Button>
            </div>
          </div>
        )}

        {step === 'password' && (
          <form onSubmit={updatePassword} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="new-password" className="text-[13px] font-semibold text-foreground/70">New password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 6 characters"
                  className="h-12 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
                  disabled={loading}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-[13px] font-semibold text-foreground/70">Confirm password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password"
                  className="h-12 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
                  disabled={loading}
                />
              </div>
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-semibold text-[15px] shadow-lg shadow-blue-600/20 text-white"
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Updating...' : 'Update password'}
            </Button>
          </form>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p className="text-sm text-emerald-700">{success}</p>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">Back to login</Link>
        </p>
      </div>
    </AuthLayout>
  );
}
