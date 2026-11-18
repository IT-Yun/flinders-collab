import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, User, Mail, Hash, GraduationCap, Lock, ArrowLeft, School, ShieldCheck, ArrowRight } from 'lucide-react';
import { FLINDERS_PROGRAMS } from '@/lib/flinders-programs';
import { apiSendVerification, apiVerifyEmailCode } from '@/services/auth';

const ACCOUNT_TYPES = [
  {
    id: 'flinders',
    label: 'Flinders Student',
    desc: 'Sign up with your @flinders.edu.au email',
    icon: GraduationCap,
    color: 'from-blue-600 to-indigo-600',
    border: 'border-blue-200 hover:border-blue-400',
    bg: 'bg-blue-50',
  },
  {
    id: 'general',
    label: 'Other University',
    desc: 'Any university email works',
    icon: School,
    color: 'from-violet-600 to-purple-600',
    border: 'border-violet-200 hover:border-violet-400',
    bg: 'bg-violet-50',
  },
];

const ADELAIDE_UNIVERSITIES = [
  'University of Adelaide',
  'Adelaide University',
  'University of South Australia',
  'UniSA',
  'Torrens University Australia',
  'Carnegie Mellon University Australia',
  'CQUniversity Adelaide',
];

const RESEND_COOLDOWN = 30;

export default function SignupForm({ onComplete }) {
  // Shared state
  const [accountType, setAccountType] = useState(null);
  const [step, setStep] = useState('type'); // 'type' | 'email' | 'verify' | 'details'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Email step
  const [email, setEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  // Verify step
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const codeRefs = useRef([]);

  // Session from OTP verification
  const [verifiedSession, setVerifiedSession] = useState(null);

  // Details step
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [studentId, setStudentId] = useState('');
  const [university, setUniversity] = useState('');
  const [major, setMajor] = useState('');
  const [majorQuery, setMajorQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showUniversitySuggestions, setShowUniversitySuggestions] = useState(false);
  const [highlightUniversityIndex, setHighlightUniversityIndex] = useState(-1);
  const suggestionsRef = useRef(null);
  const majorInputRef = useRef(null);
  const universitySuggestionsRef = useRef(null);
  const universityInputRef = useRef(null);

  const filtered = majorQuery.length > 0
    ? FLINDERS_PROGRAMS.filter((p) =>
        p.toLowerCase().includes(majorQuery.toLowerCase())
      ).slice(0, 8)
    : [];

  const filteredUniversities = university.trim().length > 0
    ? ADELAIDE_UNIVERSITIES.filter((school) =>
        school.toLowerCase().includes(university.trim().toLowerCase())
      ).slice(0, 8)
    : ADELAIDE_UNIVERSITIES.slice(0, 6);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // Click outside handlers for suggestions
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
          majorInputRef.current && !majorInputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
      if (universitySuggestionsRef.current && !universitySuggestionsRef.current.contains(e.target) &&
          universityInputRef.current && !universityInputRef.current.contains(e.target)) {
        setShowUniversitySuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectProgram = (program) => {
    setMajor(program);
    setMajorQuery(program);
    setShowSuggestions(false);
    setHighlightIndex(-1);
  };

  const handleMajorKeyDown = (e) => {
    if (!showSuggestions || filtered.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev <= 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0) {
      e.preventDefault();
      selectProgram(filtered[highlightIndex]);
    }
  };

  const selectUniversity = (school) => {
    setUniversity(school);
    setShowUniversitySuggestions(false);
    setHighlightUniversityIndex(-1);
  };

  const handleUniversityKeyDown = (e) => {
    if (!showUniversitySuggestions || filteredUniversities.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightUniversityIndex((prev) => (prev + 1) % filteredUniversities.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightUniversityIndex((prev) => (prev <= 0 ? filteredUniversities.length - 1 : prev - 1));
    } else if (e.key === 'Enter' && highlightUniversityIndex >= 0) {
      e.preventDefault();
      selectUniversity(filteredUniversities[highlightUniversityIndex]);
    }
  };

  // ── Send verification code ──
  const handleSendCode = async () => {
    setError('');
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Email is required');
      return;
    }

    if (accountType === 'flinders' && !normalizedEmail.endsWith('@flinders.edu.au')) {
      setError('Please use your @flinders.edu.au email');
      return;
    }

    if (accountType === 'general' && normalizedEmail.endsWith('@flinders.edu.au')) {
      setError('Flinders email detected! Please go back and sign up as "Flinders Student" instead.');
      return;
    }

    setLoading(true);
    try {
      await apiSendVerification(normalizedEmail, accountType);
      setResendCooldown(RESEND_COOLDOWN);
      setStep('verify');
    } catch (err) {
      const msg = err.message || 'Failed to send verification code';
      if (msg === 'Failed to fetch' || msg === 'Load failed') {
        setError('Server is starting up. Please try again in a few seconds.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Resend code ──
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setError('');
    setLoading(true);
    try {
      await apiSendVerification(email.trim().toLowerCase(), accountType);
      setResendCooldown(RESEND_COOLDOWN);
      setCode(['', '', '', '', '', '']);
    } catch (err) {
      setError(err.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP input handlers ──
  const handleCodeChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);

    if (value && index < 5) {
      codeRefs.current[index + 1]?.focus();
    }
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus();
    }
  };

  const handleCodePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newCode = [...code];
    for (let i = 0; i < 6; i++) {
      newCode[i] = pasted[i] || '';
    }
    setCode(newCode);
    const focusIndex = Math.min(pasted.length, 5);
    codeRefs.current[focusIndex]?.focus();
  };

  // ── Verify code ──
  const handleVerifyCode = async () => {
    setError('');
    const token = code.join('');
    if (token.length < 6) {
      setError('Please enter the full 6-digit code');
      return;
    }

    setLoading(true);
    try {
      const result = await apiVerifyEmailCode(email.trim().toLowerCase(), token);
      setVerifiedSession(result.session);
      setStep('details');
    } catch (err) {
      setError(err.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  // ── Complete signup ──
  const handleCompleteSignup = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (accountType === 'flinders' && !major) {
      setError('Please select your degree program');
      return;
    }

    if (accountType === 'general' && !university.trim()) {
      setError('Please enter your university name');
      return;
    }

    if (accountType === 'general' && university.trim().toLowerCase().includes('flinders')) {
      setError('Flinders University students must sign up with the "Flinders Student" option.');
      return;
    }

    if (accountType === 'general' && !major.trim()) {
      setError('Please enter your major');
      return;
    }

    setLoading(true);
    try {
      await onComplete({
        session: verifiedSession,
        password,
        full_name: name.trim(),
        student_id: accountType === 'flinders' ? studentId : undefined,
        major: major.trim(),
        university: accountType === 'flinders' ? 'Flinders University' : university.trim(),
        account_type: accountType,
      });
    } catch (err) {
      const msg = err.message || 'Signup failed';
      if (msg === 'Failed to fetch' || msg === 'Load failed') {
        setError('Server is starting up. Please try again in a few seconds.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const errorBlock = error && (
    <div className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
      <svg className="h-4 w-4 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="10" />
        <text x="10" y="14" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">!</text>
      </svg>
      <p className="min-w-0 break-words text-sm text-destructive">{error}</p>
    </div>
  );

  // Progress indicator
  const steps = ['Email', 'Verify', 'Details'];
  const stepIndex = step === 'email' ? 0 : step === 'verify' ? 1 : step === 'details' ? 2 : -1;

  const progressBar = stepIndex >= 0 && (
    <div className="flex items-center gap-1.5 mb-4">
      {steps.map((label, i) => (
        <div key={label} className="flex items-center gap-1.5 flex-1">
          <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
            i <= stepIndex ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'
          }`}>
            {i < stepIndex ? (
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              i + 1
            )}
          </div>
          {i < steps.length - 1 && (
            <div className={`h-0.5 flex-1 rounded transition-colors ${i < stepIndex ? 'bg-blue-600' : 'bg-slate-100'}`} />
          )}
        </div>
      ))}
    </div>
  );

  // ── Step: Choose account type ──
  if (step === 'type') {
    return (
      <div className="space-y-4 pb-1">
        <div className="space-y-1 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Create your account</h2>
          <p className="text-sm text-muted-foreground/70">Choose how you'd like to join</p>
        </div>

        <div className="space-y-2.5">
          {ACCOUNT_TYPES.map((type) => {
            const Icon = type.icon;
            return (
              <button
                key={type.id}
                type="button"
                onClick={() => { setAccountType(type.id); setStep('email'); setError(''); }}
                disabled={loading}
                className={`flex w-full items-start gap-3 rounded-xl border-2 ${type.border} p-4 text-left transition-all hover:shadow-md active:scale-[0.98] disabled:opacity-50 sm:items-center sm:gap-3.5`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${type.color} text-white shadow-sm`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{type.label}</p>
                  <p className="text-[12px] leading-snug text-muted-foreground">{type.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {errorBlock}

        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">Sign in</Link>
        </p>
      </div>
    );
  }

  // ── Step: Enter email ──
  if (step === 'email') {
    return (
      <div className="space-y-4 pb-1">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setStep('type'); setError(''); }} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <ArrowLeft className="h-4 w-4 text-slate-500" />
          </button>
          <h2 className="min-w-0 text-lg font-bold tracking-tight">
            {accountType === 'flinders' ? 'Flinders Student' : 'Other University'}
          </h2>
        </div>

        {progressBar}

        <div className="space-y-1 text-center">
          <p className="text-sm text-muted-foreground/70">
            We'll send a verification code to your email first
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground/70">Email</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input
              type="email"
              placeholder={accountType === 'flinders' ? 'you@flinders.edu.au' : 'you@university.edu'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSendCode(); } }}
              autoFocus
              className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
            />
          </div>
        </div>

        {errorBlock}

        <Button
          type="button"
          onClick={handleSendCode}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-semibold text-[15px] shadow-lg shadow-blue-600/20 text-white"
          disabled={loading}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Sending...' : (
            <>Send Verification Code <ArrowRight className="ml-2 h-4 w-4" /></>
          )}
        </Button>

        <p className="text-center text-sm leading-relaxed text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">Sign in</Link>
        </p>
      </div>
    );
  }

  // ── Step: Enter verification code ──
  if (step === 'verify') {
    const codeComplete = code.every((d) => d !== '');

    return (
      <div className="space-y-4 pb-1">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { setStep('email'); setError(''); setCode(['', '', '', '', '', '']); }} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <ArrowLeft className="h-4 w-4 text-slate-500" />
          </button>
          <h2 className="min-w-0 text-lg font-bold tracking-tight">Verify your email</h2>
        </div>

        {progressBar}

        <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-4 py-4 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <Mail className="h-5 w-5 text-blue-600" />
          </div>
          <p className="text-[13px] text-blue-800">
            We sent a code to <span className="font-bold">{email}</span>
          </p>
          <p className="mt-1 text-[11px] text-blue-600/70">Check your inbox and spam folder</p>
        </div>

        <div className="flex justify-center gap-2">
          {code.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { codeRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleCodeChange(i, e.target.value)}
              onKeyDown={(e) => handleCodeKeyDown(i, e)}
              onPaste={i === 0 ? handleCodePaste : undefined}
              autoFocus={i === 0}
              className="h-12 w-11 rounded-xl border-2 border-border/40 bg-muted/30 text-center text-lg font-bold focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            />
          ))}
        </div>

        {errorBlock}

        <Button
          type="button"
          onClick={handleVerifyCode}
          className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-semibold text-[15px] shadow-lg shadow-blue-600/20 text-white"
          disabled={loading || !codeComplete}
        >
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Verifying...' : (
            <>
              <ShieldCheck className="mr-2 h-4 w-4" />
              Verify Email
            </>
          )}
        </Button>

        <p className="text-center text-[13px] text-muted-foreground">
          Didn't receive the code?{' '}
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || loading}
            className="font-semibold text-blue-600 hover:text-blue-700 disabled:text-muted-foreground disabled:cursor-not-allowed"
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </button>
        </p>
      </div>
    );
  }

  // ── Step: Complete details ──
  const isFlinders = accountType === 'flinders';

  return (
    <form onSubmit={handleCompleteSignup} className="space-y-3.5 pb-1 sm:space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 break-words text-lg font-bold tracking-tight">
          Complete your profile
        </h2>
      </div>

      {progressBar}

      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
        <p className="text-[12px] font-medium text-emerald-700">
          <span className="font-bold">{email}</span> verified
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-[13px] font-semibold text-foreground/70">Full Name</label>
        <div className="relative">
          <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <Input placeholder="Jane Smith" value={name} onChange={(e) => setName(e.target.value)} autoFocus required className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white" />
        </div>
      </div>

      {isFlinders && (
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground/70">FAN ID</label>
          <div className="relative">
            <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input placeholder="e.g. lee2086" value={studentId} onChange={(e) => setStudentId(e.target.value)} required className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white" />
          </div>
        </div>
      )}

      {isFlinders ? (
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground/70">Degree Program</label>
          <div className="relative">
            <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40 z-10" />
            <Input
              ref={majorInputRef}
              placeholder="Search your degree"
              value={majorQuery}
              onChange={(e) => { setMajorQuery(e.target.value); setMajor(''); setShowSuggestions(true); setHighlightIndex(-1); }}
              onFocus={() => { if (majorQuery.length > 0) setShowSuggestions(true); }}
              onKeyDown={handleMajorKeyDown}
              autoComplete="off"
              required
              className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
            />
            {showSuggestions && filtered.length > 0 && (
              <div ref={suggestionsRef} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-xl border bg-white shadow-lg">
                {filtered.map((program, i) => (
                  <button
                    key={program}
                    type="button"
                    className={`w-full break-words px-4 py-2 text-left text-sm transition-colors ${i === highlightIndex ? 'bg-indigo-50 font-medium text-indigo-700' : 'hover:bg-slate-50'}`}
                    onMouseEnter={() => setHighlightIndex(i)}
                    onClick={() => selectProgram(program)}
                  >
                    {program}
                  </button>
                ))}
              </div>
            )}
            {major && (
              <p className="mt-1 break-words text-[11px] font-medium text-emerald-600">Selected: {major}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground/70">University</label>
            <div className="relative">
              <School className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              <Input
                ref={universityInputRef}
                placeholder="e.g. University of Adelaide"
                value={university}
                onChange={(e) => {
                  const nextUniversity = e.target.value;
                  setUniversity(nextUniversity);
                  setShowUniversitySuggestions(true);
                  setHighlightUniversityIndex(-1);
                  if (nextUniversity.trim().toLowerCase().includes('flinders')) {
                    setError('Flinders University students must sign up with the "Flinders Student" option.');
                  } else if (error.includes('Flinders University students must sign up')) {
                    setError('');
                  }
                }}
                onFocus={() => setShowUniversitySuggestions(true)}
                onKeyDown={handleUniversityKeyDown}
                required
                className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white"
              />
              {showUniversitySuggestions && filteredUniversities.length > 0 && (
                <div ref={universitySuggestionsRef} className="absolute left-0 right-0 top-full z-50 mt-1 max-h-44 overflow-y-auto rounded-xl border bg-white shadow-lg">
                  {filteredUniversities.map((school, i) => (
                    <button
                      key={school}
                      type="button"
                      className={`w-full break-words px-4 py-2 text-left text-sm transition-colors ${i === highlightUniversityIndex ? 'bg-violet-50 font-medium text-violet-700' : 'hover:bg-slate-50'}`}
                      onMouseEnter={() => setHighlightUniversityIndex(i)}
                      onClick={() => selectUniversity(school)}
                    >
                      {school}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[13px] font-semibold text-foreground/70">Major</label>
            <div className="relative">
              <GraduationCap className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
              <Input placeholder="e.g. Computer Science" value={major} onChange={(e) => setMajor(e.target.value)} required className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-2">
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground/70">Password</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input type="password" placeholder="Min. 6 chars" value={password} onChange={(e) => setPassword(e.target.value)} required className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-[13px] font-semibold text-foreground/70">Confirm</label>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input type="password" placeholder="Re-enter" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required className="h-11 rounded-xl pl-10 bg-muted/30 border-border/40 focus:bg-white" />
          </div>
        </div>
      </div>

      {errorBlock}

      <Button
        type="submit"
        className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 font-semibold text-[15px] shadow-lg shadow-blue-600/20 text-white"
        disabled={loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Creating account...' : 'Create Account'}
      </Button>
    </form>
  );
}
