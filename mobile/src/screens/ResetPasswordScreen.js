import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import {
  requestPasswordReset,
  verifyPasswordResetCode,
  completePasswordReset,
} from '../services/auth';
import colors from '../theme/colors';

const RESEND_COOLDOWN_SECONDS = 60;

export function ResetPasswordScreen({ navigation }) {
  const setSession = useAuthStore((s) => s.setSession);
  const logout = useAuthStore((s) => s.logout);
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [resetSession, setResetSession] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function sendCode() {
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
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('verify');
      setSuccess(`If an account exists for ${normalizedEmail}, a 6-digit reset code has been sent.`);
    } catch (err) {
      setError(err.message || 'Failed to send reset code.');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    setError('');
    setSuccess('');
    const token = code.join('');

    if (token.length < 6) {
      setError('Please enter the full 6-digit reset code.');
      return;
    }

    setLoading(true);
    try {
      const result = await verifyPasswordResetCode(email.trim().toLowerCase(), token);
      const tempSession = {
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
        expires_at: result.session.expires_at,
        user: {
          id: result.user.id,
          email: result.user.email,
        },
      };
      await setSession(tempSession, tempSession.user);
      setResetSession(tempSession);
      setStep('password');
      setSuccess('Code verified. Set your new password.');
    } catch (err) {
      setError(err.message || 'Invalid reset code.');
    } finally {
      setLoading(false);
    }
  }

  async function updatePassword() {
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
      await completePasswordReset(password);
      await logout();
      setSuccess('Your password has been updated. Return to login and sign in.');
      navigation.navigate('Login');
    } catch (err) {
      setError(err.message || 'Failed to update password.');
      if (resetSession) {
        await setSession(resetSession, resetSession.user);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.subtitle}>Use a 6-digit code to set a new password</Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{error}</Text>
            </View>
          ) : null}

          {success ? (
            <View style={styles.successBox}>
              <Text style={styles.successBoxText}>{success}</Text>
            </View>
          ) : null}

          {step === 'email' && (
            <>
              <Input
                label="Email"
                placeholder="you@university.edu"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
              />
              <Button onPress={sendCode} loading={loading} style={styles.primaryBtn}>
                Send Reset Code
              </Button>
            </>
          )}

          {step === 'verify' && (
            <>
              <Text style={styles.verifyHint}>Enter the code sent to {email.trim().toLowerCase()}</Text>
              <View style={styles.codeRow}>
                {code.map((digit, index) => (
                  <TextInput
                    key={index}
                    style={styles.codeInput}
                    value={digit}
                    onChangeText={(value) => {
                      if (!/^\d*$/.test(value)) return;
                      const next = [...code];
                      next[index] = value.slice(-1);
                      setCode(next);
                    }}
                    keyboardType="number-pad"
                    maxLength={1}
                  />
                ))}
              </View>
              <Button onPress={verifyCode} loading={loading} style={styles.primaryBtn}>
                Verify Code
              </Button>
              <Button
                variant="outline"
                onPress={sendCode}
                disabled={loading || resendCooldown > 0}
                style={styles.secondaryBtn}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </Button>
            </>
          )}

          {step === 'password' && (
            <>
              <Input
                label="New Password"
                placeholder="At least 6 characters"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="new-password"
              />
              <Input
                label="Confirm Password"
                placeholder="Repeat your password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
              <Button onPress={updatePassword} loading={loading} style={styles.primaryBtn}>
                Update Password
              </Button>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.primary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  form: {
    width: '100%',
  },
  errorBox: {
    backgroundColor: colors.errorLight,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorBoxText: {
    color: colors.error,
    fontSize: 14,
  },
  successBox: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#10B981',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  successBoxText: {
    color: '#047857',
    fontSize: 14,
  },
  primaryBtn: {
    marginTop: 8,
  },
  secondaryBtn: {
    marginTop: 12,
  },
  verifyHint: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
    textAlign: 'center',
  },
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 16,
  },
  codeInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    backgroundColor: colors.white,
    color: colors.text,
  },
});

export default ResetPasswordScreen;
