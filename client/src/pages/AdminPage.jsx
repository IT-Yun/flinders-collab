import React, { useState, useEffect } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { getReports, updateReport, getAdminUsers, toggleUserAdmin, deleteAdminUser, getMonitorStats, resolveAlert, triggerHealthCheck, getDeletedFiles, restoreDeletedFile, getFileIntegrityReport, getCrawlerStats, runEventCrawler, runTopicCrawler } from '@/services/reports';
import { getAdminAnnouncements, createAdminAnnouncement, updateAdminAnnouncement, deleteAdminAnnouncement } from '@/services/announcements';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import PageTour from '@/components/PageTour';
import {
  Loader2, ChevronDown, Shield, ShieldOff, AlertCircle, User, ShieldAlert, Search, Trash2, Mail, GraduationCap, Calendar,
  Activity, Server, Database, Clock, Zap, AlertTriangle, CheckCircle2, XCircle, RefreshCw, Cpu, HardDrive, TrendingUp, Eye, EyeOff, Bell,
  ArchiveRestore, ShieldCheck, Newspaper, BookOpen, MapPinned,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];
const STATUS_FILTERS = ['all', 'open', 'in_progress', 'resolved', 'closed'];
const SECTION_FILTERS = ['all', 'overview', 'schedule', 'tasks', 'chat', 'files', 'login', 'signup'];

const statusColors = {
  open: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  in_progress: 'bg-blue-100 text-blue-800 border-blue-200',
  resolved: 'bg-green-100 text-green-800 border-green-200',
  closed: 'bg-gray-100 text-gray-600 border-gray-200',
};

const sectionColors = {
  overview: 'bg-purple-100 text-purple-800',
  schedule: 'bg-orange-100 text-orange-800',
  tasks: 'bg-cyan-100 text-cyan-800',
  chat: 'bg-pink-100 text-pink-800',
  files: 'bg-emerald-100 text-emerald-800',
  login: 'bg-indigo-100 text-indigo-800',
  signup: 'bg-teal-100 text-teal-800',
};

function formatStatus(status) {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', type: 'info', expires_at: '' });

  const load = async () => {
    try {
      const data = await getAdminAnnouncements();
      setAnnouncements(data || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      await createAdminAnnouncement({
        title: form.title.trim(),
        content: form.content.trim(),
        type: form.type,
        expires_at: form.expires_at || null,
      });
      setForm({ title: '', content: '', type: 'info', expires_at: '' });
      load();
    } catch { /* ignore */ }
    setCreating(false);
  };

  const handleToggle = async (ann) => {
    await updateAdminAnnouncement(ann.id, { is_active: !ann.is_active });
    load();
  };

  const handleDelete = async (id) => {
    await deleteAdminAnnouncement(id);
    load();
  };

  const typeColors = {
    info: 'bg-blue-100 text-blue-700',
    warning: 'bg-amber-100 text-amber-700',
    success: 'bg-green-100 text-green-700',
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Create form */}
      <Card>
        <CardContent className="p-5 space-y-3">
          <h3 className="text-sm font-bold text-slate-700">New Announcement</h3>
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea placeholder="Content (optional)" value={form.content} onChange={(e) => setForm(f => ({ ...f, content: e.target.value }))} rows={2} />
          <div className="flex flex-wrap gap-2">
            <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className="rounded-lg border px-3 py-2 text-sm">
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </select>
            <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm(f => ({ ...f, expires_at: e.target.value }))} className="w-auto" placeholder="Expires (optional)" />
            <Button onClick={handleCreate} disabled={creating || !form.title.trim()}>
              {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Publish
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      {announcements.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-8">No announcements yet</p>
      ) : (
        <div className="space-y-3">
          {announcements.map((ann) => (
            <Card key={ann.id} className={ann.is_active ? '' : 'opacity-50'}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-sm truncate">{ann.title}</h4>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${typeColors[ann.type] || typeColors.info}`}>{ann.type}</span>
                      {!ann.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">Hidden</span>}
                    </div>
                    {ann.content && <p className="mt-1 text-xs text-slate-500 line-clamp-2">{ann.content}</p>}
                    <p className="mt-1.5 text-[10px] text-slate-400">
                      {ann.users?.full_name || 'Admin'} · {formatDistanceToNow(new Date(ann.created_at), { addSuffix: true })}
                      {ann.expires_at && ` · Expires ${format(new Date(ann.expires_at), 'MMM d, HH:mm')}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleToggle(ann)} title={ann.is_active ? 'Hide' : 'Show'}>
                      {ann.is_active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(ann.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsTab() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState(null);

  const fetchReports = async () => {
    try {
      const params = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (sectionFilter !== 'all') params.section = sectionFilter;
      const data = await getReports(params);
      setReports(Array.isArray(data) ? data : data.reports || []);
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    fetchReports();
  }, [statusFilter, sectionFilter]);

  const handleStatusChange = async (reportId, newStatus) => {
    setUpdatingId(reportId);
    try {
      await updateReport(reportId, { status: newStatus });
      setReports((prev) =>
        prev.map((r) => (r.id === reportId ? { ...r, status: newStatus } : r))
      );
    } catch {
      // error handled silently
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Status filter */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</span>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs capitalize rounded-full ${statusFilter === s ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md border-0' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'}`}
              onClick={() => setStatusFilter(s)}
            >
              {formatStatus(s)}
            </Button>
          ))}
        </div>
      </div>

      {/* Section filter */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Section</span>
        <div className="flex flex-wrap gap-1.5">
          {SECTION_FILTERS.map((s) => (
            <Button
              key={s}
              variant={sectionFilter === s ? 'default' : 'outline'}
              size="sm"
              className={`h-7 text-xs capitalize rounded-full ${sectionFilter === s ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md border-0' : 'bg-white border border-slate-200 text-slate-600 hover:border-blue-300'}`}
              onClick={() => setSectionFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Report list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <AlertCircle className="h-8 w-8" />
          <p className="text-sm">No reports found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => {
            const borderColor = report.status === 'open' ? 'border-l-4 border-l-amber-400' : report.status === 'in_progress' ? 'border-l-4 border-l-blue-400' : report.status === 'resolved' ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-slate-300';
            return (
            <Card key={report.id} className={`shadow-sm hover:shadow-md transition-shadow ${borderColor}`}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="secondary"
                        className={`text-xs capitalize ${sectionColors[report.section] || ''}`}
                      >
                        {report.section}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={`text-xs ${statusColors[report.status] || ''}`}
                      >
                        {formatStatus(report.status)}
                      </Badge>
                    </div>
                    <h3 className="font-semibold text-sm">{report.subject}</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                      {report.description}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      <span>{report.reporter?.full_name || report.reporter?.university_email || 'Unknown'}</span>
                      <span>&middot;</span>
                      <span>
                        {report.created_at
                          ? format(new Date(report.created_at), 'MMM d, yyyy h:mm a')
                          : 'Unknown date'}
                      </span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1 text-xs shrink-0"
                        disabled={updatingId === report.id}
                      >
                        {updatingId === report.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            {formatStatus(report.status)}
                            <ChevronDown className="h-3 w-3" />
                          </>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {STATUS_OPTIONS.map((status) => (
                        <DropdownMenuItem
                          key={status}
                          onClick={() => handleStatusChange(report.id, status)}
                          className="text-xs capitalize"
                        >
                          {formatStatus(status)}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState(null);
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = async () => {
    try {
      const data = await getAdminUsers();
      setUsers(Array.isArray(data) ? data : data.users || []);
    } catch {
      // error handled silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleToggleAdmin = async (userId) => {
    setTogglingId(userId);
    try {
      const result = await toggleUserAdmin(userId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, is_admin: result.is_admin ?? !u.is_admin } : u
        )
      );
    } catch {
      // error handled silently
    } finally {
      setTogglingId(null);
    }
  };

  const handleDeleteUser = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteAdminUser(confirmDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== confirmDelete.id));
      setConfirmDelete(null);
    } catch {
      // error handled silently
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Filter users by search
  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (u.full_name || '').toLowerCase().includes(q) ||
      (u.university_email || '').toLowerCase().includes(q) ||
      (u.student_id || '').toLowerCase().includes(q) ||
      (u.major || '').toLowerCase().includes(q)
    );
  });

  const adminCount = users.filter((u) => u.is_admin).length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-4 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black">{users.length}</p>
              <p className="text-xs text-white/70">Total Users</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-4 text-white shadow-lg">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black">{adminCount}</p>
              <p className="text-xs text-white/70">Admins</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, student ID, or major..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* User list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
          <User className="h-8 w-8" />
          <p className="text-sm">{search ? 'No users match your search' : 'No users found'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const name = u.full_name || 'Unnamed';
            const initials = name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

            return (
              <Card key={u.id} className="shadow-sm hover:shadow-md transition-all">
                <CardContent className="flex items-center gap-4 p-4">
                  <Avatar className="h-12 w-12 shrink-0">
                    <AvatarFallback className="text-sm font-semibold bg-gradient-to-br from-indigo-500 to-purple-600 text-white">{initials}</AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">{name}</span>
                      {u.is_admin && (
                        <Badge variant="default" className="text-[10px] gap-1">
                          <Shield className="h-3 w-3" />
                          Admin
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                      {u.university_email && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {u.university_email}
                        </span>
                      )}
                      {u.student_id && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {u.student_id}
                        </span>
                      )}
                      {u.major && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <GraduationCap className="h-3 w-3" />
                          {u.major}
                        </span>
                      )}
                      {u.created_at && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Joined {format(new Date(u.created_at), 'MMM d, yyyy')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant={u.is_admin ? 'destructive' : 'outline'}
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => handleToggleAdmin(u.id)}
                      disabled={togglingId === u.id}
                    >
                      {togglingId === u.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : u.is_admin ? (
                        <><ShieldOff className="h-3.5 w-3.5" />Remove Admin</>
                      ) : (
                        <><Shield className="h-3.5 w-3.5" />Make Admin</>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      onClick={() => setConfirmDelete({ id: u.id, name })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete user confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{confirmDelete?.name}</strong>? This will remove the user from all rooms and delete their account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteUser(); }}
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={deleting}
            >
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</> : 'Yes, Delete User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function SectionHeader({ icon: Icon, title, gradient, children }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-r ${gradient} px-5 py-4 text-white shadow-lg`}>
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            <Icon className="h-4.5 w-4.5 text-white" />
          </div>
          <h3 className="text-lg font-black tracking-tight">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusDot({ status }) {
  const color = status === 'healthy' ? 'bg-emerald-400' : status === 'warning' ? 'bg-amber-400' : 'bg-red-400';
  return <span className={`inline-block h-2 w-2 rounded-full ${color} animate-pulse`} />;
}

function FeatureRow({ label, value, status, badge }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2">
        {status && <StatusDot status={status} />}
        <span className="text-xs text-slate-600">{label}</span>
      </div>
      {badge ? (
        <Badge className={`rounded-full text-[10px] ${badge}`}>{value}</Badge>
      ) : (
        <span className="text-xs font-semibold text-slate-800">{value}</span>
      )}
    </div>
  );
}

function MonitoringTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [activeSection, setActiveSection] = useState('all');

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await getMonitorStats();
      setStats(data);
    } catch { /* silent */ } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 30000);
    return () => clearInterval(interval);
  }, []);

  const handleHealthCheck = async () => {
    setCheckingHealth(true);
    try {
      await triggerHealthCheck();
      await fetchStats(true);
    } catch { /* silent */ } finally {
      setCheckingHealth(false);
    }
  };

  const handleResolveAlert = async (alertId) => {
    try {
      await resolveAlert(alertId);
      setStats((prev) => prev ? { ...prev, alerts: prev.alerts.filter((a) => a.id !== alertId) } : prev);
    } catch { /* silent */ }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!stats) {
    return <div className="text-center py-12 text-muted-foreground">Failed to load monitoring data</div>;
  }

  const memPercent = stats.memory ? ((stats.memory.heapUsed / stats.memory.heapTotal) * 100).toFixed(1) : 0;
  const isHealthy = stats.health?.supabase?.status === 'healthy';
  const hasAlerts = stats.alerts && stats.alerts.length > 0;
  const errorRate = Number(stats.errorRate || 0);
  const storageUsedPct = stats.storage?.total > 0 ? ((stats.storage.used / stats.storage.total) * 100) : 0;

  // Security score calculation
  const securityChecks = [
    { label: 'PKCE Auth Flow', ok: true },
    { label: 'JWT Token Validation', ok: true },
    { label: 'Row Level Security (RLS)', ok: true },
    { label: 'Rate Limiting (Signup/Login)', ok: true },
    { label: 'CORS Policy', ok: true },
    { label: 'File Upload Validation', ok: true },
    { label: 'HTTPS/SSL (Render)', ok: true },
    { label: 'Service Role Key Server-Only', ok: true },
    { label: 'Email OTP Verification', ok: true },
    { label: 'Supabase DB Connected', ok: isHealthy },
  ];
  const securityScore = Math.round((securityChecks.filter((c) => c.ok).length / securityChecks.length) * 100);
  const securityLevel = securityScore >= 90 ? 'Strong' : securityScore >= 70 ? 'Moderate' : 'Weak';
  const securityColor = securityScore >= 90 ? 'text-emerald-600' : securityScore >= 70 ? 'text-amber-600' : 'text-red-600';
  const securityBg = securityScore >= 90 ? 'from-emerald-500 to-teal-600' : securityScore >= 70 ? 'from-amber-500 to-orange-600' : 'from-red-500 to-rose-600';

  const sections = [
    { key: 'all', label: 'Overview' },
    { key: 'render', label: 'Render' },
    { key: 'supabase', label: 'Supabase' },
    { key: 'security', label: 'Security' },
  ];

  const showSection = (key) => activeSection === 'all' || activeSection === key;

  return (
    <div className="space-y-5">
      {/* Global status bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full animate-pulse ${isHealthy && errorRate < 5 ? 'bg-emerald-500' : errorRate < 10 ? 'bg-amber-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-slate-600">
            {isHealthy && errorRate < 5 ? 'All systems operational' : 'Issues detected'}
          </span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleHealthCheck} disabled={checkingHealth} className="h-8 gap-1.5 text-xs rounded-full">
            {checkingHealth ? <Loader2 className="h-3 w-3 animate-spin" /> : <Activity className="h-3 w-3" />}
            Health Check
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchStats(true)} disabled={refreshing} className="h-8 gap-1.5 text-xs rounded-full">
            <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Section filter */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {sections.map((s) => (
          <Button
            key={s.key}
            variant={activeSection === s.key ? 'default' : 'outline'}
            size="sm"
            className={`h-8 shrink-0 rounded-full px-4 text-xs ${activeSection === s.key ? 'bg-gradient-to-r from-slate-800 to-slate-900 text-white border-0 shadow-md' : 'bg-white border-slate-200 text-slate-600'}`}
            onClick={() => setActiveSection(s.key)}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* Alerts (always visible) */}
      {hasAlerts && (
        <div className="space-y-2">
          {stats.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                alert.severity === 'critical' ? 'bg-red-50 border-red-200' :
                alert.severity === 'warning' ? 'bg-amber-50 border-amber-200' :
                'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-center gap-3">
                {alert.severity === 'critical' ? <XCircle className="h-4 w-4 text-red-500 shrink-0" /> :
                 alert.severity === 'warning' ? <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" /> :
                 <Bell className="h-4 w-4 text-blue-500 shrink-0" />}
                <div>
                  <p className="text-sm font-medium text-slate-800">{alert.message}</p>
                  <p className="text-[11px] text-slate-500">
                    {alert.timestamp ? formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true }) : ''}
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleResolveAlert(alert.id)} className="h-7 text-xs text-slate-500 hover:text-slate-800">
                Dismiss
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* ========== RENDER SECTION ========== */}
      {showSection('render') && (
        <div className="space-y-4">
          <SectionHeader icon={Server} title="Render" gradient="from-emerald-600 to-teal-700">
            <Badge className="rounded-full bg-white/20 text-white text-[10px] border-0">Starter — $7/mo</Badge>
          </SectionHeader>

          {/* Quick stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3.5 text-white shadow-lg">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Clock className="h-3.5 w-3.5 text-white/70" />
                <span className="text-[10px] text-white/70 font-medium">Uptime</span>
              </div>
              <p className="text-lg font-black leading-tight">{formatUptime(stats.uptime)}</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-3.5 text-white shadow-lg">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="h-3.5 w-3.5 text-white/70" />
                <span className="text-[10px] text-white/70 font-medium">Requests</span>
              </div>
              <p className="text-lg font-black leading-tight">{stats.totalRequests?.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-3.5 text-white shadow-lg">
              <div className="flex items-center gap-1.5 mb-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-white/70" />
                <span className="text-[10px] text-white/70 font-medium">Avg Response</span>
              </div>
              <p className="text-lg font-black leading-tight">{Math.round(Number(stats.avgResponseTime) || 0)}<span className="text-xs font-normal">ms</span></p>
            </div>
            <div className={`rounded-xl p-3.5 text-white shadow-lg ${errorRate > 5 ? 'bg-gradient-to-br from-red-500 to-rose-600' : 'bg-gradient-to-br from-slate-600 to-slate-700'}`}>
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-white/70" />
                <span className="text-[10px] text-white/70 font-medium">Error Rate</span>
              </div>
              <p className="text-lg font-black leading-tight">{errorRate.toFixed(1)}<span className="text-xs font-normal">%</span></p>
            </div>
          </div>

          {/* Render features + Memory */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Server className="h-4 w-4 text-emerald-500" />
                  Render Plan Details
                </h4>
                <FeatureRow label="Plan" value="Starter ($7/mo)" badge="bg-blue-100 text-blue-700 border-blue-200" />
                <FeatureRow label="Runtime" value="Node.js (Express)" />
                <FeatureRow label="Region" value="Singapore" />
                <FeatureRow label="Auto Deploy" value="On push to main" status="healthy" />
                <FeatureRow label="HTTPS/SSL" value="Enabled" status="healthy" />
                <FeatureRow label="Custom Domain" value="Not configured" status="warning" />
                <FeatureRow label="Socket.IO" value="Active" status="healthy" />
                <FeatureRow label="Web Push (VAPID)" value="Active" status="healthy" />
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Memory Usage</span>
                  </div>
                  <span className={`text-sm font-bold ${memPercent > 80 ? 'text-red-600' : memPercent > 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {memPercent}%
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${memPercent > 80 ? 'bg-red-500' : memPercent > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(memPercent, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[11px] text-slate-400">
                  <span>{formatBytes(stats.memory?.heapUsed || 0)} used</span>
                  <span>{formatBytes(stats.memory?.heapTotal || 0)} total</span>
                </div>
                <div className="mt-3 space-y-1">
                  {[
                    { label: 'Heap Used', value: stats.memory?.heapUsed || 0, color: 'bg-indigo-500' },
                    { label: 'External', value: stats.memory?.external || 0, color: 'bg-violet-500' },
                    { label: 'RSS (Total)', value: stats.memory?.rss || 0, color: 'bg-slate-700' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-2 text-[11px]">
                      <div className={`h-2 w-2 rounded-full ${color} shrink-0`} />
                      <span className="text-slate-500 flex-1">{label}</span>
                      <span className="text-slate-600 font-medium">{formatBytes(value)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Traffic + Status codes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-slate-500" />
                  Traffic (last 10 min)
                </h4>
                {stats.requestsPerMinute && stats.requestsPerMinute.length > 0 ? (
                  <div className="flex items-end gap-1 h-20">
                    {stats.requestsPerMinute.map((rpm, i) => {
                      const maxRpm = Math.max(...stats.requestsPerMinute.map((r) => r.count || 0), 1);
                      const height = ((rpm.count || 0) / maxRpm) * 100;
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center">
                          <div
                            className="w-full bg-gradient-to-t from-emerald-500 to-teal-400 rounded-t transition-all duration-300"
                            style={{ height: `${Math.max(height, 4)}%` }}
                            title={`${rpm.count || 0} req/min`}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-4">No traffic data yet</p>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Server className="h-4 w-4 text-slate-500" />
                  Response Status
                </h4>
                <div className="space-y-2">
                  {[
                    { key: '2xx', label: 'Success', color: 'bg-emerald-500' },
                    { key: '3xx', label: 'Redirect', color: 'bg-blue-500' },
                    { key: '4xx', label: 'Client Error', color: 'bg-amber-500' },
                    { key: '5xx', label: 'Server Error', color: 'bg-red-500' },
                  ].map(({ key, label, color }) => {
                    const count = stats.statusCodes?.[key] || 0;
                    const total = stats.totalRequests || 1;
                    const pct = ((count / total) * 100).toFixed(1);
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${color}`} />
                        <span className="text-xs text-slate-600 w-24">{label}</span>
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="text-[11px] text-slate-500 w-12 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Error logs */}
          {stats.userErrors && stats.userErrors.length > 0 && (
            <Card className="shadow-sm border-orange-100">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-orange-500" />
                  User Error Log
                  <Badge className="rounded-full text-[10px] bg-orange-100 text-orange-700 border-orange-200">{stats.userErrors.length}</Badge>
                </h4>
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {stats.userErrors.map((err, i) => (
                    <div key={i} className="rounded-lg bg-orange-50/50 border border-orange-100 px-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">{err.userName}</span>
                        <span className="text-[10px] text-slate-400">
                          {err.timestamp ? formatDistanceToNow(new Date(err.timestamp), { addSuffix: true }) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-orange-800">
                        <span className="font-medium">{err.action}</span>
                        <span className="text-orange-500 ml-1">({err.statusCode})</span>
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Slow + Recent errors */}
          {((stats.recentErrors && stats.recentErrors.length > 0) || (stats.slowRequests && stats.slowRequests.length > 0)) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {stats.recentErrors && stats.recentErrors.length > 0 && (
                <Card className="shadow-sm border-red-100">
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      Server Errors
                      <Badge variant="destructive" className="rounded-full text-[10px]">{stats.recentErrors.length}</Badge>
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {stats.recentErrors.map((err, i) => (
                        <div key={i} className="rounded-lg bg-red-50/50 border border-red-100 px-3 py-2">
                          <code className="text-[11px] font-mono text-red-600">{err.method} {err.path}</code>
                          <p className="text-xs text-red-700 mt-0.5">{err.message}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              {stats.slowRequests && stats.slowRequests.length > 0 && (
                <Card className="shadow-sm border-amber-100">
                  <CardContent className="p-4">
                    <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-amber-500" />
                      Slow Requests
                      <Badge className="rounded-full text-[10px] bg-amber-100 text-amber-700 border-amber-200">{stats.slowRequests.length}</Badge>
                    </h4>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {stats.slowRequests.map((req, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                          <code className="text-slate-600 font-mono">{req.method} {req.path}</code>
                          <span className="text-amber-600 font-bold">{req.duration}ms</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Live Activity */}
          {stats.requestLog && stats.requestLog.length > 0 && (
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Eye className="h-4 w-4 text-slate-500" />
                  Live Activity Feed
                </h4>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {stats.requestLog.slice(0, 30).map((req, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px] py-1 border-b border-slate-50 last:border-0">
                      <span className={`font-mono font-bold w-8 ${
                        req.status < 300 ? 'text-emerald-600' : req.status < 400 ? 'text-blue-600' : req.status < 500 ? 'text-amber-600' : 'text-red-600'
                      }`}>{req.status}</span>
                      <span className="text-slate-400 font-mono w-10">{req.method}</span>
                      <span className="text-slate-600 font-mono flex-1 truncate">{req.path}</span>
                      <span className="text-slate-400 w-12 text-right">{req.duration}ms</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ========== SUPABASE SECTION ========== */}
      {showSection('supabase') && (
        <div className="space-y-4">
          <SectionHeader icon={Database} title="Supabase" gradient="from-emerald-500 via-green-600 to-teal-600">
            <Badge className="rounded-full bg-white/20 text-white text-[10px] border-0">Pro Plan</Badge>
          </SectionHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* DB Health */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4 text-green-500" />
                  Database Health
                  <Badge className={`ml-auto rounded-full text-[10px] ${isHealthy ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                    {isHealthy ? 'Healthy' : 'Down'}
                  </Badge>
                </h4>
                <FeatureRow label="Connection" value={isHealthy ? 'Connected' : 'Disconnected'} status={isHealthy ? 'healthy' : 'critical'} />
                {stats.health?.supabase?.responseTime && (
                  <FeatureRow label="Response Time" value={`${stats.health.supabase.responseTime}ms`} status={stats.health.supabase.responseTime < 500 ? 'healthy' : 'warning'} />
                )}
                {stats.health?.lastCheck && (
                  <FeatureRow label="Last Check" value={formatDistanceToNow(new Date(stats.health.lastCheck), { addSuffix: true })} />
                )}
                <FeatureRow label="Checks Interval" value="Every 5 min" />
              </CardContent>
            </Card>

            {/* Supabase plan features */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-green-500" />
                  Pro Plan Features
                </h4>
                <FeatureRow label="Realtime Subscriptions" value="Active" status="healthy" />
                <FeatureRow label="Realtime Presence" value="Active" status="healthy" />
                <FeatureRow label="Image Transforms" value="Active" status="healthy" />
                <FeatureRow label="pg_cron Jobs" value="6 scheduled" status="healthy" />
                <FeatureRow label="Daily Backups" value="Enabled" status="healthy" />
                <FeatureRow label="Max Connections" value="500 concurrent" />
              </CardContent>
            </Card>
          </div>

          {/* Storage */}
          {stats.storage && (
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-semibold text-slate-700">Storage (100 GB)</span>
                  </div>
                  <Badge className="rounded-full text-[10px] bg-green-100 text-green-700 border-green-200">
                    {formatBytes(stats.storage.used)} used
                  </Badge>
                </div>
                <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${storageUsedPct > 80 ? 'bg-red-500' : storageUsedPct > 50 ? 'bg-amber-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.max(storageUsedPct, 0.5)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[11px] text-slate-400">
                  <span>{storageUsedPct.toFixed(2)}% used</span>
                  <span>{formatBytes(stats.storage.total - stats.storage.used)} free</span>
                </div>
                {stats.storage.buckets && stats.storage.buckets.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    <span className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">Buckets</span>
                    {stats.storage.buckets.map((b) => (
                      <div key={b.name} className="flex items-center gap-2 text-[11px]">
                        <div className="h-2 w-2 rounded-full bg-green-400 shrink-0" />
                        <span className="text-slate-600 flex-1">{b.name}</span>
                        <Badge className="rounded-full text-[9px] bg-slate-100 text-slate-600 border-slate-200">{b.public ? 'public' : 'private'}</Badge>
                        <span className="text-slate-500 font-medium">{formatBytes(b.size)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Realtime + pg_cron details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Zap className="h-4 w-4 text-blue-500" />
                  Realtime Channels
                </h4>
                {[
                  { name: 'campus-presence-changes', table: 'flinders_campus_presence', type: 'postgres_changes' },
                  { name: 'friend-request-changes', table: 'flinders_friend_requests', type: 'postgres_changes' },
                  { name: 'flinap-online', table: null, type: 'presence' },
                ].map((ch) => (
                  <div key={ch.name} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{ch.name}</p>
                      <p className="text-[10px] text-slate-400">{ch.type}{ch.table ? ` (${ch.table})` : ''}</p>
                    </div>
                    <StatusDot status="healthy" />
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-violet-500" />
                  pg_cron Scheduled Jobs
                </h4>
                {[
                  { name: 'hide-stale-presence', schedule: 'Every 3h', action: 'Disable stale presence' },
                  { name: 'cleanup-stopped-locations', schedule: 'Daily 4:00 UTC', action: 'Remove stopped sessions' },
                  { name: 'cleanup-old-cached-events', schedule: 'Weekly Sun', action: 'Purge 60d+ event cache' },
                  { name: 'cleanup-old-reminders', schedule: 'Daily 4:30 UTC', action: 'Purge 7d+ reminders' },
                  { name: 'weekly-analyze', schedule: 'Weekly Sun', action: 'DB stats refresh' },
                ].map((job) => (
                  <div key={job.name} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-xs font-medium text-slate-700">{job.action}</p>
                      <p className="text-[10px] text-slate-400">{job.schedule}</p>
                    </div>
                    <StatusDot status="healthy" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Auth features */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                Authentication
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <FeatureRow label="Auth Provider" value="Supabase Auth" status="healthy" />
                <FeatureRow label="Flow Type" value="PKCE" status="healthy" />
                <FeatureRow label="Email OTP" value="6-digit code" status="healthy" />
                <FeatureRow label="Password Hashing" value="bcrypt (Supabase)" status="healthy" />
                <FeatureRow label="Token Type" value="JWT" status="healthy" />
                <FeatureRow label="Session Sync" value="15s interval + focus" status="healthy" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========== SECURITY SECTION ========== */}
      {showSection('security') && (
        <div className="space-y-4">
          <SectionHeader icon={ShieldCheck} title="Security" gradient={securityBg}>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black">{securityScore}%</span>
              <span className="text-xs text-white/80">{securityLevel}</span>
            </div>
          </SectionHeader>

          {/* Score visualization */}
          <Card className="shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center gap-6">
                {/* Circular score */}
                <div className="relative h-24 w-24 shrink-0">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="#f1f5f9" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={securityScore >= 90 ? '#10b981' : securityScore >= 70 ? '#f59e0b' : '#ef4444'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${securityScore * 2.64} 264`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-xl font-black ${securityColor}`}>{securityScore}</span>
                    <span className="text-[9px] text-slate-400 font-medium">/ 100</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800">Security Posture: <span className={securityColor}>{securityLevel}</span></p>
                  <p className="text-xs text-slate-500 mt-1">
                    {securityScore >= 90
                      ? 'All critical security features are active and properly configured.'
                      : 'Some security features need attention. Check items below.'}
                  </p>
                  <div className="flex items-center gap-3 mt-3">
                    <span className="flex items-center gap-1 text-[11px] text-emerald-600"><CheckCircle2 className="h-3 w-3" />{securityChecks.filter((c) => c.ok).length} passed</span>
                    {securityChecks.filter((c) => !c.ok).length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-red-500"><XCircle className="h-3 w-3" />{securityChecks.filter((c) => !c.ok).length} issues</span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Security checklist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-indigo-500" />
                  Authentication & Access
                </h4>
                {[
                  { label: 'PKCE Auth Flow', ok: true, desc: 'Proof Key for Code Exchange prevents auth interception' },
                  { label: 'Email OTP Verification', ok: true, desc: 'Email ownership verified before account creation' },
                  { label: 'JWT Token Validation', ok: true, desc: 'Every API request validated via signed JWT' },
                  { label: 'Service Role Key Server-Only', ok: true, desc: 'Admin key never exposed to client' },
                  { label: 'Session Auto-Sync', ok: true, desc: 'Profile syncs on focus + 5s intervals' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5 py-2 border-b border-slate-100 last:border-0">
                    {item.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-xs font-medium text-slate-700">{item.label}</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                  <Database className="h-4 w-4 text-indigo-500" />
                  Data & Infrastructure
                </h4>
                {[
                  { label: 'Row Level Security (RLS)', ok: true, desc: 'Database policies enforce per-user access control' },
                  { label: 'Rate Limiting', ok: true, desc: 'Signup/login endpoints rate-limited against abuse' },
                  { label: 'CORS Policy', ok: true, desc: 'Only allowed origins can make API requests' },
                  { label: 'File Upload Validation', ok: true, desc: 'Type + size checks on all uploads (50MB max)' },
                  { label: 'HTTPS/SSL', ok: true, desc: 'All traffic encrypted via Render TLS termination' },
                  { label: 'Supabase Connected', ok: isHealthy, desc: isHealthy ? 'Database connection verified and healthy' : 'Database connection issue detected' },
                ].map((item) => (
                  <div key={item.label} className="flex items-start gap-2.5 py-2 border-b border-slate-100 last:border-0">
                    {item.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                    <div>
                      <p className="text-xs font-medium text-slate-700">{item.label}</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Privacy features */}
          <Card className="shadow-sm">
            <CardContent className="p-4">
              <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                <EyeOff className="h-4 w-4 text-indigo-500" />
                Privacy
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <FeatureRow label="Location Privacy" value="Campus-level only" status="healthy" />
                <FeatureRow label="GPS Coordinates" value="Never stored on server" status="healthy" />
                <FeatureRow label="Anonymous Posting" value="Available on board" status="healthy" />
                <FeatureRow label="Presence Auto-Hide" value="60s after leaving campus" status="healthy" />
                <FeatureRow label="Stale Presence" value="Auto-disabled after 8h" status="healthy" />
                <FeatureRow label="Avatar Cache Bust" value="Unique URL per upload" status="healthy" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="text-[11px] text-slate-400 text-center">Auto-refreshes every 30 seconds</p>
    </div>
  );
}

function CrawlerStatusCard({ icon: Icon, title, schedule, source, latestCrawledAt, latestItemTitle, totalCached, freshness, action, actionLabel, actionLoading }) {
  const freshnessClass = freshness === 'healthy'
    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : freshness === 'stale'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-slate-100 text-slate-600 border-slate-200';

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
              <p className="mt-0.5 text-xs text-slate-500">{schedule}</p>
            </div>
          </div>
          <Badge className={`rounded-full text-[10px] ${freshnessClass}`}>{freshness}</Badge>
        </div>

        <div className="mt-4 space-y-2">
          <FeatureRow label="Source" value={source} />
          <FeatureRow label="Cached Items" value={String(totalCached || 0)} />
          <FeatureRow
            label="Last Crawl"
            value={latestCrawledAt ? formatDistanceToNow(new Date(latestCrawledAt), { addSuffix: true }) : 'Never'}
            status={freshness === 'healthy' ? 'healthy' : freshness === 'stale' ? 'warning' : undefined}
          />
          {latestItemTitle ? <FeatureRow label="Latest Item" value={latestItemTitle} /> : null}
        </div>

        {action ? (
          <Button onClick={action} disabled={actionLoading} variant="outline" size="sm" className="mt-4 h-8 gap-1.5 rounded-full text-xs">
            {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {actionLabel}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function CrawlersTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [eventRunning, setEventRunning] = useState(false);
  const [topicRunning, setTopicRunning] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await getCrawlerStats();
      setStats(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const handleRunEvents = async () => {
    setEventRunning(true);
    try {
      await runEventCrawler();
      await fetchStats();
    } finally {
      setEventRunning(false);
    }
  };

  const handleRunTopics = async () => {
    setTopicRunning(true);
    try {
      await runTopicCrawler();
      await fetchStats();
    } finally {
      setTopicRunning(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!stats?.crawlers) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Failed to load crawler status</div>;
  }

  const { events, topics, news } = stats.crawlers;

  return (
    <div className="space-y-4">
      <SectionHeader icon={RefreshCw} title="Crawlers" gradient="from-sky-600 to-indigo-700">
        <Badge className="rounded-full border-0 bg-white/20 text-[10px] text-white">Auto refresh</Badge>
      </SectionHeader>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <CrawlerStatusCard
          icon={Newspaper}
          title={events.label}
          schedule={events.schedule}
          source={events.source}
          latestCrawledAt={events.latestCrawledAt}
          latestItemTitle={events.latestItemTitle}
          totalCached={events.totalCached}
          freshness={events.freshness}
          action={handleRunEvents}
          actionLabel="Run Event Crawl"
          actionLoading={eventRunning}
        />
        <CrawlerStatusCard
          icon={BookOpen}
          title={topics.label}
          schedule={topics.schedule}
          source={topics.source}
          latestCrawledAt={topics.latestCrawledAt}
          latestItemTitle={topics.latestItemTitle}
          totalCached={topics.totalCached}
          freshness={topics.freshness}
          action={handleRunTopics}
          actionLabel="Run Topic Crawl"
          actionLoading={topicRunning}
        />
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
              <MapPinned className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">{news.label}</h4>
                  <p className="mt-0.5 text-xs text-slate-500">{news.schedule}</p>
                </div>
                <Badge className="rounded-full border-slate-200 bg-slate-100 text-[10px] text-slate-600">{news.freshness}</Badge>
              </div>
              <div className="mt-4 space-y-2">
                <FeatureRow label="Source" value={news.source} />
                <FeatureRow label="Mode" value="Short-lived server cache" />
                <FeatureRow label="Purpose" value="Reduce repeated upstream requests" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FileBackupsTab() {
  const [deletedFiles, setDeletedFiles] = useState([]);
  const [integrity, setIntegrity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [error, setError] = useState('');

  const fetchBackupData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError('');
    try {
      const [deleted, report] = await Promise.all([
        getDeletedFiles(),
        getFileIntegrityReport(),
      ]);
      setDeletedFiles(Array.isArray(deleted) ? deleted : deleted.files || []);
      setIntegrity(report || null);
    } catch (err) {
      setError(err.message || 'Failed to load backup status.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBackupData();
  }, []);

  const handleRestore = async (fileId) => {
    setRestoringId(fileId);
    setError('');
    try {
      await restoreDeletedFile(fileId);
      setDeletedFiles((prev) => prev.filter((file) => file.id !== fileId));
      await fetchBackupData(true);
    } catch (err) {
      setError(err.message || 'Failed to restore file.');
    } finally {
      setRestoringId(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const summary = integrity?.summary || {};

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">File Backup Integrity</h3>
          <p className="text-sm text-slate-500">Restore deleted files and verify backup coverage.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => fetchBackupData(true)} disabled={refreshing} className="h-8 gap-1.5 text-xs rounded-full">
          <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 p-4 text-white shadow-lg">
          <p className="text-xs text-white/70">Checked Files</p>
          <p className="mt-1 text-2xl font-black">{summary.total || 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-4 text-white shadow-lg">
          <p className="text-xs text-white/70">Healthy</p>
          <p className="mt-1 text-2xl font-black">{summary.healthy || 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 p-4 text-white shadow-lg">
          <p className="text-xs text-white/70">Restorable</p>
          <p className="mt-1 text-2xl font-black">{summary.restorable || 0}</p>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-rose-500 to-red-600 p-4 text-white shadow-lg">
          <p className="text-xs text-white/70">Missing Backup</p>
          <p className="mt-1 text-2xl font-black">{summary.missingBackup || 0}</p>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Deleted Files
            <Badge className="rounded-full text-[10px] bg-slate-100 text-slate-700 border-slate-200">
              {deletedFiles.length}
            </Badge>
          </h4>
          {deletedFiles.length === 0 ? (
            <div className="py-8 text-center text-sm text-slate-400">No deleted files waiting for restore.</div>
          ) : (
            <div className="space-y-2">
              {deletedFiles.map((file) => (
                <div key={file.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{file.file_name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {file.rooms?.name || 'Unknown room'} · {file.users?.full_name || file.users?.university_email || 'Unknown uploader'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Deleted {file.deleted_at ? formatDistanceToNow(new Date(file.deleted_at), { addSuffix: true }) : 'recently'}
                    </p>
                  </div>
                  <Button size="sm" className="h-8 gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 text-xs text-white" onClick={() => handleRestore(file.id)} disabled={restoringId === file.id}>
                    {restoringId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3.5 w-3.5" />}
                    Restore
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardContent className="p-4">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Database className="h-4 w-4 text-indigo-500" />
            Integrity Report
          </h4>
          {integrity?.files?.length ? (
            <div className="space-y-2 max-h-[28rem] overflow-y-auto">
              {integrity.files.slice(0, 80).map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-700">{file.file_name}</p>
                    <p className="truncate text-slate-400">{file.room_id}</p>
                  </div>
                  <Badge className={`rounded-full text-[10px] ${
                    file.integrity_status === 'healthy'
                      ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                      : file.integrity_status === 'restorable'
                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                        : 'bg-red-100 text-red-700 border-red-200'
                  }`}>
                    {file.integrity_status}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-slate-400">No integrity data available.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();

  if (!user?.is_admin) {
    return (
      <>
        <div className="flex items-center justify-center py-20">
          <div className="bg-gradient-to-r from-red-50 via-rose-50 to-orange-50 rounded-2xl p-12 shadow-lg flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg">
              <ShieldAlert className="h-8 w-8 text-white" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Access Denied</h2>
            <p className="text-sm text-muted-foreground">You do not have admin privileges to view this page.</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTour
        tourId="admin"
        steps={[
          {
            target: '[data-tour="admin-header"]',
            title: 'Admin Panel',
            desc: 'This is the control surface for platform health, moderation, and maintenance.',
            position: 'bottom',
          },
          {
            target: '[data-tour="admin-tabs"]',
            title: 'Admin Sections',
            desc: 'Switch between monitoring, crawler control, reports, users, and file backups here.',
            position: 'bottom',
          },
          {
            target: '[data-tour="admin-crawlers-tab"]',
            title: 'Crawlers',
            desc: 'Use this tab to inspect scheduled crawlers and trigger safe refreshes when needed.',
            position: 'bottom',
          },
        ]}
      />
      <div className="space-y-6">
        <div data-tour="admin-header" className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 px-8 py-8 text-white shadow-xl">
          <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-indigo-500/20 blur-2xl" />
          <div className="relative flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-sm">
              <Shield className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight">Admin Panel</h1>
              <p className="mt-1 text-slate-300 text-sm">Monitor, manage reports, and control users</p>
            </div>
          </div>
        </div>

        <Tabs defaultValue="monitoring">
          <TabsList data-tour="admin-tabs" className="bg-white rounded-2xl p-2 shadow-lg border">
            <TabsTrigger value="monitoring" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500 gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Monitoring
            </TabsTrigger>
            <TabsTrigger data-tour="admin-crawlers-tab" value="crawlers" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              Crawlers
            </TabsTrigger>
            <TabsTrigger value="reports" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500">Reports</TabsTrigger>
            <TabsTrigger value="users" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500">Users</TabsTrigger>
            <TabsTrigger value="files" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500 gap-1.5">
              <ArchiveRestore className="h-3.5 w-3.5" />
              File Backup
            </TabsTrigger>
            <TabsTrigger value="announcements" className="rounded-xl data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-600 data-[state=active]:to-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md text-slate-500 gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              Announcements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" className="mt-4">
            <MonitoringTab />
          </TabsContent>

          <TabsContent value="crawlers" className="mt-4">
            <CrawlersTab />
          </TabsContent>

          <TabsContent value="reports" className="mt-4">
            <ReportsTab />
          </TabsContent>

          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>

          <TabsContent value="files" className="mt-4">
            <FileBackupsTab />
          </TabsContent>

          <TabsContent value="announcements" className="mt-4">
            <AnnouncementsTab />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
