import React, { useEffect, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Download, FileText, X } from 'lucide-react';
import { getFileDownloadUrl } from '@/services/files';
import { avatarThumb } from '@/lib/avatar';

function ImageLightbox({ src, alt, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <button className="absolute top-4 right-4 rounded-full bg-white/20 p-2 text-white hover:bg-white/30 transition" onClick={onClose}>
        <X className="h-6 w-6" />
      </button>
      <img src={src} alt={alt} className="max-h-[90vh] max-w-[90vw] rounded-xl shadow-2xl object-contain" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

function FileAttachment({ fileData, isOwn }) {
  const [lightbox, setLightbox] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);

  if (!fileData) return null;

  const isImage = fileData.file_type?.startsWith('image/');
  const downloadUrl = resolvedUrl || fileData.download_url || null;

  useEffect(() => {
    let cancelled = false;

    const refreshUrl = async () => {
      setImageFailed(false);

      if (!fileData?.file_id) {
        setResolvedUrl(fileData?.download_url || null);
        return;
      }

      try {
        const refreshed = await getFileDownloadUrl(fileData.file_id);
        if (!cancelled && refreshed?.download_url) {
          setResolvedUrl(refreshed.download_url);
          return;
        }
      } catch {
        // Fall back to the persisted URL if a refresh request fails.
      }

      if (!cancelled) {
        setResolvedUrl(fileData?.download_url || null);
      }
    };

    refreshUrl();
    return () => {
      cancelled = true;
    };
  }, [fileData?.download_url, fileData?.file_id]);

  const handleImageError = async () => {
    if (!fileData?.file_id) {
      setImageFailed(true);
      return;
    }

    try {
      const refreshed = await getFileDownloadUrl(fileData.file_id);
      if (refreshed?.download_url && refreshed.download_url !== resolvedUrl) {
        setResolvedUrl(refreshed.download_url);
        return;
      }
    } catch {
      // Fall through to the file card fallback.
    }

    setImageFailed(true);
  };

  if (isImage && downloadUrl && !imageFailed) {
    return (
      <>
        <div className="mt-1 cursor-pointer" onClick={() => setLightbox(true)}>
          <img
            src={downloadUrl}
            alt={fileData.file_name}
            className="max-w-[240px] max-h-[200px] rounded-xl object-cover shadow-md hover:shadow-lg transition-shadow"
            onError={handleImageError}
          />
        </div>
        <p className={cn('mt-1 break-all text-[11px]', isOwn ? 'text-white/70' : 'text-slate-400')}>{fileData.file_name}</p>
        {lightbox && <ImageLightbox src={downloadUrl} alt={fileData.file_name} onClose={() => setLightbox(false)} />}
      </>
    );
  }

  return (
    <div className={cn(
      'mt-1 flex items-center gap-3 rounded-xl p-3 max-w-[280px]',
      isOwn ? 'bg-white/15' : 'bg-slate-50 border border-slate-200'
    )}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500 shadow-sm">
        <FileText className="h-5 w-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('break-all text-sm font-medium', isOwn ? 'text-white' : 'text-slate-700')}>{fileData.file_name}</p>
        <p className={cn('text-[11px]', isOwn ? 'text-white/60' : 'text-slate-400')}>
          {fileData.file_size ? `${(fileData.file_size / 1024).toFixed(1)} KB` : 'File'}
        </p>
      </div>
      {downloadUrl && (
        <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className={cn('shrink-0', isOwn ? 'text-white/80 hover:text-white' : 'text-blue-500 hover:text-blue-600')}>
          <Download className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

export default function MessageBubble({ message, isOwn }) {
  const displayName = message.users?.full_name || message.sender_name || message.user_name || 'User';
  const avatarUrl = message.users?.avatar_url || message.avatar_url || null;
  const initials = displayName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const time = message.created_at ? format(new Date(message.created_at), 'h:mm a') : '';

  // Parse file data from message
  let fileData = null;
  if (message.message_type === 'file' && message.content) {
    try {
      fileData = JSON.parse(message.content);
    } catch {
      // content is plain text, not JSON
    }
  }

  return (
    <div className={cn('flex gap-3', isOwn ? 'flex-row-reverse' : 'flex-row')} style={{ alignItems: 'flex-start' }}>
      <Avatar className="h-9 w-9 shrink-0 ring-2 ring-white shadow-md mt-1">
        {avatarUrl && <AvatarImage src={avatarThumb(avatarUrl)} alt={displayName} className="object-cover" />}
        <AvatarFallback className="bg-gradient-to-br from-blue-500 to-indigo-500 text-white text-xs font-bold">{initials}</AvatarFallback>
      </Avatar>
      <div className={cn('max-w-[78%] min-w-0', isOwn ? 'text-right' : 'text-left')}>
        <div className={cn('flex items-baseline gap-2 mb-1', isOwn ? 'justify-end' : 'justify-start')}>
          <span className={cn('min-w-0 break-words text-[12px] font-semibold', isOwn ? 'text-indigo-600' : 'text-slate-700')}>
            {displayName}
          </span>
          <span className="text-[10px] text-slate-400 font-medium">{time}</span>
        </div>
        {fileData ? (
          <div className={cn('inline-block', isOwn ? 'text-right' : 'text-left')}>
            <FileAttachment fileData={fileData} isOwn={isOwn} />
          </div>
        ) : (
          <div className={cn(
            'inline-block px-5 py-3 text-[14px] leading-relaxed',
            isOwn
              ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-2xl rounded-br-md shadow-md shadow-blue-500/20'
              : 'bg-white shadow-sm border border-slate-100 rounded-2xl rounded-bl-md text-slate-800'
          )}>
            <span className="whitespace-pre-wrap break-words">{message.content}</span>
          </div>
        )}
      </div>
    </div>
  );
}
