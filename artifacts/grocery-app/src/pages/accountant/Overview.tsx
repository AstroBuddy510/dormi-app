import { AccountantSidebar } from '@/components/layout/AccountantSidebar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Receipt, Wallet, AlertTriangle } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiFetch(path: string) {
  return fetch(`${BASE}/api${path}`).then(r => r.json());
}

function fmt(n: number) { return `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function monthRange() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return { from: `${start}T00:00:00.000Z`, to: now.toISOString() };
}

export default function AccountantOverview() {
  const { from, to } = monthRange();

  const { data: stats } = useQuery<any>({
    queryKey: ['finance-stats-accountant', from, to],
    queryFn: () => apiFetch(`/finance/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
  });

  const { data: floats = [] } = useQuery<any[]>({
    queryKey: ['floats'],
    queryFn: () => apiFetch('/float'),
  });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees'],
    queryFn: () => apiFetch('/employees'),
  });

  const openFloats = (floats as any[]).filter(f => !f.reconciled);
  const openFloatTotal = openFloats.reduce((s: number, f: any) => s + f.amount, 0);
  const totalPayroll = (employees as any[]).filter(e => e.isActive).reduce((s: number, e: any) => {
    return s + (e.salaryType === 'daily' ? e.salaryAmount * 26 : e.salaryAmount);
  }, 0);

  const StatCard = ({ icon: Icon, label, value, sub, color = 'text-primary' }: any) => (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl bg-secondary ${color}`}><Icon size={18} /></div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AccountantSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold font-display">Finance Overview</h1>
            <p className="text-muted-foreground text-sm mt-0.5">This month's snapshot</p>
          </div>

          {openFloats.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              <span><strong>{openFloats.length} unreconciled float{openFloats.length > 1 ? 's' : ''}</strong> totalling {fmt(openFloatTotal)} need attention.</span>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
            <StatCard icon={TrendingUp} label="Revenue (Month)" value={stats ? fmt(stats.totalRevenue) : '—'} sub={`${stats?.ordersCount ?? 0} delivered orders`} color="text-green-600" />
            <StatCard icon={DollarSign} label="Net Profit" value={stats ? fmt(stats.netProfit) : '—'} sub="Revenue − Expenses − Payroll" color={!stats || stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-500'} />
            <StatCard icon={Receipt} label="Total Expenses" value={stats ? fmt(stats.totalExpenses) : '—'} sub="All recorded expenses" color="text-orange-600" />
            <StatCard icon={Wallet} label="Open Floats" value={fmt(openFloatTotal)} sub={`${openFloats.length} pending`} color="text-amber-600" />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Estimated Payroll</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-blue-700">{fmt(totalPayroll)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{(employees as any[]).filter(e => e.isActive).length} active employees</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-sm">Wallet Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Cash Collected</span>
                  <span className="font-semibold">{stats ? fmt(stats.cashBalance) : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paystack</span>
                  <span className="font-semibold">{stats ? fmt(stats.paystackBalance) : '—'}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
