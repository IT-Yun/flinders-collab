import React, { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Camera, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { avatarLarge } from '@/lib/avatar';
import { apiGetMe } from '@/services/auth';
import { FLINDERS_PROGRAMS } from '@/lib/flinders-programs';
import AvatarCropDialog from '@/components/AvatarCropDialog';

export default function ProfileDialog({ open, onOpenChange }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user?.user_metadata?.name || '');
  const [studentId, setStudentId] = useState(user?.user_metadata?.student_id || '');
  const [major, setMajor] = useState(user?.user_metadata?.major || '');
  const [majorQuery, setMajorQuery] = useState(user?.user_metadata?.major || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [cropSource, setCropSource] = useState(null);
  const [cropMeta, setCropMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const majorInputRef = useRef(null);
  const suggestionsRef = useRef(null);

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
    if (!open) return undefined;
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
  }, [open, user?.user_metadata?.major, user?.user_metadata?.name, user?.user_metadata?.student_id]);

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

  const handleFileSelect = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Only PNG, JPG, and WebP images are allowed');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }

    setError('');
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCropSource(ev.target.result);
      setCropMeta({ fileName: file.name, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    const trimmedStudentId = studentId.trim();

    if (!trimmedName) {
      setError('Name is required');
      return;
    }

    if (trimmedStudentId && !/^[a-zA-Z0-9-]+$/.test(trimmedStudentId)) {
      setError('Student ID can only use letters, numbers, or hyphens');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('full_name', trimmedName);
      if (trimmedStudentId) formData.append('student_id', trimmedStudentId);
      if (major.trim()) formData.append('major', major.trim());
      if (avatarFile) formData.append('avatar', avatarFile);

      await updateUser(formData);
      onOpenChange(false);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen) => {
    if (!isOpen) {
      setAvatarFile(null);
      setAvatarPreview(null);
      setCropSource(null);
      setCropMeta(null);
      setError('');
      setShowSuggestions(false);
      setHighlightIndex(-1);
      setName(user?.user_metadata?.name || '');
      setStudentId(user?.user_metadata?.student_id || '');
      setMajor(user?.user_metadata?.major || '');
      setMajorQuery(user?.user_metadata?.major || '');
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] w-[min(calc(100vw-1rem),46rem)] max-w-[46rem] overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-0">
        <div className="p-5 pb-[max(1.25rem,var(--safe-bottom))] sm:p-8">
          <DialogHeader className="text-left">
            <DialogTitle className="text-2xl font-bold text-slate-900">Profile</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              Update your personal information and avatar.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-6 space-y-6 sm:mt-8 sm:space-y-8">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
              <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
                <Avatar className="h-24 w-24 ring-4 ring-indigo-100 shadow">
                  {(avatarPreview || currentAvatarUrl) && (
                    <AvatarImage src={avatarPreview || avatarLarge(currentAvatarUrl)} alt="Profile" className="object-cover" />
                  )}
                  <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-600 text-3xl font-bold text-white">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/35 opacity-0 transition-opacity group-hover:opacity-100">
                  <Camera className="h-6 w-6 text-white" />
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-900 sm:text-2xl">Profile Photo</p>
                <p className="mt-1 text-sm text-slate-500">PNG, JPG or WebP, max 5MB</p>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-name" className="text-sm font-semibold text-slate-800">
                Full Name <span className="text-red-500">*</span>
              </label>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your full name"
                disabled={loading}
                className="h-14 rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-500">Email</label>
              <p className="rounded-2xl bg-slate-50 px-4 py-4 text-base text-slate-500">
                {user?.email}
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-student-id" className="text-sm font-semibold text-slate-800">
                Student ID <span className="text-slate-400">(optional)</span>
              </label>
              <Input
                id="profile-student-id"
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                placeholder="e.g. 12345678"
                disabled={loading}
                className="h-14 rounded-2xl"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="profile-major" className="text-sm font-semibold text-slate-800">
                Major <span className="text-slate-400">(optional)</span>
              </label>
              {isFlindersStudent ? (
                <div className="relative">
                  <Input
                    id="profile-major"
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
                    className="h-14 rounded-2xl"
                  />
                  {showSuggestions && filteredPrograms.length > 0 && (
                    <div ref={suggestionsRef} className="absolute left-0 right-0 top-full z-30 mt-2 max-h-48 overflow-y-auto rounded-2xl border bg-white shadow-lg">
                      {filteredPrograms.map((program, index) => (
                        <button
                          key={program}
                          type="button"
                          onClick={() => selectProgram(program)}
                          className={`w-full px-4 py-3 text-left text-sm hover:bg-slate-50 ${index === highlightIndex ? 'bg-slate-50' : ''}`}
                        >
                          {program}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <Input
                  id="profile-major"
                  value={major}
                  onChange={(event) => setMajor(event.target.value)}
                  placeholder="e.g. Computer Science"
                  disabled={loading}
                  className="h-14 rounded-2xl"
                />
              )}
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <Button onClick={handleSave} disabled={loading} className="h-12 rounded-2xl px-6">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </DialogContent>
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
    </Dialog>
  );
}
