import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Mail, Lock, UserPlus } from 'lucide-react';

export default function LoginForm({
  onSubmit,
  onGuestLogin,
  onRequestPasswordReset,
  onVerifyPasswordResetCode,
  onCompletePasswordReset,
  testerModeEnabled = false,
  initialSuccess = '',
  initialEmail = '',
}) {
  const RESET_COOLDOWN_SECONDS = 60;
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(initialSuccess);
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStep, setResetStep] = useState('email');
  const [resetCode, setResetCode] = useState(['', '', '', '', '', '']);
  const [resetSession, setResetSession] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmResetPassword, setConfirmResetPassword] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetCooldown, setResetCooldown] = useState(0);

  useEffect(() => {
    if (resetCooldown <= 0) return undefined;
    const timer = window.setInterval(() => {
      setResetCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resetCooldown]);

  useEffect(() => {
    setEmail(initialEmail || '');
  }, [initialEmail]);

  useEffect(() => {
    setSuccess(initialSuccess || '');
  }, [initialSuccess]);

  useEffect(() => {
    const handleFocusIn = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches('input, textarea, select')) return;

      window.setTimeout(() => {
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 260);
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  const formatCooldown = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins <= 0) return `${secs}s`;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await onSubmit(normalizedEmail, password);
    } catch (err) {
      const msg = err.message || 'Login failed';
      if (msg === 'Failed to fetch' || msg === 'Load failed') {
        setError('Server is starting up. Please try again in a few seconds.');
      } else if (msg.toLowerCase().includes('internal server error')) {
        setError('Something went wrong. Please check your email format and try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    setError('');
    setResetMessage('');
    const normalizedEmail = resetEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (resetCooldown > 0) {
      setError(`Please wait ${formatCooldown(resetCooldown)} before requesting another reset.`);
      return;
    }

    setResetLoading(true);
    try {
      await onRequestPasswordReset?.(normalizedEmail);
      setResetCooldown(RESET_COOLDOWN_SECONDS);
      setResetMessage(`If an account exists for ${normalizedEmail}, a 6-digit reset code has been sent. Please check your inbox and spam folder.`);
      setResetStep('verify');
    } catch (err) {
      const msg = err.message || 'Failed to send password reset request';
      if (msg === 'Failed to fetch' || msg === 'Load failed') {
        setError('Server is starting up. Please try again in a few seconds.');
      } else if (msg.toLowerCase().includes('wait') || msg.toLowerCase().includes('rate')) {
        setResetCooldown(RESET_COOLDOWN_SECONDS);
        setError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setResetLoading(false);
    }
  };

  const handleResetCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...resetCode];
    next[index] = value.slice(-1);
    setResetCode(next);
  };

  const handleVerifyResetCode = async () => {
    setError('');
    setResetMessage('');
    const token = resetCode.join('');

    if (token.length < 6) {
      setError('Please enter the full 6-digit reset code.');
      return;
    }

    setResetLoading(true);
    try {
      const session = await onVerifyPasswordResetCode?.(resetEmail.trim().toLowerCase(), token);
      setResetSession(session);
      setResetStep('password');
      setResetMessage('Code verified. Set your new password.');
    } catch (err) {
      setError(err.message || 'Invalid reset code');
    } finally {
      setResetLoading(false);
    }
  };

  const handleCompletePasswordReset = async () => {
    setError('');
    setResetMessage('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmResetPassword) {
      setError('Passwords do not match.');
      return;
    }

    setResetLoading(true);
    try {
      await onCompletePasswordReset?.({ session: resetSession, password: newPassword });
      setResetMessage('Your password has been updated. You can sign in now.');
      setResetOpen(false);
      setSuccess('Your password has been updated. Sign in with the new password.');
      setPassword('');
    } catch (err) {
      setError(err.message || 'Failed to update password');
    } finally {
      setResetLoading(false);
    }
  };

  const openResetDialog = () => {
    setError('');
    setResetMessage('');
    setResetEmail(email.trim().toLowerCase());
    setResetStep('email');
    setResetCode(['', '', '', '', '', '']);
    setResetSession(null);
    setNewPassword('');
    setConfirmResetPassword('');
    setResetOpen(true);
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4 pb-1 sm:space-y-5">
        <div className="space-y-1.5 text-center">
          <h2 className="text-[2rem] font-bold tracking-tight leading-none sm:text-2xl">Welcome back</h2>
          <p className="text-[13px] text-muted-foreground/75 sm:text-sm">Sign in to your account to continue</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="email" className="text-[13px] font-semibold text-foreground/70">Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input
              id="email"
              type="email"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="h-11 rounded-xl border-border/40 bg-muted/25 pl-10 focus:bg-white sm:h-12"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <label htmlFor="password" className="text-[13px] font-semibold text-foreground/70">Password</label>
            <button
              type="button"
              onClick={openResetDialog}
              disabled={loading || guestLoading}
              className="text-left text-[12px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-50 sm:text-right"
            >
              Forgot password?
            </button>
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input
              id="password"
              type="password"
              placeholder="Min. 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 rounded-xl border-border/40 bg-muted/25 pl-10 focus:bg-white sm:h-12"
            />
          </div>
        </div>

        {success && (
          <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 px-5 py-5 text-center shadow-md animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
              <Mail className="h-6 w-6 text-amber-600" />
            </div>
            <p className="text-[16px] font-extrabold text-amber-900">Almost done! Check your email</p>
            <p className="mt-2 text-[13px] leading-relaxed text-amber-800/80">
              {success}
            </p>
            <p className="mt-2.5 text-[12px] font-semibold text-amber-700/70">
              Don't forget to check your spam folder
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <svg className="h-4 w-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <circle cx="10" cy="10" r="10" />
              <text x="10" y="14" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">!</text>
            </svg>
            <p className="min-w-0 break-words text-sm text-destructive">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-[15px] font-semibold text-white shadow-lg shadow-blue-600/20 hover:from-blue-700 hover:to-indigo-700 sm:h-12"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Signing in...' : 'Sign In'}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border/40" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground/50">New here?</span>
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 opacity-60 blur-sm animate-pulse" />
          <Link
            to="/signup"
            className="relative group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3.5 font-bold text-[15px] text-white shadow-xl shadow-emerald-500/30 transition-all hover:from-emerald-600 hover:to-teal-600 hover:shadow-emerald-500/40 hover:scale-[1.01] active:scale-[0.98] sm:py-4"
          >
            <UserPlus className="h-5 w-5" />
            Create an Account
            <span className="ml-0.5 text-white/70 transition-transform group-hover:translate-x-0.5">&rarr;</span>
          </Link>
        </div>

        {testerModeEnabled && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground/50">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={async () => {
                setGuestLoading(true);
                setError('');
                setSuccess('');
                try {
                  await onGuestLogin();
                } catch (err) {
                  const msg = err.message || 'Failed to start tester mode';
                  if (msg === 'Failed to fetch' || msg === 'Load failed') {
                    setError('Server is starting up. Please try again in a few seconds.');
                  } else {
                    setError(msg);
                  }
                } finally {
                  setGuestLoading(false);
                }
              }}
              disabled={guestLoading || loading}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-center text-[14px] font-semibold text-white shadow-lg shadow-emerald-500/20 transition-all hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 whitespace-normal"
            >
              {guestLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {guestLoading ? 'Setting up...' : '🎓 Try as Tester (Tutorial Only)'}
            </button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground/50">
              No signup needed — see a quick demo of the app
            </p>
          </>
        )}
      </form>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] w-[calc(100vw-1.5rem)] max-w-md overflow-y-auto rounded-2xl p-5 sm:max-h-[calc(100vh-3rem)] sm:w-full">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Use a 6-digit verification code to reset your password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {resetStep === 'email' && (
              <div className="space-y-2">
                <label htmlFor="reset-email" className="text-[13px] font-semibold text-foreground/70">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="you@university.edu"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    className="h-12 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
                    disabled={resetLoading}
                  />
                </div>
              </div>
            )}

            {resetStep === 'verify' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Enter the 6-digit code sent to <span className="font-semibold text-foreground">{resetEmail}</span>.
                </p>
                <div className="flex justify-center gap-2">
                  {resetCode.map((digit, index) => (
                    <input
                      key={index}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleResetCodeChange(index, e.target.value)}
                      className="h-12 w-11 rounded-xl border-2 border-border/40 bg-muted/30 text-center text-lg font-bold focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  ))}
                </div>
              </div>
            )}

            {resetStep === 'password' && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="new-reset-password" className="text-[13px] font-semibold text-foreground/70">New password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                    <Input
                      id="new-reset-password"
                      type="password"
                      placeholder="Min. 6 characters"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="h-12 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
                      disabled={resetLoading}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="confirm-reset-password" className="text-[13px] font-semibold text-foreground/70">Confirm password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
                    <Input
                      id="confirm-reset-password"
                      type="password"
                      placeholder="Repeat password"
                      value={confirmResetPassword}
                      onChange={(e) => setConfirmResetPassword(e.target.value)}
                      className="h-12 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
                      disabled={resetLoading}
                    />
                  </div>
                </div>
              </div>
            )}

            {resetMessage && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                <p className="break-words text-sm text-emerald-700">{resetMessage}</p>
              </div>
            )}

            {resetCooldown > 0 && (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                <p className="break-words text-sm text-blue-700">
                  You can request another reset in <span className="font-semibold">{formatCooldown(resetCooldown)}</span>.
                </p>
              </div>
            )}
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)} disabled={resetLoading} className="w-full sm:w-auto">
              Cancel
            </Button>
            {resetStep === 'email' && (
              <Button type="button" onClick={handlePasswordReset} disabled={resetLoading || resetCooldown > 0} className="w-full whitespace-normal sm:w-auto">
                {resetLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</>
                ) : resetCooldown > 0 ? (
                  `Resend in ${formatCooldown(resetCooldown)}`
                ) : (
                  'Send reset code'
                )}
              </Button>
            )}
            {resetStep === 'verify' && (
              <Button type="button" onClick={handleVerifyResetCode} disabled={resetLoading} className="w-full whitespace-normal sm:w-auto">
                {resetLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</>
                ) : (
                  'Verify code'
                )}
              </Button>
            )}
            {resetStep === 'password' && (
              <Button type="button" onClick={handleCompletePasswordReset} disabled={resetLoading} className="w-full whitespace-normal sm:w-auto">
                {resetLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>
                ) : (
                  'Update password'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
