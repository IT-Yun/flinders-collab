import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2 } from 'lucide-react';
import { createRoom } from '@/services/rooms';

export default function CreateRoomDialog({ onCreateStart, onCreated, onCreateError }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const tempRoomId = `temp-room-${Date.now()}`;

    try {
      onCreateStart?.({
        id: tempRoomId,
        name: name.trim(),
        course_name: courseCode.trim() || null,
        description: description.trim() || null,
        member_count: 1,
        my_role: 'owner',
      });

      const room = await createRoom({
        name: name.trim(),
        course_name: courseCode.trim() || null,
        description: description.trim(),
      });

      setOpen(false);
      setName('');
      setCourseCode('');
      setDescription('');
      onCreated?.(room, tempRoomId);
    } catch (err) {
      onCreateError?.(tempRoomId);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-white text-indigo-700 hover:bg-white/90 shadow-md">
          <Plus className="mr-2 h-4 w-4" />
          Create Room
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a New Room</DialogTitle>
          <DialogDescription>Set up a collaboration room for your team.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Room Name</label>
            <Input placeholder="e.g. Software Engineering, Data Science" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Course Code (optional)</label>
            <Input placeholder="e.g. COMP9721" value={courseCode} onChange={(e) => setCourseCode(e.target.value)} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Description (optional)</label>
            <Textarea placeholder="What is this room for?" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Room
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
