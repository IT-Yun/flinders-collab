import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Send, Paperclip, X, FileText } from 'lucide-react';

export default function ChatInput({ onSend, onFileSelect, uploading, embedded = false }) {
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState(null); // { file, previewUrl, isImage }
  const [customName, setCustomName] = useState('');
  const [customDesc, setCustomDesc] = useState('');
  const fileRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (preview) {
      // Ensure filename has extension
      let name = customName.trim() || preview.file.name;
      const ext = preview.file.name.match(/\.[^.]+$/)?.[0];
      if (ext && !name.endsWith(ext)) name = `${name}${ext}`;
      const desc = customDesc.trim();
      onFileSelect?.(preview.file, name, desc);
      clearPreview();
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setMessage('');
  };

  const clearPreview = () => {
    if (preview?.previewUrl) URL.revokeObjectURL(preview.previewUrl);
    setPreview(null);
    setCustomName('');
    setCustomDesc('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    setPreview({
      file,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
      isImage,
    });
    // Pre-fill with original filename (without extension for editing convenience)
    const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
    setCustomName(nameWithoutExt);
    setCustomDesc('');
  };

  const downgradePreviewToFileCard = () => {
    setPreview((prev) => {
      if (!prev) return prev;
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {
        ...prev,
        previewUrl: null,
        isImage: false,
      };
    });
  };

  return (
    <div
      className={embedded ? 'border-t border-slate-200/80 bg-white/95 backdrop-blur-sm' : 'rounded-b-2xl border-t-0 bg-slate-50'}
      style={{ paddingBottom: embedded ? 'max(0.75rem, calc(var(--safe-bottom) + 0.15rem))' : 'max(0.75rem, var(--safe-bottom))' }}
    >
      {preview && (
        <div className={`px-3 ${embedded ? 'pt-2.5 sm:px-4 sm:pt-3' : 'pt-3 sm:px-4 sm:pt-4'}`}>
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-2.5">
            <div className="flex items-center gap-3">
              {preview.isImage && preview.previewUrl ? (
                <img
                  src={preview.previewUrl}
                  alt="preview"
                  className="h-16 w-16 rounded-lg object-cover shadow-sm"
                  onError={downgradePreviewToFileCard}
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 shadow-sm">
                  <FileText className="h-7 w-7 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1.5">
                <Input
                  placeholder="File name..."
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  disabled={uploading}
                  className="h-8 text-sm rounded-lg border-blue-200 bg-white/80 px-2.5"
                />
                <Input
                  placeholder="Add description (optional)"
                  value={customDesc}
                  onChange={(e) => setCustomDesc(e.target.value)}
                  disabled={uploading}
                  className="h-8 text-xs rounded-lg border-blue-200 bg-white/80 px-2.5"
                />
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-red-100 shrink-0" onClick={clearPreview} disabled={uploading}>
                <X className="h-4 w-4 text-slate-400" />
              </Button>
            </div>
            <p className="text-[11px] text-slate-400 px-1">
              {preview.file.name} · {(preview.file.size / 1024).toFixed(1)} KB
            </p>
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className={`flex items-center gap-2 ${embedded ? 'px-3 pb-2 pt-2 sm:gap-2.5 sm:px-4 sm:pb-3 sm:pt-2.5' : 'p-3 sm:gap-3 sm:p-4'}`}>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept="image/*,.pdf,.pptx,.docx,.zip,.txt,.webp,.gif,.heic,.heif"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={`${embedded ? 'h-10 w-10' : 'h-11 w-11'} rounded-full hover:bg-blue-100 shrink-0`}
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Paperclip className="h-5 w-5 text-slate-400" />
        </Button>
        <Input
          placeholder={preview ? 'Send file...' : 'Type a message...'}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          disabled={!!preview || uploading}
          className={`${embedded ? 'h-10 px-3.5 text-[13px] sm:h-11 sm:px-4' : 'h-11 px-4 text-sm sm:h-12 sm:px-5'} flex-1 rounded-full border-slate-200 bg-white shadow-sm transition-all focus:border-blue-300 focus:shadow-md`}
        />
        <Button
          type="submit"
          size="icon"
          disabled={(!message.trim() && !preview) || uploading}
          className={`${embedded ? 'h-10 w-10 sm:h-11 sm:w-11' : 'h-11 w-11 sm:h-12 sm:w-12'} rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 transition-all hover:shadow-xl hover:shadow-blue-500/30 disabled:opacity-30 disabled:shadow-none`}
        >
          <Send className="h-5 w-5" />
        </Button>
      </form>
    </div>
  );
}
