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
import {
  Lock, Unlock, ShieldAlert, AlertTriangle, Plus, History, RefreshCcw,
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

async function apiFetch<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Request failed');
  return body as T;
}

interface LockRow {
  id: number;
  periodStart: string;   // YYYY-MM-DD
  periodEnd: string;     // YYYY-MM-DD
  lockedBy: number | null;
  lockedByName: string | null;
  lockedAt: string;
  lockReason: string | null;
  unlockedBy: number | null;
  unlockedByName: string | null;
  unlockedAt: string | null;
  unlockReason: string | null;
  active: boolean;
}

function dateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function dayLabel(yyyymmdd: string) {
  // YYYY-MM-DD → "01 Apr 2026"
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default function AdminPeriodLocks() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [unlockTarget, setUnlockTarget] = useState<LockRow | null>(null);

  // Form state
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [reason, setReason] = useState('');
  const [unlockReason, setUnlockReason] = useState('');

  const { data: locks = [], isLoading, refetch } = useQuery<LockRow[]>({
    queryKey: ['period-locks', showAll],
    queryFn: () => apiFetch<LockRow[]>(`/period-locks?activeOnly=${showAll ? 'false' : 'true'}`),
  });

  const createLock = useMutation({
    mutationFn: () =>
      apiFetch<LockRow>('/period-locks', {
        method: 'POST',
        body: JSON.stringify({ periodStart, periodEnd, reason: reason || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['period-locks'] });
      toast({ title: 'Period locked', description: `Entries dated within this range can no longer be posted.` });
      setCreateOpen(false);
      setPeriodStart(''); setPeriodEnd(''); setReason('');
    },
    onError: (err: any) => toast({ title: 'Could not lock period', description: err.message, variant: 'destructive' }),
  });

  const unlockMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch<LockRow>(`/period-locks/${id}/unlock`, {
        method: 'POST',
        body: JSON.stringify({ reason: unlockReason || undefined }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['period-locks'] });
      toast({ title: 'Period unlocked', description: 'New entries can be posted in this date range again.' });
      setUnlockTarget(null);
      setUnlockReason('');
    },
    onError: (err: any) => toast({ title: 'Could not unlock', description: err.message, variant: 'destructive' }),
  });

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                <Lock size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold font-display">Period Locks</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Lock a closed accounting period to prevent any new ledger entries from being posted with that date. Locks can be reversed by an admin if absolutely needed.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1.5"
                onClick={() => refetch()}
              >
                <RefreshCcw size={14} /> Refresh
              </Button>
              <Button
                size="sm"
                className="rounded-xl gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={14} /> Lock period
              </Button>
            </div>
          </div>

          {/* Warning banner */}
          <Card className="rounded-2xl border-amber-200 bg-amber-50/50 shadow-sm">
            <CardContent className="p-4 flex gap-3 items-start">
              <ShieldAlert size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-amber-900">How locks work</p>
                <p className="text-amber-800/90 mt-0.5">
                  When a period is locked, the database refuses to insert any ledger journal whose <code className="text-xs font-mono">postedAt</code> falls inside the lock range. The originating action (an order, expense, payout, etc.) will fail with a clear error explaining which lock is blocking it. Unlocking is audited.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={!showAll ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => setShowAll(false)}
              >
                Active only
              </Button>
              <Button
                size="sm"
                variant={showAll ? 'default' : 'outline'}
                className="rounded-xl"
                onClick={() => setShowAll(true)}
              >
                <History size={14} className="mr-1" /> Show full history
              </Button>
            </div>
          </div>

          {/* Table */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock size={16} /> {showAll ? 'All locks' : 'Active locks'}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  ({locks.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
              ) : locks.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  {showAll ? 'No locks have ever been created.' : 'No active locks.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-wide text-muted-foreground bg-muted/40">
                      <tr>
                        <th className="text-left py-2.5 px-4 font-semibold">Range</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Status</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Locked by</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Reason</th>
                        <th className="text-left py-2.5 px-4 font-semibold">Unlocked</th>
                        <th className="text-right py-2.5 px-4 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locks.map(l => (
                        <tr key={l.id} className="border-t border-border/40 hover:bg-muted/30">
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="font-semibold text-sm">
                              {dayLabel(l.periodStart)} → {dayLabel(l.periodEnd)}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">lock #{l.id}</div>
                          </td>
                          <td className="py-2.5 px-4">
                            {l.active ? (
                              <Badge className="bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-100 gap-1">
                                <Lock size={10} /> Locked
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-slate-600 gap-1">
                                <Unlock size={10} /> Unlocked
                              </Badge>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-xs">
                            <div className="font-semibold">{l.lockedByName ?? 'system'}</div>
                            <div className="text-muted-foreground">{dateLabel(l.lockedAt)}</div>
                          </td>
                          <td className="py-2.5 px-4 text-xs text-muted-foreground max-w-xs">
                            {l.lockReason ?? '—'}
                          </td>
                          <td className="py-2.5 px-4 text-xs">
                            {l.unlockedAt ? (
                              <>
                                <div className="font-semibold">{l.unlockedByName ?? 'system'}</div>
                                <div className="text-muted-foreground">{dateLabel(l.unlockedAt)}</div>
                                {l.unlockReason && (
                                  <div className="text-[10px] text-muted-foreground italic mt-0.5 max-w-[200px] truncate">
                                    {l.unlockReason}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {l.active ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 rounded-lg gap-1 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
                                onClick={() => setUnlockTarget(l)}
                              >
                                <Unlock size={12} /> Unlock
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
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
        </div>
      </div>

      {/* Create lock dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock size={18} className="text-amber-600" />
              Lock an accounting period
            </DialogTitle>
            <DialogDescription>
              While locked, no ledger journals can be posted with a date inside this range.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">From</Label>
                <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">To (inclusive)</Label>
                <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="rounded-xl" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Q1 2026 books closed and filed."
                className="rounded-xl text-sm min-h-[80px]"
                maxLength={500}
              />
            </div>
          </div>

          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setCreateOpen(false)} disabled={createLock.isPending}>
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => createLock.mutate()}
              disabled={createLock.isPending || !periodStart || !periodEnd}
            >
              {createLock.isPending ? 'Locking…' : 'Lock period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unlock confirmation */}
      <Dialog open={!!unlockTarget} onOpenChange={o => !o && setUnlockTarget(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              Unlock this period?
            </DialogTitle>
            <DialogDescription>
              Once unlocked, new ledger journals can be posted in this date range again. The unlock is logged in the audit trail.
            </DialogDescription>
          </DialogHeader>

          {unlockTarget && (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm space-y-1">
                <div className="font-semibold">
                  {dayLabel(unlockTarget.periodStart)} → {dayLabel(unlockTarget.periodEnd)}
                </div>
                <div className="text-xs text-muted-foreground">
                  Locked by {unlockTarget.lockedByName ?? 'system'} · {dateLabel(unlockTarget.lockedAt)}
                </div>
                {unlockTarget.lockReason && (
                  <div className="text-xs italic text-amber-800 mt-1">"{unlockTarget.lockReason}"</div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Reason for unlocking (recommended)</Label>
                <Textarea
                  value={unlockReason}
                  onChange={e => setUnlockReason(e.target.value)}
                  placeholder="e.g. Correcting a misclassified expense found during audit."
                  className="rounded-xl text-sm min-h-[80px]"
                  maxLength={500}
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={() => setUnlockTarget(null)} disabled={unlockMut.isPending}>
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-xl bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => unlockTarget && unlockMut.mutate(unlockTarget.id)}
              disabled={unlockMut.isPending}
            >
              {unlockMut.isPending ? 'Unlocking…' : 'Confirm unlock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
