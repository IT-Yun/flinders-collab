import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Users, Crown, Trash2, LogOut, Loader2, ArrowRight } from 'lucide-react';
import { deleteRoom, leaveRoom } from '@/services/rooms';

const roomPalettes = [
  {
    accent: '#f9a8d4',
    border: '#fbcfe8',
    glow: 'rgba(251, 207, 232, 0.45)',
    surface: 'linear-gradient(135deg, rgba(255, 241, 246, 1) 0%, rgba(255, 255, 255, 0.98) 68%)',
    headerGradient: 'linear-gradient(135deg, #ec4899 0%, #f43f5e 50%, #fb7185 100%)',
    pillBg: 'rgba(244, 63, 94, 0.10)',
    pillText: '#be123c',
    courseBg: '#fbcfe8',
    courseText: '#831843',
    roleBorder: '#fbcfe8',
    roleBg: 'rgba(255,255,255,0.82)',
    roleText: '#9d174d',
    meta: '#831843',
    divider: '#fce7f3',
  },
  {
    accent: '#7dd3fc',
    border: '#bae6fd',
    glow: 'rgba(186, 230, 253, 0.5)',
    surface: 'linear-gradient(135deg, rgba(240, 249, 255, 1) 0%, rgba(255, 255, 255, 0.98) 68%)',
    headerGradient: 'linear-gradient(135deg, #0ea5e9 0%, #38bdf8 50%, #7dd3fc 100%)',
    pillBg: 'rgba(14, 165, 233, 0.10)',
    pillText: '#0369a1',
    courseBg: '#bae6fd',
    courseText: '#0c4a6e',
    roleBorder: '#bae6fd',
    roleBg: 'rgba(255,255,255,0.82)',
    roleText: '#075985',
    meta: '#0f3b53',
    divider: '#e0f2fe',
  },
  {
    accent: '#86efac',
    border: '#bbf7d0',
    glow: 'rgba(187, 247, 208, 0.5)',
    surface: 'linear-gradient(135deg, rgba(240, 253, 244, 1) 0%, rgba(255, 255, 255, 0.98) 68%)',
    headerGradient: 'linear-gradient(135deg, #22c55e 0%, #4ade80 50%, #86efac 100%)',
    pillBg: 'rgba(34, 197, 94, 0.10)',
    pillText: '#15803d',
    courseBg: '#bbf7d0',
    courseText: '#14532d',
    roleBorder: '#bbf7d0',
    roleBg: 'rgba(255,255,255,0.82)',
    roleText: '#166534',
    meta: '#1f5136',
    divider: '#dcfce7',
  },
  {
    accent: '#fcd34d',
    border: '#fde68a',
    glow: 'rgba(253, 230, 138, 0.5)',
    surface: 'linear-gradient(135deg, rgba(255, 251, 235, 1) 0%, rgba(255, 255, 255, 0.98) 68%)',
    headerGradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 50%, #fcd34d 100%)',
    pillBg: 'rgba(245, 158, 11, 0.10)',
    pillText: '#b45309',
    courseBg: '#fde68a',
    courseText: '#78350f',
    roleBorder: '#fde68a',
    roleBg: 'rgba(255,255,255,0.82)',
    roleText: '#92400e',
    meta: '#6b4715',
    divider: '#fef3c7',
  },
  {
    accent: '#c4b5fd',
    border: '#ddd6fe',
    glow: 'rgba(221, 214, 254, 0.55)',
    surface: 'linear-gradient(135deg, rgba(245, 243, 255, 1) 0%, rgba(255, 255, 255, 0.98) 68%)',
    headerGradient: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 50%, #c4b5fd 100%)',
    pillBg: 'rgba(139, 92, 246, 0.10)',
    pillText: '#6d28d9',
    courseBg: '#ddd6fe',
    courseText: '#4c1d95',
    roleBorder: '#ddd6fe',
    roleBg: 'rgba(255,255,255,0.82)',
    roleText: '#5b21b6',
    meta: '#4b2f77',
    divider: '#ede9fe',
  },
  {
    accent: '#99f6e4',
    border: '#ccfbf1',
    glow: 'rgba(204, 251, 241, 0.55)',
    surface: 'linear-gradient(135deg, rgba(240, 253, 250, 1) 0%, rgba(255, 255, 255, 0.98) 68%)',
    headerGradient: 'linear-gradient(135deg, #14b8a6 0%, #2dd4bf 50%, #99f6e4 100%)',
    pillBg: 'rgba(20, 184, 166, 0.10)',
    pillText: '#0f766e',
    courseBg: '#ccfbf1',
    courseText: '#134e4a',
    roleBorder: '#ccfbf1',
    roleBg: 'rgba(255,255,255,0.82)',
    roleText: '#0f766e',
    meta: '#195853',
    divider: '#ccfbf1',
  },
];

export function getRoomPalette(room) {
  const seed = `${room.id || ''}-${room.name || ''}`;
  const hash = [...seed].reduce((acc, char) => ((acc * 31) + char.charCodeAt(0)) % roomPalettes.length, 0);
  return roomPalettes[Math.abs(hash) % roomPalettes.length];
}

export default function RoomCard({ room, onDeleted, draggableProps, suppressNavigation = false }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const isOwner = room.my_role === 'owner';
  const palette = getRoomPalette(room);
  const courseLabel = room.course_name || room.course_code || '';
  const memberCount = Number(room.member_count || 0);

  const handleAction = async () => {
    setLoading(true);
    try {
      if (isOwner) {
        await deleteRoom(room.id);
      } else {
        await leaveRoom(room.id);
      }
      setConfirmOpen(false);
      onDeleted?.();
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full">
      <div
        {...draggableProps}
        className="relative flex h-full flex-col overflow-hidden rounded-[22px] border-2 text-card-foreground transition-all duration-300 ease-out md:cursor-grab md:hover:-translate-y-1.5 md:hover:scale-[1.01] md:active:cursor-grabbing"
        style={{
          background: '#ffffff',
          borderColor: palette.border,
          boxShadow: hovered
            ? `0 20px 40px -12px ${palette.glow}, 0 8px 20px -8px rgba(0,0,0,0.08)`
            : `0 12px 32px -24px ${palette.glow}`,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (!suppressNavigation) {
            navigate(`/rooms/${room.id}`);
          }
        }}
      >
        {/* Gradient accent bar */}
        <div className="h-1.5 rounded-t-[22px]" style={{ background: palette.accent }} />

        {/* Gradient header area */}
        <div className="relative h-8 sm:h-10" style={{ background: palette.headerGradient }} />

        {/* Badges — overlapping gradient/white boundary */}
        <div className="relative px-3.5 sm:px-4" style={{ marginTop: '-10px', zIndex: 1 }}>
          <div className="flex min-h-6 flex-wrap items-center gap-1.5">
            {courseLabel && (
              <Badge
                variant="secondary"
                className="max-w-[9rem] truncate rounded-full border-0 bg-white/90 px-2 py-0.5 text-[11px] text-foreground shadow-sm sm:max-w-[11rem] sm:text-xs"
              >
                {courseLabel}
              </Badge>
            )}
            {isOwner && (
              <Badge
                variant="outline"
                className="gap-1 rounded-full border-0 bg-white/90 px-2 py-0.5 text-[11px] text-foreground shadow-sm sm:text-xs"
              >
                <Crown className="h-3 w-3" />
                Owner
              </Badge>
            )}
          </div>
        </div>

        {/* Top section: title + description */}
        <div className="flex-1 px-3.5 pb-0 pt-2 sm:px-4">
          {/* Title — single line, truncated */}
          <h3 className="truncate text-[15px] font-bold leading-snug sm:text-sm">
            {room.name}
          </h3>

          {/* Description — single line */}
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {room.description || '\u00A0'}
          </p>
        </div>

        {/* Footer — pinned to bottom */}
        <div className="px-3.5 pb-3.5 pt-2 sm:px-4 sm:pb-4">
          <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: palette.divider }}>
            <div className="flex items-center gap-3 text-sm">
              <span
                className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:text-xs"
                style={{ backgroundColor: palette.pillBg, color: palette.pillText }}
              >
                <Users className="h-3.5 w-3.5" />
                {memberCount} {memberCount === 1 ? 'Member' : 'Members'}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className={`h-8 gap-1.5 rounded-xl px-2.5 text-[11px] opacity-100 transition-opacity sm:h-7 sm:text-xs sm:opacity-50 hover:opacity-100 ${
                  isOwner
                    ? 'text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700'
                    : 'text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700'
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmOpen(true);
                }}
              >
                {isOwner ? (
                  <><Trash2 className="h-3.5 w-3.5" />Delete</>
                ) : (
                  <><LogOut className="h-3.5 w-3.5" />Leave</>
                )}
              </Button>
              <ArrowRight className="hidden h-4 w-4 text-muted-foreground transition-transform duration-200 sm:block" style={{ transform: hovered ? 'translateX(2px)' : 'none' }} />
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isOwner ? 'Delete Room' : 'Leave Room'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isOwner ? (
                <>Are you sure you want to delete <strong>{room.name}</strong>? This will permanently remove all messages, files, events, and tasks. This action cannot be undone.</>
              ) : (
                <>Are you sure you want to leave <strong>{room.name}</strong>? You will lose access to all messages and files. You can rejoin later with an invite code.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleAction();
              }}
              className={isOwner ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-orange-600 hover:bg-orange-700 text-white'}
              disabled={loading}
            >
              {loading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{isOwner ? 'Deleting...' : 'Leaving...'}</>
              ) : (
                isOwner ? 'Yes, Delete Room' : 'Yes, Leave Room'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
