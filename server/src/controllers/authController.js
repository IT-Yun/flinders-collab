const { supabaseAdmin, supabasePublic } = require('../services/supabase');
const { ensureUserProfile } = require('../services/userProfile');
const { isUniversityEmail } = require('../utils/validators');
const config = require('../config');

function getConfiguredClientOrigins() {
  return String(process.env.CLIENT_URL || config.clientUrl || '')
    .split(',')
    .map((value) => value.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

function getRequestClientOrigin(req) {
  const directOrigin = String(req.get('origin') || '').trim().replace(/\/$/, '');
  if (directOrigin) return directOrigin;

  const referer = String(req.get('referer') || '').trim();
  if (!referer) return '';

  try {
    return new URL(referer).origin.replace(/\/$/, '');
  } catch {
    return '';
  }
}

function resolvePasswordResetBaseUrl(req) {
  const requestOrigin = getRequestClientOrigin(req);

  // Trust the request origin first (Supabase allowlist provides security)
  if (requestOrigin) return requestOrigin;

  const configuredOrigins = getConfiguredClientOrigins();
  const preferredConfiguredOrigin = configuredOrigins.find((origin) => {
    if (!/^https?:\/\//.test(origin)) return false;
    return !origin.includes('localhost') && !origin.includes('127.0.0.1');
  });
  if (preferredConfiguredOrigin) return preferredConfiguredOrigin;

  const fallbackConfiguredOrigin = configuredOrigins.find((origin) => /^https?:\/\//.test(origin));
  if (fallbackConfiguredOrigin) return fallbackConfiguredOrigin;

  return 'http://localhost:5173';
}

function resolveEmailVerificationRedirectUrl(req) {
  const baseUrl = resolvePasswordResetBaseUrl(req);

  try {
    return new URL('/login?verified=1', baseUrl).toString();
  } catch {
    return `${baseUrl.replace(/\/$/, '')}/login?verified=1`;
  }
}

// In-memory rate limits (email → timestamp)
const _signupVerificationCooldowns = new Map();
const _resetCooldowns = new Map();
const VERIFY_EMAIL_COOLDOWN_MS = 60 * 1000; // 60 seconds
const RESET_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

// OTP brute-force protection: email → { attempts, lockedUntil }
const _otpAttempts = new Map();
const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

// Prune stale OTP lockout entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of _otpAttempts) {
    if (val.lockedUntil && now > val.lockedUntil) _otpAttempts.delete(key);
    else if (!val.lockedUntil && now - val.lastAttempt > OTP_LOCKOUT_MS) _otpAttempts.delete(key);
  }
}, 5 * 60 * 1000);

function checkOtpRateLimit(email) {
  const entry = _otpAttempts.get(email);
  if (!entry) return null;
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    const minutesLeft = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`;
  }
  if (entry.lockedUntil && Date.now() >= entry.lockedUntil) {
    _otpAttempts.delete(email);
  }
  return null;
}

function recordOtpFailure(email) {
  const entry = _otpAttempts.get(email) || { attempts: 0, lastAttempt: 0, lockedUntil: null };
  entry.attempts += 1;
  entry.lastAttempt = Date.now();
  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    entry.lockedUntil = Date.now() + OTP_LOCKOUT_MS;
  }
  _otpAttempts.set(email, entry);
}

function clearOtpAttempts(email) {
  _otpAttempts.delete(email);
}

async function ignoreQueryError(query) {
  try {
    await query;
  } catch {
    // Best-effort cleanup path.
  }
}

/**
 * POST /auth/signup
 * Register a new user with Supabase Auth and create a profile.
 */
async function signup(req, res, next) {
  try {
    const { password, full_name, student_id, major, university, account_type } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase();
    const normalizedAccountType = account_type || 'flinders';
    const normalizedMajor = String(major || '').trim() || null;
    const normalizedUniversity = normalizedAccountType === 'general'
      ? (String(university || '').trim() || null)
      : 'Flinders University';

    // Flinders students must use university email
    if (normalizedAccountType !== 'general' && !isUniversityEmail(email)) {
      return res.status(400).json({
        error: 'Must use a Flinders University email address',
      });
    }

    if (normalizedAccountType === 'general' && !normalizedUniversity) {
      return res.status(400).json({ error: 'University name is required for other-university accounts' });
    }

    if (!normalizedMajor) {
      return res.status(400).json({ error: 'Major or degree program is required' });
    }

    const emailRedirectTo = resolveEmailVerificationRedirectUrl(req);
    const { data: authData, error: authError } =
      await supabasePublic.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
          data: {
            full_name,
            student_id: normalizedAccountType === 'flinders' ? student_id : null,
            major: normalizedMajor,
            university: normalizedUniversity,
            account_type: normalizedAccountType,
          },
        },
      });

    if (authError) {
      return res.status(400).json({ error: authError.message });
    }

    if (!authData?.user?.id) {
      return res.status(500).json({ error: 'Failed to create your account. Please try again.' });
    }

    res.status(201).json({
      message: 'Check your email to verify your account before signing in.',
      requires_email_verification: true,
      email,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/login
 * Sign in with email and password via Supabase Auth.
 */
async function login(req, res, next) {
  try {
    const password = req.body.password;
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Basic email format check
    if (!email.includes('@') || !email.includes('.')) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    const { data, error } =
      await supabasePublic.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message?.toLowerCase().includes('email not confirmed')) {
        return res.status(403).json({ error: 'Please verify your email address before signing in.' });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!data?.session || !data?.user) {
      console.error('Login: signInWithPassword returned no session/user', { data });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    await ensureUserProfile(data.user);

    // Fetch profile (admin status + avatar) from users table
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('is_admin, avatar_url, full_name, major, university')
      .eq('id', data.user.id)
      .single();

    res.json({
      message: 'Login successful',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name || data.user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url || null,
        is_admin: profile?.is_admin || false,
        account_type: data.user.user_metadata?.account_type || 'flinders',
        major: profile?.major || data.user.user_metadata?.major || null,
        university: profile?.university || data.user.user_metadata?.university || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

async function refreshSession(req, res, next) {
  try {
    const refreshToken = String(req.body.refresh_token || '').trim();

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const { data, error } = await supabasePublic.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data?.session || !data?.user) {
      return res.status(401).json({ error: 'Unable to refresh session' });
    }

    await ensureUserProfile(data.user);

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('is_admin, avatar_url, full_name, major, university')
      .eq('id', data.user.id)
      .single();

    res.json({
      message: 'Session refreshed',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: profile?.full_name || data.user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url || null,
        is_admin: profile?.is_admin || false,
        is_tester: Boolean(data.user.user_metadata?.is_tester),
        account_type: data.user.user_metadata?.account_type || 'flinders',
        major: profile?.major || data.user.user_metadata?.major || null,
        university: profile?.university || data.user.user_metadata?.university || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/password/reset/send
 * Send a password reset code via Supabase Auth recovery email.
 */
async function requestPasswordReset(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Server-side cooldown: 1 request per email per 2 minutes
    const lastReset = _resetCooldowns.get(email);
    if (lastReset && Date.now() - lastReset < RESET_COOLDOWN_MS) {
      const remainSec = Math.ceil((RESET_COOLDOWN_MS - (Date.now() - lastReset)) / 1000);
      return res.status(429).json({
        error: `Please wait ${remainSec} seconds before requesting another reset.`,
      });
    }

    // Set cooldown immediately to prevent timing attacks on email existence.
    _resetCooldowns.set(email, Date.now());

    const { error } = await supabasePublic.auth.resetPasswordForEmail(email);

    if (error) {
      const message = String(error.message || '').toLowerCase();
      if (message.includes('rate') || message.includes('limit') || message.includes('too many')) {
        return res.status(429).json({
          error: 'Please wait a moment before requesting another reset code.',
        });
      }
    }

    res.json({
      message: 'If an account exists for that email, a 6-digit reset code has been sent.',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/password/reset/confirm
 * Verify the password reset code and return a temporary session.
 */
async function verifyPasswordResetCode(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const token = String(req.body.token || '').trim();

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and reset code are required' });
    }

    const lockMsg = checkOtpRateLimit(email);
    if (lockMsg) {
      return res.status(429).json({ error: lockMsg });
    }

    const { data, error } = await supabasePublic.auth.verifyOtp({
      email,
      token,
      type: 'recovery',
    });

    if (error || !data?.session || !data?.user) {
      recordOtpFailure(email);
      return res.status(400).json({ error: 'Invalid or expired reset code. Please request a new one.' });
    }

    clearOtpAttempts(email);

    res.json({
      message: 'Reset code verified',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/password/reset/complete
 * Update the password after a verified reset-code session.
 */
async function completePasswordReset(req, res, next) {
  try {
    const userId = req.user.id;
    const password = String(req.body.password || '');

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
    if (error) {
      return res.status(500).json({ error: 'Failed to update password. Please try again.' });
    }

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/logout
 * Sign out the current user (invalidates the session on Supabase).
 */
async function logout(req, res, next) {
  try {
    // Supabase admin can revoke sessions
    await supabaseAdmin.auth.admin.signOut(req.accessToken);

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /auth/me
 * Get the current authenticated user's profile.
 */
async function getMe(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error || !data) {
      // Fallback to auth metadata if profile doesn't exist yet
      return res.json({
        id: req.user.id,
        email: req.user.email,
        full_name: req.user.user_metadata?.full_name || null,
        student_id: req.user.user_metadata?.student_id || null,
        major: req.user.user_metadata?.major || null,
        university: req.user.user_metadata?.university || null,
        year_level: req.user.user_metadata?.year_level || null,
        semester: req.user.user_metadata?.semester || null,
        avatar_url: null,
      });
    }

    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getPreferences(req, res, next) {
  try {
    const userId = req.user.id;

    const { data, error } = await supabaseAdmin
      .from('users')
      .select('room_order, flinders_interests, flinders_favorites, notification_preferences')
      .eq('id', userId)
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to load preferences' });
    }

    res.json({
      room_order: Array.isArray(data?.room_order) ? data.room_order : [],
      flinders_interests: Array.isArray(data?.flinders_interests) ? data.flinders_interests : [],
      flinders_favorites: Array.isArray(data?.flinders_favorites) ? data.flinders_favorites : [],
      notification_preferences: normalizeNotificationPreferences(data?.notification_preferences),
    });
  } catch (err) {
    next(err);
  }
}

async function updatePreferences(req, res, next) {
  try {
    const userId = req.user.id;
    const updates = {};

    if (req.body.room_order !== undefined) {
      updates.room_order = Array.isArray(req.body.room_order) ? req.body.room_order.filter((value) => typeof value === 'string') : [];
    }

    if (req.body.flinders_interests !== undefined) {
      updates.flinders_interests = Array.isArray(req.body.flinders_interests)
        ? req.body.flinders_interests.filter((value) => typeof value === 'string')
        : [];
    }

    if (req.body.flinders_favorites !== undefined) {
      updates.flinders_favorites = Array.isArray(req.body.flinders_favorites)
        ? req.body.flinders_favorites.filter((value) => typeof value === 'string')
        : [];
    }

    if (req.body.notification_preferences !== undefined) {
      updates.notification_preferences = normalizeNotificationPreferences(req.body.notification_preferences);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No preference updates provided' });
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select('room_order, flinders_interests, flinders_favorites, notification_preferences')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update preferences' });
    }

    res.json({
      room_order: Array.isArray(data?.room_order) ? data.room_order : [],
      flinders_interests: Array.isArray(data?.flinders_interests) ? data.flinders_interests : [],
      flinders_favorites: Array.isArray(data?.flinders_favorites) ? data.flinders_favorites : [],
      notification_preferences: normalizeNotificationPreferences(data?.notification_preferences),
    });
  } catch (err) {
    next(err);
  }
}

function normalizeNotificationPreferences(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    chat: source.chat !== false,
    tasks: source.tasks !== false,
    schedule: source.schedule !== false,
    files: source.files !== false,
    announcements: source.announcements !== false,
    board: source.board !== false,
    room_updates: source.room_updates !== false,
    friend_requests: source.friend_requests !== false,
  };
}

/**
 * PATCH /auth/me
 * Update the current user's profile (name and/or avatar).
 */
async function updateProfile(req, res, next) {
  try {
    const userId = req.user.id;
    const { full_name, student_id, major, year_level, semester } = req.body;
    const updates = {};

    // Update name if provided
    if (full_name && full_name.trim()) {
      updates.full_name = full_name.trim();
    }

    if (major !== undefined) {
      updates.major = String(major || '').trim() || null;
    }

    if (student_id !== undefined) {
      const normalizedStudentId = String(student_id || '').trim();
      if (normalizedStudentId && !/^[a-zA-Z0-9-]+$/.test(normalizedStudentId)) {
        return res.status(400).json({ error: 'Student ID can only use letters, numbers, or hyphens' });
      }
      updates.student_id = normalizedStudentId || null;
    }

    if (year_level !== undefined) {
      const parsedYear = Number(year_level);
      if (!Number.isInteger(parsedYear) || parsedYear < 1 || parsedYear > 7) {
        return res.status(400).json({ error: 'Year level must be between 1 and 7' });
      }
      updates.year_level = parsedYear;
    }

    if (semester !== undefined) {
      const parsedSemester = Number(semester);
      if (!Number.isInteger(parsedSemester) || parsedSemester < 1 || parsedSemester > 3) {
        return res.status(400).json({ error: 'Semester must be between 1 and 3' });
      }
      updates.semester = parsedSemester;
    }

    // Handle avatar upload
    if (req.file) {
      const fileExt = req.file.originalname.split('.').pop();
      const filePath = `${userId}/avatar.${fileExt}`;

      // Ensure avatars bucket exists
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.find((b) => b.name === 'avatars')) {
        await supabaseAdmin.storage.createBucket('avatars', {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
        });
      }

      // Upload to avatars bucket
      const { error: uploadError } = await supabaseAdmin.storage
        .from('avatars')
        .upload(filePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: true,
        });

      if (uploadError) {
        console.error('Avatar upload error:', uploadError.message);
        return res.status(500).json({ error: 'Failed to upload avatar' });
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('avatars')
        .getPublicUrl(filePath);

      updates.avatar_url = urlData.publicUrl + '?v=' + Date.now();
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    await supabaseAdmin.auth.admin.updateUserById(userId, {
      user_metadata: {
        ...req.user.user_metadata,
        ...(updates.full_name ? { full_name: updates.full_name } : {}),
        ...(updates.student_id !== undefined ? { student_id: updates.student_id } : {}),
        ...(updates.major !== undefined ? { major: updates.major } : {}),
        ...(updates.year_level !== undefined ? { year_level: updates.year_level } : {}),
        ...(updates.semester !== undefined ? { semester: updates.semester } : {}),
        ...(updates.avatar_url !== undefined ? { avatar_url: updates.avatar_url } : {}),
      },
    });

    // Update users table
    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error.message);
      return res.status(500).json({ error: 'Failed to update profile' });
    }

    const io = req.app?.get?.('io');
    io?.to(`user:${userId}`).emit('profile:updated', {
      user_id: userId,
      avatar_url: data.avatar_url || null,
      full_name: data.full_name || null,
      major: data.major || null,
      student_id: data.student_id || null,
      year_level: data.year_level ?? null,
      semester: data.semester ?? null,
    });

    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/verify-email/send
 * Send a verification OTP to the given email before completing signup.
 */
async function sendEmailVerification(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const accountType = req.body.account_type || 'flinders';

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    if (accountType !== 'general' && !isUniversityEmail(email)) {
      return res.status(400).json({ error: 'Must use a Flinders University email address' });
    }

    // Check if a fully-registered user with this email already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('university_email', email)
      .maybeSingle();
    if (existingProfile) {
      return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
    }

    const lastSentAt = _signupVerificationCooldowns.get(email);
    if (lastSentAt && Date.now() - lastSentAt < VERIFY_EMAIL_COOLDOWN_MS) {
      const remainSec = Math.ceil((VERIFY_EMAIL_COOLDOWN_MS - (Date.now() - lastSentAt)) / 1000);
      return res.status(429).json({
        error: `A verification code was already sent. Please wait ${remainSec} seconds before requesting another code.`,
      });
    }

    const { error } = await supabasePublic.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    if (error) {
      const msg = error.message || '';
      const lower = msg.toLowerCase();
      if (lower.includes('rate') || lower.includes('limit') || lower.includes('exceeded') || lower.includes('email rate') || lower.includes('too many')) {
        return res.status(429).json({ error: 'Please wait about 30 seconds before requesting another code. Supabase limits how often emails can be sent.' });
      }
      return res.status(400).json({ error: msg });
    }

    _signupVerificationCooldowns.set(email, Date.now());

    res.json({ message: 'Verification code sent', email });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/verify-email/confirm
 * Verify the OTP code and return a session.
 */
async function verifyEmailCode(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const token = String(req.body.token || '').trim();

    if (!email || !token) {
      return res.status(400).json({ error: 'Email and verification code are required' });
    }

    const lockMsg = checkOtpRateLimit(email);
    if (lockMsg) {
      return res.status(429).json({ error: lockMsg });
    }

    let data = null;
    let error = null;

    for (const otpType of ['signup', 'email']) {
      const result = await supabasePublic.auth.verifyOtp({
        email,
        token,
        type: otpType,
      });

      if (!result.error && result.data?.session) {
        data = result.data;
        error = null;
        break;
      }

      error = result.error;
    }

    if (error || !data?.session) {
      recordOtpFailure(email);
      return res.status(400).json({ error: 'Invalid or expired verification code. Please try again.' });
    }

    clearOtpAttempts(email);

    res.json({
      message: 'Email verified',
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
      },
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/complete-signup
 * Complete signup after email verification — set password and profile.
 * Requires authentication (session from OTP verification).
 */
async function completeSignup(req, res, next) {
  try {
    const userId = req.user.id;
    const { password, full_name, student_id, major, university, account_type } = req.body;

    const normalizedAccountType = account_type || 'flinders';
    const normalizedMajor = String(major || '').trim() || null;
    const normalizedUniversity = normalizedAccountType === 'general'
      ? (String(university || '').trim() || null)
      : 'Flinders University';

    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (!String(full_name || '').trim()) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    if (!normalizedMajor) {
      return res.status(400).json({ error: 'Major or degree program is required' });
    }

    if (normalizedAccountType === 'general' && !normalizedUniversity) {
      return res.status(400).json({ error: 'University name is required' });
    }

    // Set password and metadata on the OTP-created user
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password,
      user_metadata: {
        full_name: String(full_name).trim(),
        student_id: normalizedAccountType === 'flinders' ? student_id : null,
        major: normalizedMajor,
        university: normalizedUniversity,
        account_type: normalizedAccountType,
      },
    });

    if (updateError) {
      return res.status(500).json({ error: 'Failed to complete signup. Please try again.' });
    }

    // Create user profile
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (authUser?.user) {
      await ensureUserProfile(authUser.user);
    }

    // Fetch profile for response
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('is_admin, avatar_url, full_name, major, university')
      .eq('id', userId)
      .single();

    res.json({
      message: 'Signup complete',
      user: {
        id: userId,
        email: req.user.email,
        full_name: profile?.full_name || String(full_name).trim(),
        avatar_url: profile?.avatar_url || null,
        is_admin: profile?.is_admin || false,
        account_type: normalizedAccountType,
        major: profile?.major || normalizedMajor,
        university: profile?.university || normalizedUniversity,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/guest
 * Create a temporary tester account, sign in, and return session.
 */
async function guestLogin(req, res, next) {
  try {
    if (!config.security.allowTesterMode) {
      return res.status(403).json({ error: 'Tester mode is disabled' });
    }

    const uuid = require('crypto').randomUUID();
    const email = `tester-${uuid}@flinders.edu.au`;
    const password = `guest-${uuid}-${Date.now()}`;

    // Create user in Supabase Auth
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: 'Tester', is_tester: true },
      });

    if (authError) {
      return res.status(500).json({ error: 'Failed to create tester account' });
    }

    try {
      await ensureUserProfile({
        id: authData.user.id,
        email,
        user_metadata: authData.user.user_metadata,
      });
    } catch (profileError) {
      await ignoreQueryError(supabaseAdmin.auth.admin.deleteUser(authData.user.id));
      console.error('Guest profile creation failed:', profileError.message);
      return res.status(500).json({ error: 'Failed to prepare tester account. Please try again.' });
    }

    // Sign in to get session
    const { data: loginData, error: loginError } =
      await supabasePublic.auth.signInWithPassword({ email, password });

    if (loginError || !loginData?.session) {
      // Clean up the created user
      await ignoreQueryError(supabaseAdmin.auth.admin.deleteUser(authData.user.id));
      console.error('Guest sign-in failed:', loginError?.message || 'No session returned');
      return res.status(500).json({ error: 'Failed to create tester session. Please try again.' });
    }

    res.json({
      session: {
        access_token: loginData.session.access_token,
        refresh_token: loginData.session.refresh_token,
        expires_at: loginData.session.expires_at,
      },
      user: {
        id: authData.user.id,
        email,
        full_name: 'Tester',
        is_tester: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /auth/guest/cleanup
 * Delete the current tester account and all associated data.
 */
async function guestCleanup(req, res, next) {
  try {
    if (!config.security.allowTesterMode) {
      return res.status(403).json({ error: 'Tester mode is disabled' });
    }

    const userId = req.user.id;

    // Verify this is actually a tester account (check auth metadata)
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (!authUser?.user?.user_metadata?.is_tester) {
      return res.status(403).json({ error: 'Not a tester account' });
    }

    // Delete user's rooms (and cascade to room_members, events, tasks, etc.)
    const { data: ownedRooms } = await supabaseAdmin
      .from('room_members')
      .select('room_id')
      .eq('user_id', userId)
      .eq('role', 'owner');

    if (ownedRooms?.length) {
      for (const r of ownedRooms) {
        await ignoreQueryError(supabaseAdmin.from('rooms').delete().eq('id', r.room_id));
      }
    }

    // Remove from any rooms as member
    await ignoreQueryError(supabaseAdmin.from('room_members').delete().eq('user_id', userId));

    // Delete tasks assigned to or created by this user
    await ignoreQueryError(supabaseAdmin.from('tasks').delete().eq('assigned_to', userId));
    await ignoreQueryError(supabaseAdmin.from('tasks').delete().eq('created_by', userId));

    // Delete user profile
    await ignoreQueryError(supabaseAdmin.from('users').delete().eq('id', userId));

    // Delete from Supabase Auth
    await ignoreQueryError(supabaseAdmin.auth.admin.deleteUser(userId));

    res.json({ message: 'Tester account cleaned up' });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  signup,
  login,
  refreshSession,
  requestPasswordReset,
  verifyPasswordResetCode,
  completePasswordReset,
  logout,
  getMe,
  getPreferences,
  updatePreferences,
  updateProfile,
  sendEmailVerification,
  verifyEmailCode,
  completeSignup,
  guestLogin,
  guestCleanup,
};
