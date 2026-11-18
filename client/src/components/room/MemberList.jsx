import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { avatarThumb } from '@/lib/avatar';

export default function MemberList({ members = [] }) {
  return (
    <div className="space-y-3">
      {members.map((member) => {
        const name = member.full_name || member.name || member.university_email || member.email || 'Unknown';
        const email = member.university_email || member.email;
        const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

        return (
          <div key={member.id || member.membership_id} className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar className="h-9 w-9">
              {member.avatar_url && <AvatarImage src={avatarThumb(member.avatar_url)} alt={name} className="object-cover" />}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{name}</p>
              {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
            </div>
            {member.role && (
              <Badge variant={member.role === 'admin' ? 'default' : 'outline'} className="shrink-0">
                {member.role}
              </Badge>
            )}
          </div>
        );
      })}
      {members.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No members found</p>
      )}
    </div>
  );
}
