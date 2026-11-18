import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Trash2, Pencil, CalendarDays, Loader2, FileText, FolderOpen } from 'lucide-react';
import { format } from 'date-fns';
import { deleteFile, getFileDownloadUrl, updateFile } from '@/services/files';
import { useAuth } from '@/hooks/useAuth';

function formatSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function forceDownload(url, fileName) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, '_blank');
  }
}

function getFileTypeStyle(fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (['pdf'].includes(ext)) return { border: 'border-l-red-500', gradient: 'from-red-500 to-rose-500' };
  if (['pptx', 'ppt'].includes(ext)) return { border: 'border-l-orange-500', gradient: 'from-orange-500 to-amber-500' };
  if (['docx', 'doc'].includes(ext)) return { border: 'border-l-blue-500', gradient: 'from-blue-500 to-blue-600' };
  if (['png', 'jpg', 'jpeg'].includes(ext)) return { border: 'border-l-emerald-500', gradient: 'from-emerald-500 to-teal-500' };
  if (['zip'].includes(ext)) return { border: 'border-l-purple-500', gradient: 'from-purple-500 to-violet-500' };
  if (['txt'].includes(ext)) return { border: 'border-l-slate-500', gradient: 'from-slate-500 to-slate-600' };
  return { border: 'border-l-indigo-500', gradient: 'from-indigo-500 to-indigo-600' };
}

function FileRow({ file, canEdit, onDelete, onEdit, onDownload, deleting, downloading, draggable: isDraggable }) {
  const fileName = file.file_name || file.name;
  const uploaderName = file.users?.full_name || file.uploader_name || 'Unknown';
  const typeStyle = getFileTypeStyle(fileName);

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/file-id', file.id);
    e.dataTransfer.setData('text/source-category', file.category || '');
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable={isDraggable}
      onDragStart={isDraggable ? handleDragStart : undefined}
      className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 rounded-xl border border-slate-200/60 border-l-4 ${typeStyle.border} bg-white shadow-md shadow-slate-200/50 hover:shadow-lg hover:shadow-slate-200/70 hover:-translate-y-0.5 transition-all duration-200 p-4 ${isDraggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-center gap-3 sm:contents">
        <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl bg-gradient-to-br ${typeStyle.gradient} flex items-center justify-center shrink-0 shadow-md`}>
          <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </div>
        <div className="flex-1 min-w-0 sm:hidden">
          <p className="break-all text-sm font-bold leading-snug text-slate-800">{fileName}</p>
        </div>
      </div>
      <div className="flex-1 min-w-0 hidden sm:block">
        <p className="break-all text-sm font-bold leading-snug text-slate-800">{fileName}</p>
        {file.file_description ? (
          <p className="text-xs text-slate-500 italic leading-snug line-clamp-2 mt-0.5">{file.file_description}</p>
        ) : (
          <p className="text-xs text-slate-400 italic mt-0.5">No description</p>
        )}
        <p className="text-xs text-slate-500 mt-1">
          {uploaderName} <span className="mx-1">&middot;</span> {file.created_at ? format(new Date(file.created_at), 'MMM d, h:mm a') : ''}
          {file.file_size > 0 && <><span className="mx-1">&middot;</span>{formatSize(file.file_size)}</>}
        </p>
        {file.event && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-xs px-2.5 py-0.5 text-blue-600 font-medium">
              <CalendarDays className="h-3 w-3 shrink-0" />
              <span className="truncate">{file.event.title}</span>
            </span>
          </div>
        )}
      </div>
      {/* Mobile-only meta info */}
      <div className="sm:hidden">
        {file.file_description && (
          <p className="text-xs text-slate-500 italic leading-snug line-clamp-2">{file.file_description}</p>
        )}
        <p className="mt-0.5 break-words text-xs text-slate-500">
          {uploaderName} <span className="mx-1">&middot;</span> {file.created_at ? format(new Date(file.created_at), 'MMM d, h:mm a') : ''}
          {file.file_size > 0 && <><span className="mx-1">&middot;</span>{formatSize(file.file_size)}</>}
        </p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:from-blue-600 hover:to-indigo-600 h-9 px-4 shadow-md shadow-blue-500/20 hover:shadow-lg" onClick={() => onDownload(file)} disabled={downloading}>
              {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top"><p>Download</p></TooltipContent>
        </Tooltip>
        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-blue-50" onClick={() => onEdit(file)}>
                <Pencil className="h-3.5 w-3.5 text-slate-400 hover:text-blue-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Edit description</p></TooltipContent>
          </Tooltip>
        )}
        {canEdit && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg hover:bg-red-50 hover:text-red-600" onClick={() => onDelete(file.id, fileName)} disabled={deleting}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top"><p>Delete file</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export default function FileList({ files = [], roomId, onFilesChange, filterCategory, members = [], draggable: isDraggable }) {
  const { user } = useAuth();

  // Determine if current user is admin/owner for delete/edit affordance
  const currentMember = members.find((m) => String(m.user_id) === String(user?.id));
  const isAdmin = currentMember?.role === 'owner' || currentMember?.role === 'admin';
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editFile, setEditFile] = useState(null);
  const [editDesc, setEditDesc] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleDelete = async () => {
    if (!confirmDelete) return;
    const fileId = confirmDelete.id;
    setConfirmDelete(null);
    setDeletingId(fileId);
    setErrorMsg('');
    try {
      await deleteFile(roomId, fileId);
      onFilesChange?.((prev) => prev.filter((file) => file.id !== fileId));
    } catch (err) {
      setErrorMsg(err.message || 'Failed to delete file.');
    } finally {
      setDeletingId(null);
    }
  };

  const [editName, setEditName] = useState('');

  const handleEditOpen = (file) => {
    setEditFile(file);
    setEditDesc(file.file_description || '');
    setEditName(file.file_name || file.name || '');
  };

  const handleEditSave = async () => {
    if (!editFile) return;
    setEditLoading(true);
    setErrorMsg('');
    try {
      const updates = { file_description: editDesc.trim() };
      const trimmedName = editName.trim();
      if (trimmedName && trimmedName !== (editFile.file_name || editFile.name)) {
        updates.file_name = trimmedName;
      }
      const updatedFile = await updateFile(editFile.id, updates);
      onFilesChange?.((prev) =>
        prev.map((file) => (
          file.id === editFile.id
            ? { ...file, ...updatedFile }
            : file
        ))
      );
      setEditFile(null);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to update file.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleDownload = async (file) => {
    setDownloadingId(file.id);
    setErrorMsg('');
    try {
      // Prefer pre-signed URL from list response; fall back to dedicated endpoint
      const url = file.download_url;
      if (url) {
        await forceDownload(url, file.file_name || file.name);
      } else {
        const data = await getFileDownloadUrl(file.id);
        if (data?.download_url) {
          await forceDownload(data.download_url, file.file_name || file.name);
        } else {
          setErrorMsg('Download link unavailable. Please try again.');
        }
      }
    } catch (err) {
      setErrorMsg(err.message || 'Failed to download file.');
    } finally {
      setDownloadingId(null);
    }
  };

  const filtered = filterCategory
    ? files.filter((f) => f.category === filterCategory)
    : files;

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-4 shadow-lg shadow-blue-500/10">
          <FolderOpen className="h-8 w-8 text-blue-500" />
        </div>
        <p className="text-sm font-bold text-slate-500">No files yet</p>
        <p className="text-xs text-slate-400 mt-1">Upload a file to get started</p>
      </div>
    );
  }

  return (
    <>
      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-2.5 text-xs text-destructive mb-3">
          {errorMsg}
        </div>
      )}
      <div className="space-y-3">
        {filtered.map((file) => {
          const isUploader = String(file.uploaded_by) === String(user?.id);
          return (
            <FileRow
              key={file.id}
              file={file}
              canEdit={isUploader || isAdmin}
              onDownload={handleDownload}
              onDelete={(id, name) => setConfirmDelete({ id, name })}
              onEdit={handleEditOpen}
              deleting={deletingId === file.id}
              downloading={downloadingId === file.id}
              draggable={isDraggable}
            />
          );
        })}
      </div>

      {/* Edit description dialog */}
      <Dialog open={!!editFile} onOpenChange={(open) => !open && setEditFile(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-bold">Edit File</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">File Name</label>
              <Input
                placeholder="File name..."
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={editLoading}
                className="rounded-xl border-slate-200"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Description</label>
              <Input
                placeholder="Enter description..."
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                disabled={editLoading}
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditFile(null)} disabled={editLoading}>Cancel</Button>
            <Button className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25" onClick={handleEditSave} disabled={editLoading}>
              {editLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{confirmDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Yes, Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
