import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Banknote, Hourglass, CheckCircle2, CreditCard, HandCoins,
  RefreshCcw, Filter, Inbox, AlertTriangle, Store,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface AdminStats {
  pending: { total: number; count: number };
  paidThisMonth: { total: number; paystack: number; cash: number; count: number };
}

interface PayoutRow {
  id: number;
  vendorId: number;
  vendorName: string;
  vendorPhone: string | null;
  totalAmount: number;
  paystackPortion: number;
  cashPortion: number;
  orderCount: number;
  status: 'pending' | 'paid';
  notes: string | null;
  requestedAt: string;
  paidAt: string | null;
}

const CEDI = (n: number) =>
  `GH₵${(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type StatusFilter = 'all' | 'pending' | 'paid';

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone: 'amber' | 'green';
}) {
  const tones = {
    amber: {
      border: 'border-amber-100',
      bg: 'bg-gradient-to-br from-amber-50 to-white',
      iconBg: 'bg-amber-100 text-amber-700',
      text: 'text-amber-700',
    },
    green: {
      border: 'border-green-100',
      bg: 'bg-gradient-to-br from-green-50 to-white',
      iconBg: 'bg-green-100 text-green-700',
      text: 'text-green-700',
    },
  }[tone];

  return (
    <Card className={`rounded-2xl border shadow-sm ${tones.border} ${tones.bg}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">{label}</p>
            <p className={`text-3xl font-bold mt-1.5 ${tones.text}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${tones.iconBg}`}>
            <Icon size={22} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: 'pending' | 'paid' }) {
  if (status === 'paid') {
    return (
      <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border border-green-200 gap-1 font-semibold">
        <CheckCircle2 size={12} /> Paid
      </Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border border-amber-200 gap-1 font-semibold">
      <Hourglass size={12} /> Pending
    </Badge>
  );
}

export default function AdminPayouts() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [confirmRow, setConfirmRow] = useState<PayoutRow | null>(null);

  const { data: stats, refetch: refetchStats, isLoading: statsLoading } = useQuery<AdminStats>({
    queryKey: ['admin-payout-stats'],
    queryFn: () => fetch(`${BASE}/api/payouts/admin/stats`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const listUrl =
    filter === 'all'
      ? `${BASE}/api/payouts/admin/list`
      : `${BASE}/api/payouts/admin/list?status=${filter}`;

  const { data: rows = [], refetch: refetchList, isLoading: listLoading } = useQuery<PayoutRow[]>({
    queryKey: ['admin-payout-list', filter],
    queryFn: () => fetch(listUrl).then(r => r.json()),
    refetchInterval: 30000,
  });

  const markPaid = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${BASE}/api/payouts/admin/${id}/pay`, { method: 'PATCH' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Failed');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-payout-stats'] });
      queryClient.invalidateQueries({ queryKey: ['admin-payout-list'] });
      queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
      toast({ title: 'Marked as Paid', description: 'Payout updated.' });
      setConfirmRow(null);
    },
    onError: (err: any) => {
      toast({
        title: 'Could not mark paid',
        description: err.message ?? 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleRefresh = () => {
    refetchStats();
    refetchList();
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold font-display">Vendor Payout Requests</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Approve and mark vendor payouts as paid. Paystack & cash portions track separately.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" className="rounded-xl" onClick={handleRefresh}>
                <RefreshCcw size={14} className="mr-1" /> Refresh
              </Button>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SummaryCard
              icon={Hourglass}
              tone="amber"
              label="Total Pending Payouts"
              value={statsLoading ? '…' : CEDI(stats?.pending.total ?? 0)}
              sub={`${stats?.pending.count ?? 0} request${(stats?.pending.count ?? 0) === 1 ? '' : 's'} awaiting payment`}
            />
            <SummaryCard
              icon={CheckCircle2}
              tone="green"
              label="Total Paid This Month"
              value={statsLoading ? '…' : CEDI(stats?.paidThisMonth.total ?? 0)}
              sub={`${stats?.paidThisMonth.count ?? 0} settled · ${CEDI(stats?.paidThisMonth.paystack ?? 0)} Paystack · ${CEDI(stats?.paidThisMonth.cash ?? 0)} Cash`}
            />
          </div>

          {/* Filter + Table */}
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Banknote size={18} className="text-green-600" />
                Requests
              </CardTitle>
              <div className="flex items-center gap-2">
                <Filter size={14} className="text-muted-foreground" />
                {(['all', 'pending', 'paid'] as StatusFilter[]).map(f => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? 'default' : 'outline'}
                    onClick={() => setFilter(f)}
                    className="rounded-xl capitalize h-8 text-xs"
                  >
                    {f}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {listLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
                  <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                  Loading…
                </div>
              ) : rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
                  <Inbox size={36} />
                  <p className="text-sm">No payout requests{filter !== 'all' ? ` with status "${filter}"` : ''}.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-gray-50/70">
                        <th className="text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Vendor</th>
                        <th className="text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Total Amount</th>
                        <th className="text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Paystack</th>
                        <th className="text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Cash</th>
                        <th className="text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Requested</th>
                        <th className="text-left font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Status</th>
                        <th className="text-right font-semibold text-xs uppercase tracking-wide text-muted-foreground px-4 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(r => (
                        <tr key={r.id} className="border-b border-border/60 hover:bg-gray-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Store size={14} className="text-primary" />
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">{r.vendorName}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {r.orderCount} order{r.orderCount === 1 ? '' : 's'}
                                  {r.vendorPhone ? ` · ${r.vendorPhone}` : ''}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="font-bold text-gray-900">{CEDI(r.totalAmount)}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center gap-1 font-semibold text-blue-700">
                              <CreditCard size={12} /> {CEDI(r.paystackPortion)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                              <HandCoins size={12} /> {CEDI(r.cashPortion)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {format(new Date(r.requestedAt), 'dd MMM yyyy, HH:mm')}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={r.status} />
                            {r.status === 'paid' && r.paidAt && (
                              <p className="text-[10px] text-muted-foreground mt-1">
                                paid {format(new Date(r.paidAt), 'dd MMM yyyy')}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {r.status === 'pending' ? (
                              <Button
                                size="sm"
                                className="rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold"
                                onClick={() => setConfirmRow(r)}
                                disabled={markPaid.isPending}
                              >
                                <CheckCircle2 size={14} className="mr-1" />
                                Mark as Paid
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

      {/* Confirmation Modal */}
      <Dialog open={!!confirmRow} onOpenChange={o => !o && setConfirmRow(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Mark Payout as Paid
            </DialogTitle>
            <DialogDescription>
              Confirm you've transferred the funds to the vendor. This action can't be undone.
            </DialogDescription>
          </DialogHeader>

          {confirmRow && (
            <div className="space-y-2 bg-gray-50 rounded-xl p-4 border border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Vendor</span>
                <span className="font-semibold text-gray-900">{confirmRow.vendorName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paystack portion</span>
                <span className="font-semibold text-blue-700">{CEDI(confirmRow.paystackPortion)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Cash portion</span>
                <span className="font-semibold text-amber-700">{CEDI(confirmRow.cashPortion)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-semibold text-gray-800">Total</span>
                <span className="font-bold text-green-700 text-lg">{CEDI(confirmRow.totalAmount)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setConfirmRow(null)}
              disabled={markPaid.isPending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white"
              onClick={() => confirmRow && markPaid.mutate(confirmRow.id)}
              disabled={markPaid.isPending}
            >
              {markPaid.isPending ? 'Marking…' : 'Confirm Paid'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
