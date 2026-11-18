import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserPlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { joinRoom } from '@/services/rooms';
import { useNavigate } from 'react-router-dom';

export default function JoinRoomDialog({ onJoined }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const getJoinErrorMessage = (err) => {
    if (err?.status === 404) {
      return 'This invite code is invalid or has expired. Check the code and try again.';
    }

    if (err?.status === 409) {
      return 'You already joined this room with this invite code.';
    }

    return err?.message || 'Failed to join room. Please try again.';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = inviteCode.trim().toUpperCase();
    if (!trimmed) {
      setError('Please enter an invite code.');
      return;
    }
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const result = await joinRoom(trimmed);
      const joinedRoom = result?.room;
      const roomName = joinedRoom?.name || 'the room';
      setSuccess(`Joined "${roomName}" successfully!`);
      setInviteCode('');
      onJoined?.(joinedRoom);
      // Auto-close after a brief moment so the user sees the success message
      setTimeout(() => {
        setOpen(false);
        setSuccess('');
        if (joinedRoom?.id) {
          navigate(`/rooms/${joinedRoom.id}`);
        }
      }, 1200);
    } catch (err) {
      if (err?.status === 409 && err?.room) {
        const joinedRoom = err.room;
        onJoined?.(joinedRoom);
        setSuccess(`You're already in "${joinedRoom.name || 'this room'}". Opening it now.`);
        setInviteCode('');
        setTimeout(() => {
          setOpen(false);
          setSuccess('');
          if (joinedRoom?.id) {
            navigate(`/rooms/${joinedRoom.id}`);
          }
        }, 900);
        return;
      }
      setError(getJoinErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen) => {
    setOpen(isOpen);
    if (!isOpen) {
      setError('');
      setSuccess('');
      setInviteCode('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          <UserPlus className="mr-2 h-4 w-4" />
          Join Room
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Join a Room</DialogTitle>
          <DialogDescription>Enter the invite code shared by your team. You only need the code, not a room ID.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="invite-code-input" className="text-sm font-medium">Invite Code</label>
            <Input
              id="invite-code-input"
              placeholder="e.g. Q7K9LM"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value);
                if (error) setError('');
              }}
              className="h-11 text-center text-base font-semibold uppercase tracking-[0.28em]"
              inputMode="text"
              maxLength={6}
              autoComplete="off"
              required
            />
            <p className="text-xs text-muted-foreground">
              Invite codes are usually 6 letters and numbers. We ignore lowercase and extra spaces.
            </p>
          </div>
          {error && (
            <p className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          {success && (
            <p className="flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700" role="status">
              <CheckCircle2 className="h-4 w-4" />
              {success}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading || !!success}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Join Room
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
