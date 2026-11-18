import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useAuthStore } from '../store/authStore';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { sendSignupVerification, verifySignupCode, completeSignup } from '../services/auth';
import colors from '../theme/colors';

const MAJORS = [
  'Computer Science',
  'Information Technology',
  'Engineering',
  'Business',
  'Education',
  'Health Sciences',
  'Law',
  'Medicine',
  'Nursing',
  'Psychology',
  'Science',
  'Social Work',
  'Other',
];

const RESEND_COOLDOWN_SECONDS = 60;

export function SignupScreen({ navigation }) {
  const setSession = useAuthStore((s) => s.setSession);
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [verifiedSession, setVerifiedSession] = useState(null);
  const [showMajorPicker, setShowMajorPicker] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    student_id: '',
    major: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  }

  async function handleSendCode() {
    const normalizedEmail = email.trim().toLowerCase();
    setServerError('');
    setSuccessMsg('');

    if (!normalizedEmail) {
      setErrors({ email: 'Email is required' });
      return;
    }

    if (!normalizedEmail.endsWith('@flinders.edu.au')) {
      setErrors({ email: 'Must use a @flinders.edu.au email address' });
      return;
    }

    setErrors({});
    setLoading(true);
    try {
      await sendSignupVerification(normalizedEmail, 'flinders');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setStep('verify');
      setSuccessMsg(`A 6-digit code has been sent to ${normalizedEmail}.`);
    } catch (err) {
      setServerError(err.message || 'Failed to send verification code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode() {
    setServerError('');
    setSuccessMsg('');
    const token = code.join('');

    if (token.length < 6) {
      setServerError('Please enter the full 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const result = await verifySignupCode(email.trim().toLowerCase(), token);
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
      setVerifiedSession(tempSession);
      setStep('details');
      setSuccessMsg('Email verified. Complete your account details.');
    } catch (err) {
      setServerError(err.message || 'Invalid verification code.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCompleteSignup() {
    const newErrors = {};

    if (!form.full_name.trim()) newErrors.full_name = 'Full name is required';
    if (!form.student_id.trim()) newErrors.student_id = 'Student ID is required';
    if (!form.major) newErrors.major = 'Please select your major';
    if (!form.password) newErrors.password = 'Password is required';
    else if (form.password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    if (!form.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setServerError('');
    setSuccessMsg('');
    setLoading(true);
    try {
      const result = await completeSignup({
        password: form.password,
        full_name: form.full_name.trim(),
        student_id: form.student_id.trim(),
        major: form.major,
        university: 'Flinders University',
        account_type: 'flinders',
      });

      await setSession(
        {
          access_token: verifiedSession.access_token,
          refresh_token: verifiedSession.refresh_token,
          expires_at: verifiedSession.expires_at,
        },
        result.user
      );
    } catch (err) {
      setServerError(err.message || 'Signup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            {step === 'email' && 'Start with your Flinders email'}
            {step === 'verify' && 'Enter the 6-digit verification code'}
            {step === 'details' && 'Finish setting up your account'}
          </Text>
        </View>

        <View style={styles.form}>
          {serverError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorBoxText}>{serverError}</Text>
            </View>
          ) : null}

          {successMsg ? (
            <View style={styles.successBox}>
              <Text style={styles.successBoxText}>{successMsg}</Text>
            </View>
          ) : null}

          {step === 'email' && (
            <>
              <Input
                label="University Email"
                placeholder="you@flinders.edu.au"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                error={errors.email}
              />
              <Button onPress={handleSendCode} loading={loading} style={styles.primaryBtn}>
                Send Verification Code
              </Button>
            </>
          )}

          {step === 'verify' && (
            <>
              <Text style={styles.verifyHint}>Code sent to {email.trim().toLowerCase()}</Text>
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
              <Button onPress={handleVerifyCode} loading={loading} style={styles.primaryBtn}>
                Verify Code
              </Button>
              <Button
                variant="outline"
                onPress={handleSendCode}
                disabled={loading || resendCooldown > 0}
                style={styles.secondaryBtn}
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend Code'}
              </Button>
            </>
          )}

          {step === 'details' && (
            <>
              <Input
                label="Full Name"
                placeholder="Your full name"
                value={form.full_name}
                onChangeText={(value) => setField('full_name', value)}
                autoCapitalize="words"
                error={errors.full_name}
              />
              <Input
                label="Student ID"
                placeholder="e.g. 1234567"
                value={form.student_id}
                onChangeText={(value) => setField('student_id', value)}
                keyboardType="numeric"
                error={errors.student_id}
              />

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Major / Degree Program</Text>
                <TouchableOpacity
                  style={[styles.pickerButton, errors.major && styles.pickerButtonError]}
                  onPress={() => setShowMajorPicker(!showMajorPicker)}
                >
                  <Text style={[styles.pickerText, !form.major && styles.pickerPlaceholder]}>
                    {form.major || 'Select your major'}
                  </Text>
                </TouchableOpacity>
                {errors.major ? <Text style={styles.errorText}>{errors.major}</Text> : null}
                {showMajorPicker && (
                  <View style={styles.pickerList}>
                    {MAJORS.map((major) => (
                      <TouchableOpacity
                        key={major}
                        style={[styles.pickerItem, form.major === major && styles.pickerItemSelected]}
                        onPress={() => {
                          setField('major', major);
                          setShowMajorPicker(false);
                        }}
                      >
                        <Text style={[styles.pickerItemText, form.major === major && styles.pickerItemTextSelected]}>
                          {major}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Input
                label="Password"
                placeholder="At least 6 characters"
                value={form.password}
                onChangeText={(value) => setField('password', value)}
                secureTextEntry
                autoComplete="new-password"
                error={errors.password}
              />

              <Input
                label="Confirm Password"
                placeholder="Repeat your password"
                value={form.confirmPassword}
                onChangeText={(value) => setField('confirmPassword', value)}
                secureTextEntry
                error={errors.confirmPassword}
              />

              <Button onPress={handleCompleteSignup} loading={loading} style={styles.primaryBtn}>
                Complete Signup
              </Button>
            </>
          )}

          <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLinkText}>
              Already have an account? <Text style={styles.loginLinkBold}>Sign In</Text>
            </Text>
          </TouchableOpacity>
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
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  pickerButton: {
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  pickerButtonError: {
    borderColor: colors.error,
  },
  pickerText: {
    fontSize: 16,
    color: colors.text,
  },
  pickerPlaceholder: {
    color: colors.textMuted,
  },
  pickerList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  pickerItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pickerItemSelected: {
    backgroundColor: colors.secondary,
  },
  pickerItemText: {
    fontSize: 15,
    color: colors.text,
  },
  pickerItemTextSelected: {
    color: colors.primary,
    fontWeight: '700',
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    color: colors.error,
  },
  loginLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  loginLinkText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  loginLinkBold: {
    color: colors.accent,
    fontWeight: '600',
  },
});

export default SignupScreen;
