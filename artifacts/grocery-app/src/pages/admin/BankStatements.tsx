import { useState, useMemo, useRef } from 'react';
import { useLocation } from 'wouter';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Upload, RefreshCcw, Sparkles, CheckCircle2, XCircle, AlertCircle, Receipt } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function authHeaders(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const a = window.localStorage.getItem('grocerease-auth');
    if (!a) return {};
    const t = JSON.parse(a)?.state?.token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Request failed');
  return body as T;
}

interface Line {
  id: number;
  bankAccountId: number;
  statementDate: string;
  description: string;
  reference: string | null;
  amount: string;
  runningBalance: string | null;
  source: string;
  matchStatus: 'unmatched' | 'matched' | 'expense' | 'income' | 'ignored';
  matchedTransactionId: string | null;
  matchedSourceType: string | null;
  matchNote: string | null;
}

interface Account {
  id: number;
  name: string;
  type: string;
  glAccountCode: string;
}

interface Candidate {
  transactionId: string;
  postedAt: string;
  description: string | null;
  netToAccount: number;
  score: number;
  reasons: string[];
  alreadyMatched: boolean;
}

const statusColors: Record<string, string> = {
  unmatched: 'bg-red-100 text-red-700',
  matched: 'bg-green-100 text-green-700',
  expense: 'bg-blue-100 text-blue-700',
  income: 'bg-purple-100 text-purple-700',
  ignored: 'bg-gray-100 text-gray-700',
};

export default function BankStatementsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [location] = useLocation();
  const search = new URLSearchParams(location.split('?')[1] ?? '');
  const initialAccountId = parseInt(search.get('account') ?? '0') || 0;

  const [accountId, setAccountId] = useState(initialAccountId);
  const [filter, setFilter] = useState<string>('unmatched');
  const [reviewLine, setReviewLine] = useState<Line | null>(null);
  const [classifyLine, setClassifyLine] = useState<Line | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api('/bank-accounts'),
  });

  // Default to first account if none selected
  if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);

  const { data: linesResp, isLoading } = useQuery<{ lines: Line[]; total: number }>({
    queryKey: ['statement-lines', accountId, filter],
    queryFn: () => api(`/statements/lines?bankAccountId=${accountId}&matchStatus=${filter}`),
    enabled: accountId > 0,
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const csv = await file.text();
      return api('/statements/import', {
        method: 'POST',
        body: JSON.stringify({ bankAccountId: accountId, csv, fileName: file.name }),
      });
    },
    onSuccess: (r: any) => {
      toast({ title: 'Imported', description: `${r.lineCount} lines, ${r.autoMatched} auto-matched (format: ${r.format})` });
      qc.invalidateQueries({ queryKey: ['statement-lines'] });
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
    },
    onError: (e: any) => toast({ title: 'Import failed', description: e.message, variant: 'destructive' }),
  });

  const autoMatchMutation = useMutation({
    mutationFn: () => api('/statements/auto-match', { method: 'POST', body: JSON.stringify({ bankAccountId: accountId }) }),
    onSuccess: (r: any) => {
      toast({ title: 'Auto-match complete', description: `${r.matched} of ${r.scanned} matched` });
      qc.invalidateQueries({ queryKey: ['statement-lines'] });
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const syncMutation = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) =>
      api('/statements/sync-paystack', { method: 'POST', body: JSON.stringify({ bankAccountId: accountId, from, to }) }),
    onSuccess: (r: any) => {
      toast({ title: 'Paystack sync done', description: `${r.inserted} new lines, ${r.autoMatched} auto-matched` });
      qc.invalidateQueries({ queryKey: ['statement-lines'] });
    },
    onError: (e: any) => toast({ title: 'Sync failed', description: e.message, variant: 'destructive' }),
  });

  const unmatchMutation = useMutation({
    mutationFn: (id: number) => api(`/statements/lines/${id}/unmatch`, { method: 'POST' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['statement-lines'] });
      toast({ title: 'Unmatched' });
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api(`/statements/lines/${id}/ignore`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['statement-lines'] });
      toast({ title: 'Ignored' });
    },
  });

  const account = accounts.find(a => a.id === accountId);
  const isPaystack = account?.glAccountCode === '1300-PAYSTACK-RECV';

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="flex-1 p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Bank Statements</h1>
            <p className="text-muted-foreground text-sm">Import statements, match against ledger, classify unmatched lines.</p>
          </div>
          <div className="flex gap-2 items-end flex-wrap">
            <div>
              <Label className="text-xs">Account</Label>
              <Select value={String(accountId)} onValueChange={v => setAccountId(parseInt(v))}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <input
              type="file" accept=".csv" ref={fileInputRef} className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importMutation.mutate(f); e.target.value = ''; }}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={!accountId || importMutation.isPending}>
              <Upload className="h-4 w-4 mr-2" /> {importMutation.isPending ? 'Importing…' : 'Upload CSV'}
            </Button>
            {isPaystack && (
              <PaystackSyncButton onSync={(from, to) => syncMutation.mutate({ from, to })} loading={syncMutation.isPending} />
            )}
            <Button variant="outline" onClick={() => autoMatchMutation.mutate()} disabled={!accountId || autoMatchMutation.isPending}>
              <Sparkles className="h-4 w-4 mr-2" /> {autoMatchMutation.isPending ? 'Matching…' : 'Run auto-match'}
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {(['unmatched', 'matched', 'expense', 'income', 'ignored'] as const).map(s => (
            <Button key={s} variant={filter === s ? 'default' : 'outline'} size="sm" onClick={() => setFilter(s)}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </Button>
          ))}
        </div>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="text-muted-foreground p-6">Loading…</p>
            ) : !linesResp?.lines.length ? (
              <p className="text-muted-foreground p-6">No {filter} lines.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Description</th>
                      <th className="text-left p-3">Reference</th>
                      <th className="text-right p-3">Amount</th>
                      <th className="text-center p-3">Status</th>
                      <th className="text-center p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linesResp.lines.map(l => (
                      <tr key={l.id} className="border-t">
                        <td className="p-3">{l.statementDate}</td>
                        <td className="p-3 max-w-xs truncate" title={l.description}>{l.description}</td>
                        <td className="p-3 font-mono text-xs">{l.reference ?? '—'}</td>
                        <td className={`p-3 text-right font-mono ${Number(l.amount) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {Number(l.amount) >= 0 ? '+' : ''}₵{Number(l.amount).toFixed(2)}
                        </td>
                        <td className="p-3 text-center">
                          <Badge className={statusColors[l.matchStatus]}>{l.matchStatus}</Badge>
                        </td>
                        <td className="p-3 text-center space-x-1">
                          {l.matchStatus === 'unmatched' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => setReviewLine(l)}>Match</Button>
                              {Number(l.amount) < 0 && (
                                <Button size="sm" variant="outline" onClick={() => setClassifyLine(l)}>
                                  <Receipt className="h-3 w-3 mr-1" /> Expense
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => {
                                const reason = window.prompt('Why ignore this line?');
                                if (reason !== null) ignoreMutation.mutate({ id: l.id, reason });
                              }}>Ignore</Button>
                            </>
                          )}
                          {(l.matchStatus === 'matched' || l.matchStatus === 'expense' || l.matchStatus === 'income') && (
                            <Button size="sm" variant="ghost" onClick={() => unmatchMutation.mutate(l.id)}>Undo</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {reviewLine && (
          <MatchDialog line={reviewLine} onClose={() => setReviewLine(null)} onMatched={() => {
            qc.invalidateQueries({ queryKey: ['statement-lines'] });
            setReviewLine(null);
          }} />
        )}

        {classifyLine && (
          <ClassifyExpenseDialog line={classifyLine} onClose={() => setClassifyLine(null)} onDone={() => {
            qc.invalidateQueries({ queryKey: ['statement-lines'] });
            setClassifyLine(null);
          }} />
        )}
      </main>
    </div>
  );
}

function PaystackSyncButton({ onSync, loading }: { onSync: (from: string, to: string) => void; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RefreshCcw className="h-4 w-4 mr-2" /> Sync Paystack
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sync Paystack transactions</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={loading} onClick={() => { onSync(from, to); setOpen(false); }}>{loading ? 'Syncing…' : 'Sync'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MatchDialog({ line, onClose, onMatched }: { line: Line; onClose: () => void; onMatched: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useQuery<{ candidates: Candidate[]; bestCandidate: Candidate | null }>({
    queryKey: ['match-candidates', line.id],
    queryFn: () => api(`/statements/lines/${line.id}/candidates`),
  });

  const matchMutation = useMutation({
    mutationFn: (transactionId: string) => api(`/statements/lines/${line.id}/match`, {
      method: 'POST', body: JSON.stringify({ transactionId, note: 'Manually matched via review' }),
    }),
    onSuccess: () => { toast({ title: 'Matched' }); onMatched(); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Match statement line</DialogTitle>
          <DialogDescription>
            {line.statementDate} · {line.description} · ₵{Number(line.amount).toFixed(2)} {line.reference ? `(ref: ${line.reference})` : ''}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-muted-foreground">Searching ledger…</p>
        ) : (data?.candidates ?? []).length === 0 ? (
          <p className="text-muted-foreground">No nearby ledger transactions found within ±2 days. Try classifying as a new expense or ignoring the line.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {data!.candidates.map(c => (
              <div key={c.transactionId} className="border rounded p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={c.score >= 95 ? 'default' : c.score >= 60 ? 'secondary' : 'outline'}>Score {c.score}</Badge>
                    {c.alreadyMatched && <Badge variant="destructive">Already matched</Badge>}
                  </div>
                  <p className="text-sm font-medium truncate">{c.description ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.postedAt).toLocaleDateString()} · ₵{c.netToAccount.toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground italic">{c.reasons.join(' · ')}</p>
                </div>
                <Button size="sm" disabled={c.alreadyMatched || matchMutation.isPending} onClick={() => matchMutation.mutate(c.transactionId)}>
                  Match
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClassifyExpenseDialog({ line, onClose, onDone }: { line: Line; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [desc, setDesc] = useState(line.description);

  const { data: glCodes = [] } = useQuery<{ code: string; name: string; type: string }[]>({
    queryKey: ['bank-accounts-gl'],
    queryFn: () => api('/bank-accounts/gl-codes'),
  });
  const expenseCodes = useMemo(() => glCodes.filter(g => g.type === 'expense'), [glCodes]);

  const mutation = useMutation({
    mutationFn: () => api(`/statements/lines/${line.id}/classify-as-expense`, {
      method: 'POST', body: JSON.stringify({ expenseAccountCode: code, description: desc }),
    }),
    onSuccess: () => { toast({ title: 'Classified' }); onDone(); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Classify as expense</DialogTitle>
          <DialogDescription>
            Posts a new expense journal: DR &lt;account&gt; ₵{Math.abs(Number(line.amount)).toFixed(2)} · CR cash channel.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Expense account</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger><SelectValue placeholder="Pick an expense account" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {expenseCodes.map(c => (
                  <SelectItem key={c.code} value={c.code}><code className="text-xs mr-2">{c.code}</code> {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!code || mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Posting…' : 'Post expense'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
