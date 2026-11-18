import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, Loader2, FileText, Image, FileArchive, File } from 'lucide-react';
import { uploadFile } from '@/services/files';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'application/zip',
  'application/x-zip-compressed',
  'text/plain',
];
const MAX_SIZE = 50 * 1024 * 1024;

const CATEGORIES = [
  { value: 'lecture', label: 'Lecture Materials', icon: '📖' },
  { value: 'submission', label: 'Team Submissions', icon: '📝' },
];

function getFileIcon(type) {
  if (type?.includes('pdf') || type?.includes('word') || type?.includes('presentation')) return <FileText className="h-5 w-5" />;
  if (type?.includes('image')) return <Image className="h-5 w-5" />;
  if (type?.includes('zip')) return <FileArchive className="h-5 w-5" />;
  return <File className="h-5 w-5" />;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function FileUpload({ roomId, onUploaded, category: initialCategory, events = [] }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(initialCategory || 'lecture');
  const [eventId, setEventId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setDescription('');
    setError('');
    setEventId('');
    setCategory(initialCategory || 'lecture');
  };

  const handleOpenChange = (v) => {
    setOpen(v);
    if (!v) reset();
  };

  const selectFile = (f) => {
    setError('');
    if (!ALLOWED_TYPES.includes(f.type)) {
      setError('File type not allowed. Accepted: PDF, PPTX, DOCX, PNG, JPG, ZIP, TXT');
      return;
    }
    if (f.size > MAX_SIZE) {
      setError('File too large. Maximum size is 10MB.');
      return;
    }
    setFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) selectFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { setError('Please select a file.'); return; }

    setLoading(true);
    try {
      const uploadedFile = await uploadFile(roomId, file, {
        description: description.trim(),
        category,
        event_id: eventId || undefined,
      });
      const linkedEvent = eventId ? events.find((item) => String(item.id) === String(eventId)) : null;
      onUploaded?.({
        ...uploadedFile,
        users: uploadedFile.users || (user ? {
          id: user.id,
          full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'You',
        } : undefined),
        event: uploadedFile.event || linkedEvent || undefined,
      });
      handleOpenChange(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sort events by start_time descending for the dropdown
  const sortedEvents = [...events].sort((a, b) => new Date(b.start_time) - new Date(a.start_time));

  return (
    <>
      <Button size="sm" className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 transition-all" onClick={() => { setCategory(initialCategory || 'lecture'); setOpen(true); }}>
        <Upload className="mr-2 h-4 w-4" />
        Upload File
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[440px] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold text-lg">Upload File</DialogTitle>
            <DialogDescription className="text-slate-500">Upload a file to share with your team</DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Category</label>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => { setCategory(c.value); if (c.value !== 'submission') setEventId(''); }}
                    className={`flex items-center gap-2.5 rounded-xl border-2 px-4 py-3 text-sm transition-all duration-200 ${
                      category === c.value
                        ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 font-semibold shadow-md shadow-blue-500/10'
                        : 'border-slate-200 hover:border-blue-300 hover:bg-blue-50/50 text-slate-500'
                    }`}
                  >
                    <span className="text-lg">{c.icon}</span>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Event selector - only for submissions */}
            {category === 'submission' && sortedEvents.length > 0 && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Submit for Event <span className="text-slate-400 font-normal">(optional)</span></label>
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                  className="w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-400 transition-colors"
                >
                  <option value="">No event (general submission)</option>
                  {sortedEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} — {format(new Date(ev.start_time), 'MMM d, yyyy')}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* File Drop Zone */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">File</label>
              {file ? (
                <div className="flex items-center gap-3 rounded-xl border-2 border-blue-200 bg-blue-50/50 shadow-sm p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-md">
                    <span className="text-white">{getFileIcon(file.type)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-500">{formatSize(file.size)}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-100 rounded-lg" onClick={() => setFile(null)}>
                    Change
                  </Button>
                </div>
              ) : (
                <div
                  className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 transition-all duration-300 cursor-pointer ${
                    dragActive
                      ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg shadow-blue-500/10 scale-[1.02]'
                      : 'border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100/50 hover:from-blue-50/50 hover:to-indigo-50/50 hover:border-blue-400'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  onClick={() => inputRef.current?.click()}
                >
                  <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
                    dragActive
                      ? 'bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/30 scale-110'
                      : 'bg-gradient-to-br from-blue-100 to-indigo-100'
                  }`}>
                    <Upload className={`h-8 w-8 transition-colors duration-300 ${dragActive ? 'text-white' : 'text-blue-500'}`} />
                  </div>
                  <p className="text-sm font-semibold text-slate-600">Drop files here or click to browse</p>
                  <p className="mt-1.5 text-xs text-slate-400">PDF, PPTX, DOCX, PNG, JPG, ZIP, TXT (max 10MB)</p>
                  <input ref={inputRef} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && selectFile(e.target.files[0])} accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg,.zip,.txt" />
                </div>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-700">Description <span className="text-slate-400 font-normal">(optional)</span></label>
              <Textarea
                className="rounded-xl border-slate-200"
                placeholder="Brief description of this file..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            {error && <p className="text-sm text-destructive font-medium">{error}</p>}

            <Button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl h-12 shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 transition-all font-semibold" disabled={loading || !file}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {category === 'submission' && eventId ? 'Submit' : 'Upload'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
