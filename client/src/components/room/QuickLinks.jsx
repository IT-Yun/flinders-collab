import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { ExternalLink, Plus, Trash2, Link2, Copy, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/native';
import { createQuickLink, deleteQuickLink } from '@/services/rooms';

const TOOL_PRESETS = [
  { name: 'Google Docs', icon: '📄', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { name: 'Google Slides', icon: '📊', color: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
  { name: 'Google Sheets', icon: '📗', color: 'bg-green-50 border-green-200 text-green-700' },
  { name: 'Notion', icon: '📝', color: 'bg-slate-50 border-slate-200 text-slate-700' },
  { name: 'Figma', icon: '🎨', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  { name: 'Jira', icon: '🔧', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { name: 'GitHub', icon: '🐙', color: 'bg-slate-50 border-slate-200 text-slate-700' },
  { name: 'Miro', icon: '🖼️', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { name: 'Canva', icon: '🎯', color: 'bg-teal-50 border-teal-200 text-teal-700' },
  { name: 'Other', icon: '🔗', color: 'bg-gray-50 border-gray-200 text-gray-700' },
];

function getPreset(name) {
  return TOOL_PRESETS.find((p) => p.name === name) || TOOL_PRESETS[TOOL_PRESETS.length - 1];
}

export default function QuickLinks({ roomId, links = [], onLinksChange }) {
  const [addOpen, setAddOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState('');
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const [error, setError] = useState('');
  const [selectedLink, setSelectedLink] = useState(null);
  const [copiedLinkId, setCopiedLinkId] = useState(null);
  const savedLinks = Array.isArray(links) ? links : [];

  const handleAdd = async () => {
    if (!url.trim()) {
      setError('URL is required');
      return;
    }

    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    try {
      new URL(finalUrl);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    const preset = getPreset(selectedTool || 'Other');
    try {
      const newLink = await createQuickLink(roomId, {
        tool: selectedTool || 'Other',
        url: finalUrl,
        label: label.trim() || preset.name,
      });

      onLinksChange?.([...savedLinks, newLink]);
      setAddOpen(false);
      setUrl('');
      setLabel('');
      setSelectedTool('');
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to add link');
    }
  };

  const handleRemove = async (linkId) => {
    try {
      await deleteQuickLink(roomId, linkId);
      onLinksChange?.(savedLinks.filter((l) => l.id !== linkId));
    } catch (err) {
      setError(err.message || 'Failed to remove link');
    }
  };

  const handleLinkActionOpen = (link) => {
    setSelectedLink(link);
  };

  const handleLinkOpen = () => {
    if (!selectedLink?.url) return;
    window.open(selectedLink.url, '_blank', 'noopener,noreferrer');
    setSelectedLink(null);
  };

  const handleLinkCopy = async () => {
    if (!selectedLink?.url) return;
    try {
      await copyToClipboard(selectedLink.url);
      setCopiedLinkId(selectedLink.id);
      window.setTimeout(() => setCopiedLinkId((current) => (current === selectedLink.id ? null : current)), 1500);
      setSelectedLink(null);
    } catch {
      setError('Failed to copy link');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-indigo-500" />
          <h3 className="text-base font-semibold">Quick Links</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)} className="h-8 gap-1.5 text-xs">
          <Plus className="h-3.5 w-3.5" />
          Add Link
        </Button>
      </div>

      {savedLinks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center">
          <Link2 className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No links yet</p>
          <p className="text-xs text-muted-foreground/60 mt-0.5">Add Google Docs, Figma, Jira or any tool your team uses</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {savedLinks.map((link) => {
            const preset = getPreset(link.tool);
            return (
              <button
                key={link.id}
                type="button"
                onClick={() => handleLinkActionOpen(link)}
                className={`group flex items-center gap-3 rounded-xl border p-3 transition-all hover:shadow-md hover:-translate-y-0.5 ${preset.color}`}
              >
                <span className="text-xl">{preset.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{link.label}</p>
                  <p className="text-[11px] opacity-60 truncate">{link.url}</p>
                </div>
                {copiedLinkId === link.id ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity shrink-0" />
                )}
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemove(link.id); }}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </button>
              </button>
            );
          })}
        </div>
      )}

      {/* Add Link Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Quick Link</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tool</label>
              <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
                {TOOL_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => { setSelectedTool(preset.name); if (!label) setLabel(preset.name); }}
                    className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-all ${
                      selectedTool === preset.name
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                        : 'border-border hover:border-indigo-300'
                    }`}
                  >
                    <span className="text-lg">{preset.icon}</span>
                    <span className="text-[10px] font-medium leading-tight">{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">URL</label>
              <Input
                placeholder="https://docs.google.com/..."
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Label <span className="text-muted-foreground font-normal">(optional)</span></label>
              <Input
                placeholder="e.g. Project Report Draft"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add Link</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedLink} onOpenChange={(open) => !open && setSelectedLink(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{selectedLink?.label || 'Quick Link'}</DialogTitle>
            <DialogDescription className="break-all pr-8">{selectedLink?.url || ''}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <button
              type="button"
              onClick={handleLinkOpen}
              className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-left text-white shadow-md transition hover:shadow-lg"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">Open link</p>
                <p className="text-xs text-white/75">Go to the original page in a new tab</p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </button>
            <button
              type="button"
              onClick={handleLinkCopy}
              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-slate-900 shadow-sm transition hover:border-slate-300 hover:bg-white"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold">Copy link</p>
                <p className="text-xs text-slate-500">Copy the full URL to your clipboard</p>
              </div>
              <Copy className="h-4 w-4 shrink-0 text-slate-500" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
