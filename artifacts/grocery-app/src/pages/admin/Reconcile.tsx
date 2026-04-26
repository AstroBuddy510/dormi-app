import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle2, AlertTriangle, History } from 'lucide-react';

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
    ...init, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Request failed');
  return body as T;
}

interface Account { id: number; name: string; glAccountCode: string; }
interface Diff {
  bankAccountId: number; bankAccountName: string; glAccountCode: string;
  periodStart: string; periodEnd: string;
  lineCount: number; matched: number; unmatched: number; expense: number; income: number; ignored: number;
  closingPerStatement: string; closingPerLedger: string; difference: string;
}
interface Run {
  id: number; periodStart: string; periodEnd: string;
  closingPerStatement: string; closingPerLedger: string; difference: string;
  matchedCount: number; unmatchedCount: number;
  status: 'draft' | 'completed';
  createdByName: string; createdAt: string;
  completedByName: string | null; completedAt: string | null;
  notes: string | null;
}

export default function ReconcilePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(); monthStart.setDate(1);
  const [accountId, setAccountId] = useState(0);
  const [periodStart, setPeriodStart] = useState(monthStart.toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = useState(today);
  const [notes, setNotes] = useState('');

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api('/bank-accounts'),
  });
  if (!accountId && accounts.length > 0) setAccountId(accounts[0].id);

  const { data: diff } = useQuery<Diff>({
    queryKey: ['reconcile-diff', accountId, periodStart, periodEnd],
    queryFn: () => api(`/reconcile/diff?bankAccountId=${accountId}&periodStart=${periodStart}&periodEnd=${periodEnd}`),
    enabled: accountId > 0,
  });

  const { data: runs = [] } = useQuery<Run[]>({
    queryKey: ['reconcile-runs', accountId],
    queryFn: () => api(`/reconcile/runs?bankAccountId=${accountId}`),
    enabled: accountId > 0,
  });

  const startMutation = useMutation({
    mutationFn: () => api('/reconcile/runs', {
      method: 'POST', body: JSON.stringify({ bankAccountId: accountId, periodStart, periodEnd, notes }),
    }),
    onSuccess: () => { toast({ title: 'Run created (draft)' }); qc.invalidateQueries({ queryKey: ['reconcile-runs'] }); setNotes(''); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      api(`/reconcile/runs/${id}/complete`, { method: 'POST', body: JSON.stringify({ notes }) }),
    onSuccess: () => { toast({ title: 'Run completed' }); qc.invalidateQueries({ queryKey: ['reconcile-runs'] }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const diffNum = diff ? Number(diff.difference) : 0;
  const reconciled = Math.abs(diffNum) < 0.005;

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="flex-1 p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Reconciliation</h1>
          <p className="text-muted-foreground text-sm">Compare statement closing balance against ledger balance for a period.</p>
        </div>

        <Card className="mb-6">
          <CardHeader><CardTitle>Period</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-3">
            <div>
              <Label>Account</Label>
              <Select value={String(accountId)} onValueChange={v => setAccountId(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>From</Label><Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} /></div>
            <div><Label>To</Label><Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} /></div>
            <div className="flex items-end"><Button onClick={() => qc.invalidateQueries({ queryKey: ['reconcile-diff'] })} variant="outline" className="w-full">Refresh</Button></div>
          </CardContent>
        </Card>

        {diff && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {reconciled ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                Live diff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <Stat label="Per statement" value={`₵${Number(diff.closingPerStatement).toFixed(2)}`} />
                <Stat label="Per ledger" value={`₵${Number(diff.closingPerLedger).toFixed(2)}`} />
                <Stat label="Difference" value={`₵${diffNum.toFixed(2)}`} highlight={!reconciled} />
              </div>
              <div className="flex flex-wrap gap-3 text-sm mb-4">
                <Badge variant="outline">{diff.lineCount} lines</Badge>
                <Badge variant={diff.matched > 0 ? 'default' : 'outline'}>{diff.matched} matched</Badge>
                <Badge variant={diff.unmatched > 0 ? 'destructive' : 'outline'}>{diff.unmatched} unmatched</Badge>
                <Badge variant="outline">{diff.expense} expenses</Badge>
                <Badge variant="outline">{diff.income} income</Badge>
                <Badge variant="outline">{diff.ignored} ignored</Badge>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Explain residual differences, who reviewed, etc." />
              </div>
              <div className="mt-3">
                <Button onClick={() => startMutation.mutate()} disabled={!accountId || startMutation.isPending}>
                  {startMutation.isPending ? 'Creating…' : 'Create reconciliation run (draft)'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> History</CardTitle></CardHeader>
          <CardContent className="p-0">
            {runs.length === 0 ? (
              <p className="text-muted-foreground p-6">No runs yet for this account.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Period</th>
                    <th className="text-right p-3">Statement</th>
                    <th className="text-right p-3">Ledger</th>
                    <th className="text-right p-3">Diff</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-center p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} className="border-t">
                      <td className="p-3">{r.periodStart} → {r.periodEnd}</td>
                      <td className="p-3 text-right font-mono">₵{Number(r.closingPerStatement).toFixed(2)}</td>
                      <td className="p-3 text-right font-mono">₵{Number(r.closingPerLedger).toFixed(2)}</td>
                      <td className={`p-3 text-right font-mono ${Math.abs(Number(r.difference)) >= 0.005 ? 'text-amber-700' : 'text-green-700'}`}>₵{Number(r.difference).toFixed(2)}</td>
                      <td className="p-3 text-center"><Badge variant={r.status === 'completed' ? 'default' : 'outline'}>{r.status}</Badge></td>
                      <td className="p-3 text-center">
                        {r.status === 'draft' && (
                          <Button size="sm" onClick={() => completeMutation.mutate({ id: r.id, notes: r.notes ?? undefined })} disabled={completeMutation.isPending}>Complete</Button>
                        )}
                        {r.status === 'completed' && r.completedAt && (
                          <span className="text-xs text-muted-foreground">{r.completedByName} · {new Date(r.completedAt).toLocaleDateString()}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="border rounded p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-mono font-bold ${highlight ? 'text-amber-700' : ''}`}>{value}</p>
    </div>
  );
}
