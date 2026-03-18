import { useState } from 'react';
import { AccountantSidebar } from '@/components/layout/AccountantSidebar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  TrendingUp, DollarSign, Receipt, Wallet, AlertTriangle,
  Download, RefreshCcw, FileText, CreditCard, Banknote,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiFetch(path: string) {
  return fetch(`${BASE}/api${path}`).then(r => r.json());
}

function fmt(n: number | null | undefined) {
  return `GH\u20B5 ${(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtRaw(n: number | null | undefined) {
  return (n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Period = 'today' | 'week' | 'month' | 'custom';

function getPeriodDates(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  const pad = (d: Date) => d.toISOString().slice(0, 10);
  if (period === 'today') {
    const s = pad(now);
    return { from: `${s}T00:00:00.000Z`, to: `${s}T23:59:59.999Z`, label: 'Today' };
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: `${pad(d)}T00:00:00.000Z`, to: now.toISOString(), label: 'Last 7 Days' };
  }
  if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: `${pad(d)}T00:00:00.000Z`, to: now.toISOString(), label: 'This Month' };
  }
  return {
    from: `${customFrom}T00:00:00.000Z`,
    to: `${customTo}T23:59:59.999Z`,
    label: customFrom && customTo ? `${customFrom} – ${customTo}` : 'Custom Range',
  };
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: any) {
  return (
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
}

function exportPDF(stats: any, periodLabel: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const GREEN = [22, 163, 74] as [number, number, number];
  const GREEN_LIGHT = [240, 253, 244] as [number, number, number];
  const DARK = [17, 24, 39] as [number, number, number];
  const GRAY = [107, 114, 128] as [number, number, number];
  const pageW = doc.internal.pageSize.getWidth();

  // ── Header bar ────────────────────────────────────────────────────────
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('GrocerEase Accra', 14, 12);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text('Fresh groceries delivered to your estate.', 14, 18);

  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString('en-GH')}`, pageW - 14, 12, { align: 'right' });
  doc.text('Finance & Payouts Report', pageW - 14, 18, { align: 'right' });

  // ── Title ─────────────────────────────────────────────────────────────
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Financial Statement', 14, 40);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...GRAY);
  doc.text(`Period: ${periodLabel}`, 14, 47);

  // ── Divider ───────────────────────────────────────────────────────────
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.5);
  doc.line(14, 51, pageW - 14, 51);

  // ── Performance Summary ───────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Performance Summary', 14, 59);

  autoTable(doc, {
    startY: 63,
    head: [['Metric', 'Value']],
    body: [
      ['Total Revenue', `GH\u20B5 ${fmtRaw(stats.totalRevenue)}`],
      ['Total Expenses', `GH\u20B5 ${fmtRaw(stats.totalExpenses)}`],
      ['Total Payroll Paid', `GH\u20B5 ${fmtRaw(stats.totalPayroll)}`],
      ['Net Profit', `GH\u20B5 ${fmtRaw(stats.netProfit)}`],
      ['Orders Delivered', `${stats.ordersCount ?? 0}`],
    ],
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    alternateRowStyles: { fillColor: GREEN_LIGHT },
    columnStyles: { 0: { cellWidth: 90 }, 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  // ── Revenue Breakdown ──────────────────────────────────────────────────
  const afterSummary = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Revenue Breakdown', 14, afterSummary);

  autoTable(doc, {
    startY: afterSummary + 4,
    head: [['Revenue Source', 'Amount (GH\u20B5)']],
    body: [
      ['Service Charge', fmtRaw(stats.serviceChargeRevenue)],
      ['Delivery Fees', fmtRaw(stats.deliveryFeeRevenue)],
      ['Vendor Commission', fmtRaw(stats.vendorCommissionRevenue)],
      ['Courier Commission', fmtRaw(stats.courierCommissionRevenue)],
    ],
    foot: [['Total Revenue', fmtRaw(stats.totalRevenue)]],
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    footStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    alternateRowStyles: { fillColor: GREEN_LIGHT },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // ── Collections ────────────────────────────────────────────────────────
  const afterRevenue = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Collections by Payment Method', 14, afterRevenue);

  autoTable(doc, {
    startY: afterRevenue + 4,
    head: [['Payment Method', 'Amount (GH\u20B5)']],
    body: [
      ['Cash Collected', fmtRaw(stats.cashBalance)],
      ['Paystack (Online)', fmtRaw(stats.paystackBalance)],
    ],
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    alternateRowStyles: { fillColor: GREEN_LIGHT },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // ── Costs & Payroll ───────────────────────────────────────────────────
  const afterCollections = (doc as any).lastAutoTable.finalY + 8;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DARK);
  doc.text('Costs & Payroll', 14, afterCollections);

  const expenseRows = stats.expenseByType
    ? Object.entries(stats.expenseByType as Record<string, number>).map(([type, amt]) => [type, fmtRaw(amt)])
    : [];

  autoTable(doc, {
    startY: afterCollections + 4,
    head: [['Item', 'Amount (GH\u20B5)']],
    body: [
      ...expenseRows,
      ['Total Expenses', fmtRaw(stats.totalExpenses)],
      ['Payroll Paid', fmtRaw(stats.totalPayroll)],
    ],
    foot: [['Net Profit', fmtRaw(stats.netProfit)]],
    headStyles: { fillColor: GREEN, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: DARK },
    footStyles: {
      fillColor: stats.netProfit >= 0 ? [37, 99, 235] : [220, 38, 38],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    alternateRowStyles: { fillColor: GREEN_LIGHT },
    columnStyles: { 1: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  // ── Footer ─────────────────────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFillColor(...GREEN);
  doc.rect(0, pageH - 14, pageW, 14, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(255, 255, 255);
  doc.text('GrocerEase Accra  |  Confidential – For Internal Use Only', 14, pageH - 5);
  doc.text('Page 1 of 1', pageW - 14, pageH - 5, { align: 'right' });

  doc.save(`GrocerEase_Finance_Report_${periodLabel.replace(/\s+/g, '_')}.pdf`);
}

export default function AccountantOverview() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to, label: periodLabel } = getPeriodDates(period, customFrom, customTo);

  const { data: stats, isLoading, refetch } = useQuery<any>({
    queryKey: ['finance-stats-accountant', from, to],
    queryFn: () => apiFetch(`/finance/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    enabled: period !== 'custom' || (!!customFrom && !!customTo),
  });

  const { data: floats = [] } = useQuery<any[]>({
    queryKey: ['floats'],
    queryFn: () => apiFetch('/float'),
  });

  const openFloats = (floats as any[]).filter(f => !f.reconciled);
  const openFloatTotal = openFloats.reduce((s: number, f: any) => s + f.amount, 0);

  const handleExportCSV = () => {
    const url = `${BASE}/api/finance/export/csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    window.open(url, '_blank');
    toast({ title: 'Downloading CSV report…' });
  };

  const handleExportPDF = () => {
    if (!stats) { toast({ title: 'No data', description: 'Load a period first.', variant: 'destructive' }); return; }
    exportPDF(stats, periodLabel);
    toast({ title: 'PDF downloaded', description: `GrocerEase_Finance_Report_${periodLabel.replace(/\s+/g, '_')}.pdf` });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AccountantSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold font-display">Finance Overview</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Revenue, expenses &amp; net profit</p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? 'default' : 'outline'}
                  onClick={() => setPeriod(p)}
                  className={`rounded-xl capitalize ${period === p ? 'bg-green-600 hover:bg-green-700' : ''}`}
                >
                  {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => refetch()}>
                <RefreshCcw size={14} className="mr-1" /> Refresh
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl border-green-200 text-green-700 hover:bg-green-50" onClick={handleExportCSV}>
                <Download size={14} className="mr-1" /> CSV
              </Button>
              <Button size="sm" className="rounded-xl bg-blue-600 hover:bg-blue-700" onClick={handleExportPDF}>
                <FileText size={14} className="mr-1" /> PDF
              </Button>
            </div>
          </div>

          {/* Custom date range */}
          {period === 'custom' && (
            <div className="flex gap-4 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="h-9 rounded-lg w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="h-9 rounded-lg w-40" />
              </div>
            </div>
          )}

          {/* Unreconciled floats alert */}
          {openFloats.length > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm">
              <AlertTriangle size={16} className="shrink-0" />
              <span>
                <strong>{openFloats.length} unreconciled float{openFloats.length > 1 ? 's' : ''}</strong>
                {' '}totalling {fmt(openFloatTotal)} need attention.
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center h-60 text-muted-foreground">Loading financials…</div>
          ) : stats && !stats.error ? (
            <>
              {stats.utilitiesFlag && (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-sm">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span><strong>Utilities alert:</strong> Utilities expenses are over 20% of total revenue for this period.</span>
                </div>
              )}

              {/* Key metrics */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={TrendingUp} label="Total Revenue" value={fmt(stats.totalRevenue)} sub={`${stats.ordersCount ?? 0} delivered orders`} color="text-green-600" />
                <StatCard icon={DollarSign} label="Net Profit" value={fmt(stats.netProfit)} sub="Revenue − Expenses − Payroll" color={(stats.netProfit ?? 0) >= 0 ? 'text-blue-600' : 'text-red-500'} />
                <StatCard icon={Banknote} label="Cash Collected" value={fmt(stats.cashBalance)} sub="Paid in cash" color="text-slate-600" />
                <StatCard icon={CreditCard} label="Paystack Balance" value={fmt(stats.paystackBalance)} sub="Online payments" color="text-indigo-600" />
              </div>

              {/* Breakdown cards */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Revenue Breakdown */}
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <TrendingUp size={15} className="text-green-600" /> Revenue Breakdown
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: 'Service Charge', value: stats.serviceChargeRevenue, icon: '💼' },
                      { label: 'Delivery Fees', value: stats.deliveryFeeRevenue, icon: '🚚' },
                      { label: 'Vendor Commission', value: stats.vendorCommissionRevenue, icon: '🏪' },
                      { label: 'Courier Commission', value: stats.courierCommissionRevenue, icon: '📦' },
                    ].map(({ label, value, icon }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <span className="text-sm">{icon} {label}</span>
                        <span className="font-semibold text-sm">{fmt(value)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 font-bold text-green-700">
                      <span>Total Revenue</span>
                      <span>{fmt(stats.totalRevenue)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Costs & Payroll */}
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Receipt size={15} className="text-orange-500" /> Costs &amp; Payroll
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: 'Total Expenses', value: stats.totalExpenses, icon: '🧾' },
                      { label: 'Utilities', value: stats.utilitiesExpenses, icon: '💡', flag: stats.utilitiesFlag },
                      { label: 'Payroll Paid', value: stats.totalPayroll, icon: '👷' },
                    ].map(({ label, value, icon, flag }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <span className="text-sm flex items-center gap-1.5">
                          {icon} {label}
                          {flag && <Badge variant="destructive" className="text-xs py-0 px-1.5">High</Badge>}
                        </span>
                        <span className="font-semibold text-sm text-red-600">{fmt(value)}</span>
                      </div>
                    ))}
                    <div className={`flex items-center justify-between py-2 font-bold ${(stats.netProfit ?? 0) >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      <span>Net Profit</span>
                      <span>{fmt(stats.netProfit)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Expenses by type */}
              {stats.expenseByType && Object.keys(stats.expenseByType).length > 0 && (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet size={15} className="text-orange-500" /> Expenses by Type
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {Object.entries(stats.expenseByType as Record<string, number>).map(([type, amount]) => (
                        <div key={type} className="bg-secondary rounded-xl p-3">
                          <p className="text-xs text-muted-foreground">{type}</p>
                          <p className="font-semibold text-sm mt-0.5">{fmt(amount)}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Open floats summary */}
              {openFloats.length > 0 && (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet size={15} className="text-amber-500" /> Unreconciled Floats
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {openFloats.map((f: any) => (
                      <div key={f.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                        <span>{f.description || `Float #${f.id}`}</span>
                        <span className="font-semibold text-amber-700">{fmt(f.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between py-2 font-bold text-amber-700">
                      <span>Total Open</span>
                      <span>{fmt(openFloatTotal)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center text-muted-foreground py-20">No data available for this period.</div>
          )}
        </div>
      </div>
    </div>
  );
}
