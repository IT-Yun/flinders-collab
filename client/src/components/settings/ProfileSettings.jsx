import React, { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/toast';
import { apiGetMe } from '@/services/auth';
import { FLINDERS_PROGRAMS } from '@/lib/flinders-programs';
import { avatarLarge } from '@/lib/avatar';
import AvatarCropDialog from '@/components/AvatarCropDialog';

export default function ProfileSettings() {
  const { user, updateUser, refreshProfile } = useAuth();
  const { addToast } = useToast();

  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [studentId, setStudentId] = useState(user?.user_metadata?.student_id || '');
  const [major, setMajor] = useState(user?.user_metadata?.major || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [cropSource, setCropSource] = useState(null);
  const [cropMeta, setCropMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errors, setErrors] = useState({});
  const fileInputRef = useRef(null);
  const majorInputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const [majorQuery, setMajorQuery] = useState(user?.user_metadata?.major || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const currentAvatarUrl = user?.user_metadata?.avatar_url || null;
  const initials = (user?.user_metadata?.name || user?.email || '?')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  const isFlindersStudent = String(user?.email || '').toLowerCase().endsWith('@flinders.edu.au')
    || String(user?.user_metadata?.university || '').toLowerCase().includes('flinders');
  const filteredPrograms = majorQuery.length > 0
    ? FLINDERS_PROGRAMS.filter((program) => program.toLowerCase().includes(majorQuery.toLowerCase())).slice(0, 8)
    : [];

  useEffect(() => {
    let active = true;
    apiGetMe()
      .then((profile) => {
        if (!active) return;
        setName(profile?.full_name || user?.user_metadata?.name || '');
        setStudentId(profile?.student_id || user?.user_metadata?.student_id || '');
        setMajor(profile?.major || user?.user_metadata?.major || '');
        setMajorQuery(profile?.major || user?.user_metadata?.major || '');
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user?.user_metadata?.major, user?.user_metadata?.name, user?.user_metadata?.student_id]);

  useEffect(() => {
    setName(user?.user_metadata?.name || '');
    setStudentId(user?.user_metadata?.student_id || '');
    setMajor(user?.user_metadata?.major || '');
    setMajorQuery(user?.user_metadata?.major || '');
  }, [user?.user_metadata?.major, user?.user_metadata?.name, user?.user_metadata?.student_id]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current && !suggestionsRef.current.contains(event.target)
        && majorInputRef.current && !majorInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
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

  const handleMajorKeyDown = (event) => {
    if (!showSuggestions || filteredPrograms.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % filteredPrograms.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((prev) => (prev <= 0 ? filteredPrograms.length - 1 : prev - 1));
    } else if (event.key === 'Enter' && highlightIndex >= 0) {
      event.preventDefault();
      selectProgram(filteredPrograms[highlightIndex]);
    }
  };

  const validate = () => {
    const newErrors = {};
    const trimmedName = name.trim();
    if (!trimmedName) {
      newErrors.name = 'Name is required';
    } else if (trimmedName.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (trimmedName.length > 50) {
      newErrors.name = 'Name must be 50 characters or fewer';
    }

    const trimmedStudentId = studentId.trim();
    if (trimmedStudentId && !/^[a-zA-Z0-9-]+$/.test(trimmedStudentId)) {
      newErrors.studentId = 'Student ID can only use letters, numbers, or hyphens';
    }

    return newErrors;
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setErrors((prev) => ({ ...prev, avatar: 'Only PNG, JPG, and WebP images are allowed' }));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setErrors((prev) => ({ ...prev, avatar: 'Image must be smaller than 5MB' }));
      return;
    }

    setErrors((prev) => ({ ...prev, avatar: undefined }));
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSource(ev.target.result);
      setCropMeta({ fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setLoading(true);
    setErrors({});

    try {
      const formData = new FormData();
      formData.append('full_name', name.trim());
      if (studentId.trim()) formData.append('student_id', studentId.trim());
      if (major.trim()) formData.append('major', major.trim());
      if (avatarFile) formData.append('avatar', avatarFile);

      await updateUser(formData);
      setAvatarFile(null);
      setAvatarPreview(null);
      setCropSource(null);
      setCropMeta(null);
      addToast('Profile updated successfully', 'success');
    } catch (err) {
      addToast(err.message || 'Failed to update profile', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="overflow-visible rounded-2xl border-slate-200/80 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Profile</CardTitle>
          <CardDescription>Update your personal information and avatar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5 px-4 pb-5 sm:px-6 sm:pb-6">
        {/* Avatar upload */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className="relative group cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Avatar className="h-20 w-20 ring-4 ring-indigo-100 shadow">
              {(avatarPreview || currentAvatarUrl) && (
                <AvatarImage src={avatarPreview || avatarLarge(currentAvatarUrl)} alt="Profile" className="object-cover" />
              )}
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-bold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera className="h-5 w-5 text-white" />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Profile Photo</p>
            <p className="text-xs text-muted-foreground">PNG, JPG or WebP, max 5MB</p>
            {errors.avatar && <p className="text-xs text-destructive mt-1">{errors.avatar}</p>}
          </div>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label htmlFor="settings-name" className="text-sm font-medium">
            Full Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="settings-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your full name"
            disabled={loading}
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>

        {/* Email (read-only) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-muted-foreground">Email</label>
          <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg px-3 py-2.5">
            {user?.email}
          </p>
        </div>

        {/* Student ID */}
        <div className="space-y-1.5">
          <label htmlFor="settings-student-id" className="text-sm font-medium">
            Student ID <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          <Input
            id="settings-student-id"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            placeholder="e.g. 12345678"
            disabled={loading}
          />
          {errors.studentId && <p className="text-xs text-destructive">{errors.studentId}</p>}
        </div>

        {/* Major */}
        <div className="space-y-1.5">
          <label htmlFor="settings-major" className="text-sm font-medium">
            Major <span className="text-muted-foreground text-xs">(optional)</span>
          </label>
          {isFlindersStudent ? (
            <div className="relative">
              <Input
                id="settings-major"
                ref={majorInputRef}
                value={majorQuery}
                onChange={(event) => {
                  setMajorQuery(event.target.value);
                  setMajor(event.target.value);
                  setShowSuggestions(event.target.value.length > 0);
                  setHighlightIndex(-1);
                }}
                onFocus={() => {
                  if (majorQuery.length > 0) setShowSuggestions(true);
                }}
                onKeyDown={handleMajorKeyDown}
                placeholder="Search your Flinders program"
                disabled={loading}
                autoComplete="off"
              />
              {showSuggestions && filteredPrograms.length > 0 && (
                <div ref={suggestionsRef} className="absolute left-0 right-0 top-full z-30 mt-1 max-h-44 overflow-y-auto rounded-xl border bg-white shadow-lg">
                  {filteredPrograms.map((program, index) => (
                    <button
                      key={program}
                      type="button"
                      onClick={() => selectProgram(program)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${index === highlightIndex ? 'bg-slate-50' : ''}`}
                    >
                      {program}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Input
              id="settings-major"
              value={major}
              onChange={(e) => setMajor(e.target.value)}
              placeholder="e.g. Computer Science"
              disabled={loading}
            />
          )}
        </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
            <Button
              variant="outline"
              disabled={syncing || loading}
              className="w-full sm:w-auto"
              onClick={async () => {
                setSyncing(true);
                try {
                  await refreshProfile();
                  const fresh = await apiGetMe();
                  if (fresh?.user_metadata) {
                    setName(fresh.user_metadata.name || fresh.user_metadata.full_name || '');
                    setStudentId(fresh.user_metadata.student_id || '');
                    setMajor(fresh.user_metadata.major || '');
                    setMajorQuery(fresh.user_metadata.major || '');
                  }
                  setAvatarPreview(null);
                  setAvatarFile(null);
                  addToast('Profile synced from server', 'success');
                } catch {
                  addToast('Sync failed — try again', 'error');
                } finally {
                  setSyncing(false);
                }
              }}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              {syncing ? 'Syncing...' : 'Sync Profile'}
            </Button>
          </div>
        </CardContent>
      </Card>
      <AvatarCropDialog
        open={Boolean(cropSource)}
        imageSrc={cropSource}
        fileName={cropMeta?.fileName}
        mimeType={cropMeta?.mimeType}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setCropSource(null);
            setCropMeta(null);
          }
        }}
        onConfirm={async (croppedFile, previewUrl) => {
          setAvatarFile(croppedFile);
          setAvatarPreview(previewUrl);
          setCropSource(null);
          setCropMeta(null);
        }}
      />
    </>
  );
}
