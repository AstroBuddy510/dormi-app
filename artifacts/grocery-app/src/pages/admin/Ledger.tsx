import { useState, useMemo } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { BookOpen, Filter, ChevronLeft, ChevronRight, CircleDollarSign, X, History, ShieldCheck, User as UserIcon } from 'lucide-react';

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

interface Account {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  normalBalance: 'debit' | 'credit';
  description: string | null;
  active: boolean;
}

interface Entry {
  id: number;
  transactionId: string;
  accountCode: string;
  debit: number;
  credit: number;
  currency: string;
  postedAt: string;
  description: string | null;
  sourceType: string;
  sourceId: number | null;
  meta: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}

interface EntriesPage {
  total: number;
  limit: number;
  offset: number;
  entries: Entry[];
}

interface Balance {
  code: string;
  name: string;
  type: Account['type'];
  normalBalance: Account['normalBalance'];
  balance: number;
}

function apiFetch<T = any>(path: string): Promise<T> {
  return fetch(`${BASE}/api${path}`, { headers: authHeaders() }).then(async r => {
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? 'Request failed');
    return r.json();
  });
}

interface AuditTrailEntry {
  id: number;
  userId: number | null;
  userRole: string | null;
  userName: string | null;
  action: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

const SOURCE_LABELS: Record<string, string> = {
  order_payment: 'Order payment',
  vendor_payout: 'Vendor payout',
  rider_earning: 'Rider earning',
  rider_payout: 'Rider payout',
  expense: 'Expense',
  payroll_accrual: 'Payroll accrual',
  payroll_disbursement: 'Salary paid',
  bank_settlement: 'Bank settlement',
  tax_remittance: 'Tax remittance',
  manual: 'Manual entry',
};

const TYPE_BADGE: Record<Account['type'], string> = {
  asset: 'bg-blue-100 text-blue-800',
  liability: 'bg-orange-100 text-orange-800',
  equity: 'bg-purple-100 text-purple-800',
  revenue: 'bg-green-100 text-green-800',
  expense: 'bg-rose-100 text-rose-800',
};

function fmt(n: number) {
  return n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function actionLabel(a: string) {
  return a.replace(/_/g, ' ');
}

export default function AdminLedger() {
  const [accountFilter, setAccountFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');
  const [page, setPage] = useState(0);
  const [historyTx, setHistoryTx] = useState<string | null>(null);
  const PAGE_SIZE = 100;

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['ledger-accounts'],
    queryFn: () => apiFetch<Account[]>('/ledger/accounts'),
  });

  const { data: balances = [] } = useQuery<Balance[]>({
    queryKey: ['ledger-balances', from, to],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      const q = qs.toString();
      return apiFetch<Balance[]>(`/ledger/balances${q ? `?${q}` : ''}`);
    },
  });

  const queryString = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('limit', String(PAGE_SIZE));
    qs.set('offset', String(page * PAGE_SIZE));
    if (accountFilter) qs.set('account', accountFilter);
    if (sourceFilter) qs.set('sourceType', sourceFilter);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return qs.toString();
  }, [accountFilter, sourceFilter, from, to, page]);

  const { data: entriesPage, isLoading } = useQuery<EntriesPage>({
    queryKey: ['ledger-entries', queryString],
    queryFn: () => apiFetch<EntriesPage>(`/ledger/entries?${queryString}`),
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<{
    transactionId: string;
    entries: AuditTrailEntry[];
  }>({
    queryKey: ['journal-history', historyTx],
    queryFn: () => apiFetch<{ transactionId: string; entries: AuditTrailEntry[] }>(
      `/audit/journal/${encodeURIComponent(historyTx!)}`
    ),
    enabled: !!historyTx,
  });

  const accountByCode = useMemo(() => {
    const m: Record<string, Account> = {};
    for (const a of accounts) m[a.code] = a;
    return m;
  }, [accounts]);

  const summaryByType = useMemo(() => {
    const out: Record<Account['type'], number> = { asset: 0, liability: 0, equity: 0, revenue: 0, expense: 0 };
    for (const b of balances) out[b.type] += b.balance;
    return out;
  }, [balances]);

  const totalPages = entriesPage ? Math.max(1, Math.ceil(entriesPage.total / PAGE_SIZE)) : 1;
  const hasFilters = !!(accountFilter || sourceFilter || from || to);

  const clearFilters = () => {
    setAccountFilter('');
    setSourceFilter('');
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
              <BookOpen size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">General Ledger</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Every cedi that moves through the platform is posted here as a balanced double-entry transaction. This is the source of truth for all financial reporting.
              </p>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {(['asset', 'liability', 'equity', 'revenue', 'expense'] as const).map(t => (
              <Card key={t} className="rounded-2xl border-0 shadow-sm">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{t}s</p>
                  <p className="text-xl font-bold mt-1">GHS {fmt(summaryByType[t] ?? 0)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Filter size={16} /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs">Account</Label>
                  <Select value={accountFilter || 'all'} onValueChange={(v) => { setAccountFilter(v === 'all' ? '' : v); setPage(0); }}>
                    <SelectTrigger className="h-10 rounded-xl text-sm">
                      <SelectValue placeholder="All accounts" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      <SelectItem value="all">All accounts</SelectItem>
                      {accounts.map(a => (
                        <SelectItem key={a.code} value={a.code}>
                          <span className="font-mono text-xs mr-1">{a.code}</span>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Source</Label>
                  <Select value={sourceFilter || 'all'} onValueChange={(v) => { setSourceFilter(v === 'all' ? '' : v); setPage(0); }}>
                    <SelectTrigger className="h-10 rounded-xl text-sm">
                      <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      {Object.entries(SOURCE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

          {/* Entries table */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40 flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CircleDollarSign size={16} /> Ledger Entries
                {entriesPage && (
                  <span className="text-xs font-normal text-muted-foreground ml-1">
                    ({entriesPage.total.toLocaleString()} total)
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
                  disabled={!entriesPage || (page + 1) * PAGE_SIZE >= entriesPage.total}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading entries…</div>
              ) : (entriesPage?.entries.length ?? 0) === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  No entries match these filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                      <tr>
                        <th className="text-left py-2.5 px-4 font-semibold">Date</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Source</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Account</th>
                        <th className="text-right py-2.5 px-4 font-semibold">Debit</th>
                        <th className="text-right py-2.5 px-4 font-semibold">Credit</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Description</th>
                        <th className="text-right py-2.5 px-4 font-semibold">Trail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entriesPage!.entries.map(e => {
                        const a = accountByCode[e.accountCode];
                        return (
                          <tr key={e.id} className="border-t border-border/40 hover:bg-muted/30">
                            <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground">{dateLabel(e.postedAt)}</td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <Badge variant="secondary" className="font-normal text-xs">
                                {SOURCE_LABELS[e.sourceType] ?? e.sourceType}
                                {e.sourceId !== null ? ` #${e.sourceId}` : ''}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase ${a ? TYPE_BADGE[a.type] : 'bg-gray-100 text-gray-600'}`}>
                                  {a?.type ?? '—'}
                                </span>
                                <div>
                                  <div className="font-mono text-xs text-muted-foreground">{e.accountCode}</div>
                                  <div className="text-xs">{a?.name ?? e.accountCode}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">
                              {e.debit > 0 ? fmt(e.debit) : ''}
                            </td>
                            <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">
                              {e.credit > 0 ? fmt(e.credit) : ''}
                            </td>
                            <td className="py-2.5 px-4 text-xs text-muted-foreground max-w-md truncate">
                              {e.description ?? ''}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 rounded-lg gap-1 text-xs"
                                onClick={() => setHistoryTx(e.transactionId)}
                                title="View this journal's audit trail"
                              >
                                <History size={12} />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Account balances */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base">Account Balances</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                    <tr>
                      <th className="text-left py-2.5 px-4 font-semibold">Code</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Account</th>
                      <th className="text-left py-2.5 px-4 font-semibold">Type</th>
                      <th className="text-right py-2.5 px-4 font-semibold">Balance (GHS)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.filter(b => Math.abs(b.balance) >= 0.005).map(b => (
                      <tr key={b.code} className="border-t border-border/40 hover:bg-muted/30 cursor-pointer"
                          onClick={() => { setAccountFilter(b.code); setPage(0); }}>
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground">{b.code}</td>
                        <td className="py-2.5 px-4">{b.name}</td>
                        <td className="py-2.5 px-4">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold uppercase ${TYPE_BADGE[b.type]}`}>{b.type}</span>
                        </td>
                        <td className="py-2.5 px-4 text-right tabular-nums font-semibold">{fmt(b.balance)}</td>
                      </tr>
                    ))}
                    {balances.filter(b => Math.abs(b.balance) >= 0.005).length === 0 && (
                      <tr><td colSpan={4} className="py-6 text-center text-sm text-muted-foreground">No balances posted yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Journal audit trail dialog */}
      <Dialog open={!!historyTx} onOpenChange={o => !o && setHistoryTx(null)}>
        <DialogContent className="rounded-2xl max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck size={18} className="text-primary" /> Journal audit trail
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              {historyTx}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[70vh] overflow-y-auto space-y-3">
            {historyLoading ? (
              <div className="text-sm text-muted-foreground py-6 text-center">Loading…</div>
            ) : (historyData?.entries.length ?? 0) === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No audit entries recorded for this journal. (Likely a backfilled or pre-Phase-3 transaction.)
              </div>
            ) : (
              historyData!.entries.map(entry => (
                <div key={entry.id} className="border border-border/60 rounded-xl p-3 bg-muted/20">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserIcon size={12} className="text-primary" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{entry.userName ?? 'system'}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {entry.userRole ?? '—'}{entry.userId !== null ? ` · #${entry.userId}` : ''}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] px-2 py-0.5 rounded-md font-semibold bg-emerald-100 text-emerald-800">
                        {actionLabel(entry.action)}
                      </span>
                      <div className="text-[10px] text-muted-foreground mt-1">{dateLabel(entry.occurredAt)}</div>
                    </div>
                  </div>

                  {entry.afterState && Object.keys(entry.afterState).length > 0 && (
                    <pre className="text-[10px] bg-emerald-50 border border-emerald-100 rounded-lg p-2 mt-2 overflow-x-auto">
                      {JSON.stringify(entry.afterState, null, 2)}
                    </pre>
                  )}
                  {entry.beforeState && Object.keys(entry.beforeState).length > 0 && (
                    <pre className="text-[10px] bg-rose-50 border border-rose-100 rounded-lg p-2 mt-2 overflow-x-auto">
                      {JSON.stringify(entry.beforeState, null, 2)}
                    </pre>
                  )}
                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <pre className="text-[10px] bg-slate-50 border border-slate-100 rounded-lg p-2 mt-2 overflow-x-auto">
                      {JSON.stringify(entry.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
