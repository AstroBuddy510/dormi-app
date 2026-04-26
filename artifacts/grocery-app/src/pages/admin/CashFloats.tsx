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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Wallet, ClipboardCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';

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

interface Float {
  id: number; name: string; ownerName: string | null; ownerType: string | null;
  glAccountCode: string; expectedBalance: number;
}
interface Count {
  id: number; countDate: string;
  expectedBalance: string; declaredBalance: string; discrepancy: string;
  status: string; reason: string | null;
  submittedByName: string; submittedAt: string;
}

export default function CashFloatsPage() {
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState<Float | null>(null);
  const [historyFor, setHistoryFor] = useState<Float | null>(null);

  const { data: floats = [], isLoading } = useQuery<Float[]>({
    queryKey: ['cash-floats'],
    queryFn: () => api('/cash-floats'),
  });

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="flex-1 p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Cash Floats</h1>
          <p className="text-muted-foreground text-sm">Daily cash counts vs expected ledger balance. Discrepancies post to <code>6900-CASH-SHORT-OVER</code>.</p>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : floats.length === 0 ? (
          <p className="text-muted-foreground">No cash floats yet. Create one in Bank Accounts (type "Cash Float").</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {floats.map(f => (
              <Card key={f.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" /> {f.name}</CardTitle>
                  <p className="text-xs text-muted-foreground">{f.ownerName} · {f.ownerType}</p>
                </CardHeader>
                <CardContent>
                  <div className="text-sm flex justify-between mb-3">
                    <span className="text-muted-foreground">Expected</span>
                    <span className="font-mono font-semibold">₵{f.expectedBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={() => setSubmitting(f)}>
                      <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Submit count
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setHistoryFor(f)}>History</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {submitting && (
          <SubmitCountDialog float={submitting} onClose={() => setSubmitting(null)} onDone={() => {
            qc.invalidateQueries({ queryKey: ['cash-floats'] });
            setSubmitting(null);
          }} />
        )}

        {historyFor && <HistoryDialog float={historyFor} onClose={() => setHistoryFor(null)} />}
      </main>
    </div>
  );
}

function SubmitCountDialog({ float, onClose, onDone }: { float: Float; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [countDate, setCountDate] = useState(today);
  const [declared, setDeclared] = useState(float.expectedBalance.toFixed(2));
  const [reason, setReason] = useState('');
  const [postAdjustment, setPostAdjustment] = useState(false);

  const declaredNum = parseFloat(declared) || 0;
  const discrepancy = declaredNum - float.expectedBalance;

  const mutation = useMutation({
    mutationFn: () => api('/cash-floats/counts', {
      method: 'POST', body: JSON.stringify({
        bankAccountId: float.id, countDate, declaredBalance: declaredNum, reason, postAdjustment,
      }),
    }),
    onSuccess: () => { toast({ title: 'Count submitted' }); onDone(); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit count — {float.name}</DialogTitle>
          <DialogDescription>Enter the actual cash on hand. We'll compute the discrepancy against the ledger.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Count date</Label><Input type="date" value={countDate} onChange={e => setCountDate(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="border rounded p-3">
              <p className="text-xs text-muted-foreground">Expected (per ledger)</p>
              <p className="font-mono font-semibold">₵{float.expectedBalance.toFixed(2)}</p>
            </div>
            <div className="border rounded p-3">
              <Label className="text-xs">Declared</Label>
              <Input type="number" step="0.01" value={declared} onChange={e => setDeclared(e.target.value)} />
            </div>
          </div>
          <div className={`border rounded p-3 ${Math.abs(discrepancy) < 0.005 ? 'bg-green-50' : discrepancy < 0 ? 'bg-red-50' : 'bg-amber-50'}`}>
            <div className="flex items-center gap-2">
              {Math.abs(discrepancy) < 0.005 ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <AlertTriangle className="h-4 w-4 text-amber-700" />}
              <p className="text-sm font-medium">
                Discrepancy: <span className="font-mono">₵{discrepancy.toFixed(2)}</span> {discrepancy < 0 ? '(shortage)' : discrepancy > 0 ? '(surplus)' : ''}
              </p>
            </div>
          </div>
          {Math.abs(discrepancy) >= 0.005 && (
            <>
              <div>
                <Label>Reason</Label>
                <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="What might explain the difference?" />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={postAdjustment} onChange={e => setPostAdjustment(e.target.checked)} className="mt-0.5" />
                <span>Post adjustment journal now (writes to <code>6900-CASH-SHORT-OVER</code>)</span>
              </label>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Submitting…' : 'Submit'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ float, onClose }: { float: Float; onClose: () => void }) {
  const { data: counts = [], isLoading } = useQuery<Count[]>({
    queryKey: ['cash-float-counts', float.id],
    queryFn: () => api(`/cash-floats/${float.id}/counts`),
  });
  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Count history — {float.name}</DialogTitle></DialogHeader>
        {isLoading ? (<p className="text-muted-foreground">Loading…</p>) : counts.length === 0 ? (
          <p className="text-muted-foreground">No counts yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr><th className="text-left p-2">Date</th><th className="text-right p-2">Expected</th><th className="text-right p-2">Declared</th><th className="text-right p-2">Diff</th><th className="text-center p-2">Status</th><th className="text-left p-2">Submitted by</th></tr>
              </thead>
              <tbody>
                {counts.map(c => (
                  <tr key={c.id} className="border-t">
                    <td className="p-2">{c.countDate}</td>
                    <td className="p-2 text-right font-mono">₵{Number(c.expectedBalance).toFixed(2)}</td>
                    <td className="p-2 text-right font-mono">₵{Number(c.declaredBalance).toFixed(2)}</td>
                    <td className={`p-2 text-right font-mono ${Math.abs(Number(c.discrepancy)) >= 0.005 ? 'text-amber-700' : 'text-green-700'}`}>₵{Number(c.discrepancy).toFixed(2)}</td>
                    <td className="p-2 text-center"><Badge variant="outline">{c.status}</Badge></td>
                    <td className="p-2 text-xs">{c.submittedByName} · {new Date(c.submittedAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
