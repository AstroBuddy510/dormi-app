import { useState, useMemo } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  ShieldCheck, Filter, ChevronLeft, ChevronRight, X, Eye, User as UserIcon, Clock,
} from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function authHeaders(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const authStore = window.localStorage.getItem('grocerease-auth');
    if (!authStore) return {};
    const parsed = JSON.parse(authStore);
    const token = parsed?.state?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

function apiFetch<T = any>(path: string): Promise<T> {
  return fetch(`${BASE}/api${path}`, { headers: authHeaders() }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Request failed');
    return r.json();
  });
}

interface AuditEntry {
  id: number;
  userId: number | null;
  userRole: string | null;
  userName: string | null;
  userPhone: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  occurredAt: string;
}

interface AuditPage {
  total: number;
  limit: number;
  offset: number;
  entries: AuditEntry[];
}

const ACTION_BADGE: Record<string, string> = {
  login: 'bg-blue-100 text-blue-800',
  login_failure: 'bg-red-100 text-red-800',
  logout: 'bg-slate-100 text-slate-700',
  ledger_post: 'bg-emerald-100 text-emerald-800',
  period_lock: 'bg-amber-100 text-amber-800',
  period_unlock: 'bg-orange-100 text-orange-800',
};

const ENTITY_BADGE: Record<string, string> = {
  user: 'bg-blue-50 text-blue-700 border-blue-200',
  ledger_journal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  period_lock: 'bg-amber-50 text-amber-700 border-amber-200',
  order: 'bg-purple-50 text-purple-700 border-purple-200',
  expense: 'bg-rose-50 text-rose-700 border-rose-200',
  payout: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  payroll: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  tax_setting: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

function dateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function actionLabel(a: string) {
  return a.replace(/_/g, ' ');
}

export default function AdminAuditLog() {
  const [userId, setUserId] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [entityId, setEntityId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const PAGE_SIZE = 50;

  const { data: actions = [] } = useQuery<string[]>({
    queryKey: ['audit-actions'],
    queryFn: () => apiFetch<string[]>('/audit/actions'),
  });

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('limit', String(PAGE_SIZE));
    qs.set('offset', String(page * PAGE_SIZE));
    if (userId) qs.set('userId', userId);
    if (action) qs.set('action', action);
    if (entityType) qs.set('entityType', entityType);
    if (entityId) qs.set('entityId', entityId);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return qs.toString();
  }, [userId, action, entityType, entityId, from, to, page]);

  const { data: page1, isLoading } = useQuery<AuditPage>({
    queryKey: ['audit-log', queryString],
    queryFn: () => apiFetch<AuditPage>(`/audit/log?${queryString}`),
  });

  const totalPages = page1 ? Math.max(1, Math.ceil(page1.total / PAGE_SIZE)) : 1;
  const hasFilters = !!(userId || action || entityType || entityId || from || to);

  const clearFilters = () => {
    setUserId('');
    setAction('');
    setEntityType('');
    setEntityId('');
    setFrom('');
    setTo('');
    setPage(0);
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">Audit Log</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Tamper-evident record of every privileged action — logins, money events, ledger postings, period locks. Filter by user, action, entity, or date.
              </p>
            </div>
          </div>

          {/* Filters */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter size={16} /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Action</Label>
                  <Select value={action || 'all'} onValueChange={(v) => { setAction(v === 'all' ? '' : v); setPage(0); }}>
                    <SelectTrigger className="h-10 rounded-xl text-sm">
                      <SelectValue placeholder="All actions" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="all">All actions</SelectItem>
                      {actions.map(a => (
                        <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Entity type</Label>
                  <Input value={entityType} onChange={e => { setEntityType(e.target.value); setPage(0); }} placeholder="e.g. ledger_journal" className="h-10 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Entity ID</Label>
                  <Input value={entityId} onChange={e => { setEntityId(e.target.value); setPage(0); }} placeholder="e.g. 42" className="h-10 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">User ID</Label>
                  <Input value={userId} onChange={e => { setUserId(e.target.value.replace(/\D/g, '')); setPage(0); }} placeholder="numeric" className="h-10 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(0); }} className="h-10 rounded-xl text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(0); }} className="h-10 rounded-xl text-sm" />
                </div>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl gap-1.5"
                  onClick={clearFilters}
                  disabled={!hasFilters}
                >
                  <X size={14} /> Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Entries */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40 flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock size={16} /> Entries
                {page1 && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({page1.total.toLocaleString()} total)
                  </span>
                )}
              </CardTitle>
              <div className="flex items-center gap-2 text-xs">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg gap-1"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft size={14} /> Prev
                </Button>
                <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg gap-1"
                  onClick={() => setPage(p => p + 1)}
                  disabled={!page1 || (page + 1) * PAGE_SIZE >= page1.total}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : (page1?.entries.length ?? 0) === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No audit entries match these filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                      <tr>
                        <th className="text-left py-2.5 px-4 font-semibold">When</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Who</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Action</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Entity</th>
                        <th className="text-left py-2.5 px-4 font-semibold">From</th>
                        <th className="text-right py-2.5 px-4 font-semibold">Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {page1!.entries.map(e => (
                        <tr key={e.id} className="border-t border-border/40 hover:bg-muted/30">
                          <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground text-xs">
                            {dateLabel(e.occurredAt)}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <UserIcon size={12} className="text-primary" />
                              </div>
                              <div>
                                <div className="text-xs font-semibold">{e.userName ?? 'system'}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {e.userRole ?? '—'}{e.userId !== null ? ` · #${e.userId}` : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded-md font-semibold ${ACTION_BADGE[e.action] ?? 'bg-gray-100 text-gray-700'}`}>
                              {actionLabel(e.action)}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <Badge variant="outline" className={`font-normal text-[11px] ${ENTITY_BADGE[e.entityType] ?? ''}`}>
                              {e.entityType}{e.entityId !== null ? ` #${e.entityId}` : ''}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap text-[11px] text-muted-foreground">
                            {e.ipAddress ?? '—'}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-lg gap-1 text-xs"
                              onClick={() => setSelected(e)}
                            >
                              <Eye size={12} /> View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={o => !o && setSelected(null)}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" />
              Audit Entry #{selected?.id}
            </DialogTitle>
            <DialogDescription>
              {selected ? dateLabel(selected.occurredAt) : ''}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Action</p>
                  <p className="font-semibold">{actionLabel(selected.action)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Entity</p>
                  <p className="font-mono text-xs">{selected.entityType}{selected.entityId !== null ? ` #${selected.entityId}` : ''}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Actor</p>
                  <p className="font-semibold">{selected.userName ?? 'system'}</p>
                  <p className="text-xs text-muted-foreground">
                    {selected.userRole ?? '—'}
                    {selected.userId !== null ? ` · id ${selected.userId}` : ''}
                    {selected.userPhone ? ` · ${selected.userPhone}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Source</p>
                  <p className="font-mono text-xs">{selected.ipAddress ?? '—'}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{selected.userAgent ?? ''}</p>
                </div>
              </div>

              {selected.beforeState && Object.keys(selected.beforeState).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Before</p>
                  <pre className="text-[11px] bg-rose-50 border border-rose-100 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(selected.beforeState, null, 2)}
                  </pre>
                </div>
              )}

              {selected.afterState && Object.keys(selected.afterState).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">After</p>
                  <pre className="text-[11px] bg-emerald-50 border border-emerald-100 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(selected.afterState, null, 2)}
                  </pre>
                </div>
              )}

              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-1">Metadata</p>
                  <pre className="text-[11px] bg-slate-50 border border-slate-100 rounded-lg p-3 overflow-x-auto">
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
