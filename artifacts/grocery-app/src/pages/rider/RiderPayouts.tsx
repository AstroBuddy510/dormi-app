import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Wallet, Send, CreditCard, Banknote, Clock, CheckCircle2 } from 'lucide-react';

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

const fmt = (n: number) => `₵${Number(n).toFixed(2)}`;

interface Breakdown {
  riderId: number;
  riderType: 'in_house' | 'independent';
  commissionPercent: number;
  message?: string;
  totalEarnings: number;
  paystackPortion: number;
  cashPortion: number;
  unpaid: { total: number; paystack: number; cash: number; orderCount: number };
  inFlight: { total: number; paystack: number; cash: number; requestCount: number };
}

interface Payout {
  id: number;
  riderId: number;
  totalAmount: number;
  paystackPortion: number;
  cashPortion: number;
  orderCount: number;
  status: 'pending' | 'paid';
  notes: string | null;
  requestedAt: string;
  paidAt: string | null;
}

export function RiderPayouts({ riderId }: { riderId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [requestOpen, setRequestOpen] = useState(false);
  const [notes, setNotes] = useState('');

  const { data: breakdown, isLoading } = useQuery<Breakdown>({
    queryKey: ['rider-payouts-breakdown', riderId],
    queryFn: () => api(`/rider-payouts/breakdown?riderId=${riderId}`),
  });

  const { data: payouts = [] } = useQuery<Payout[]>({
    queryKey: ['rider-payouts-mine', riderId],
    queryFn: () => api(`/rider-payouts/mine?riderId=${riderId}`),
  });

  const requestMutation = useMutation({
    mutationFn: () => api('/rider-payouts/request', {
      method: 'POST',
      body: JSON.stringify({ riderId, notes: notes || undefined }),
    }),
    onSuccess: () => {
      toast({ title: 'Payout requested', description: 'Admin will review and pay shortly.' });
      qc.invalidateQueries({ queryKey: ['rider-payouts-breakdown', riderId] });
      qc.invalidateQueries({ queryKey: ['rider-payouts-mine', riderId] });
      setRequestOpen(false);
      setNotes('');
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  if (isLoading || !breakdown) {
    return <p className="text-muted-foreground p-6 text-center">Loading earnings…</p>;
  }

  if (breakdown.riderType === 'in_house') {
    return (
      <div className="space-y-4">
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-6 text-center">
            <Banknote className="h-10 w-10 text-blue-600 mx-auto mb-3" />
            <h3 className="text-lg font-bold mb-1">In-house Rider</h3>
            <p className="text-sm text-muted-foreground">{breakdown.message ?? 'You are paid via payroll, not the per-order payout flow.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canRequest = breakdown.unpaid.total > 0;

  return (
    <div className="space-y-4">
      {/* Earnings summary */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total earnings (lifetime)</p>
              <p className="text-3xl font-bold font-mono">{fmt(breakdown.totalEarnings)}</p>
            </div>
            <Wallet className="h-8 w-8 text-primary" />
          </div>
          <p className="text-xs text-muted-foreground">
            Platform commission: {breakdown.commissionPercent}% of delivery fee
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="h-4 w-4 text-purple-600" />
              <p className="text-xs text-muted-foreground">Paystack-held</p>
            </div>
            <p className="text-xl font-bold font-mono">{fmt(breakdown.paystackPortion)}</p>
            <p className="text-[10px] text-muted-foreground">Held by platform from card payments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Banknote className="h-4 w-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Cash-held</p>
            </div>
            <p className="text-xl font-bold font-mono">{fmt(breakdown.cashPortion)}</p>
            <p className="text-[10px] text-muted-foreground">Already collected on delivery</p>
          </CardContent>
        </Card>
      </div>

      {/* Pending payable + Request button */}
      <Card className={breakdown.unpaid.total > 0 ? 'border-orange-200 bg-orange-50/30' : ''}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Currently owed to you</p>
              <p className="text-2xl font-bold font-mono text-orange-700">{fmt(breakdown.unpaid.total)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {breakdown.unpaid.orderCount} unpaid order{breakdown.unpaid.orderCount !== 1 ? 's' : ''}
                {' · '}Paystack {fmt(breakdown.unpaid.paystack)} · Cash {fmt(breakdown.unpaid.cash)}
              </p>
            </div>
          </div>
          <Button
            className="w-full"
            disabled={!canRequest || breakdown.inFlight.requestCount > 0}
            onClick={() => setRequestOpen(true)}
          >
            <Send className="h-4 w-4 mr-2" />
            {breakdown.inFlight.requestCount > 0 ? 'Request pending review' : 'Request Payout'}
          </Button>
          {breakdown.inFlight.requestCount > 0 && (
            <p className="text-xs text-orange-700 mt-2 flex items-center gap-1">
              <Clock className="h-3 w-3" /> A previous request of {fmt(breakdown.inFlight.total)} is awaiting payment.
            </p>
          )}
        </CardContent>
      </Card>

      {/* History */}
      {payouts.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b">
              <h3 className="font-semibold">Payout history</h3>
            </div>
            <div className="divide-y">
              {payouts.map(p => (
                <div key={p.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono font-semibold">{fmt(p.totalAmount)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.requestedAt).toLocaleDateString()} · {p.orderCount} orders
                    </p>
                  </div>
                  {p.status === 'paid' ? (
                    <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Paid
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700 font-medium flex items-center gap-1">
                      <Clock className="h-3 w-3" /> Pending
                    </span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request payout</DialogTitle>
            <DialogDescription>
              You'll request {fmt(breakdown.unpaid.total)} ({breakdown.unpaid.orderCount} orders).
              Admin will review and pay shortly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg border p-3 bg-muted/30 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Paystack-held</span><span className="font-mono">{fmt(breakdown.unpaid.paystack)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cash already collected</span><span className="font-mono">{fmt(breakdown.unpaid.cash)}</span></div>
              <div className="flex justify-between border-t pt-1 font-semibold"><span>Total request</span><span className="font-mono">{fmt(breakdown.unpaid.total)}</span></div>
            </div>
            <Textarea
              rows={2}
              placeholder="Any notes for admin (optional)…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button disabled={requestMutation.isPending} onClick={() => requestMutation.mutate()}>
              {requestMutation.isPending ? 'Submitting…' : 'Submit request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
