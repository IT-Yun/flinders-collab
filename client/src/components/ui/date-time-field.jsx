import React from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

function FieldShell({ label, hint, icon: Icon, children, className }) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</label>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-white to-slate-50/80 p-2 shadow-sm shadow-slate-200/40">
        <div className="relative">
          <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          {children}
        </div>
      </div>
    </div>
  );
}

export function DateField({ label = 'Date', hint, className, inputClassName, ...props }) {
  return (
    <FieldShell label={label} hint={hint} icon={CalendarDays} className={className}>
      <Input
        type="date"
        lang="en"
        className={cn(
          'h-12 rounded-xl border-slate-200 bg-white pl-11 pr-3 text-[14px] font-medium text-slate-600 placeholder:text-slate-300 [color-scheme:light] sm:text-[15px]',
          inputClassName
        )}
        {...props}
      />
    </FieldShell>
  );
}

export function TimeField({ label, hint, className, inputClassName, ...props }) {
  return (
    <FieldShell label={label} hint={hint} icon={Clock3} className={className}>
      <Input
        type="time"
        lang="en"
        className={cn(
          'h-12 rounded-xl border-slate-200 bg-white pl-11 pr-3 text-[14px] font-medium text-slate-600 placeholder:text-slate-300 [color-scheme:light] sm:text-[15px]',
          inputClassName
        )}
        {...props}
      />
    </FieldShell>
  );
}
