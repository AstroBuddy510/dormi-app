import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, DollarSign, ShoppingBag, Truck, Users, AlertTriangle, Download, RefreshCcw, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchLogoBase64 } from '@/lib/pdfLogo';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiFetch(path: string) {
  return fetch(`${BASE}/api${path}`).then(r => r.json());
}

function fmt(n: number | null | undefined) {
  return `GH₵ ${(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Period = 'today' | 'week' | 'month' | 'custom';

function getPeriodDates(period: Period, customFrom: string, customTo: string) {
  const now = new Date();
  const pad = (d: Date) => d.toISOString().slice(0, 10);
  if (period === 'today') {
    const s = pad(now);
    return { from: `${s}T00:00:00.000Z`, to: `${s}T23:59:59.999Z` };
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: `${pad(d)}T00:00:00.000Z`, to: `${pad(now)}T23:59:59.999Z` };
  }
  if (period === 'month') {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: `${pad(d)}T00:00:00.000Z`, to: `${pad(now)}T23:59:59.999Z` };
  }
  return { from: `${customFrom}T00:00:00.000Z`, to: `${customTo}T23:59:59.999Z` };
}

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary' }: any) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl bg-secondary ${color}`}>
            <Icon size={18} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminFinance() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = getPeriodDates(period, customFrom, customTo);

  const { data: stats, isLoading, refetch } = useQuery<any>({
    queryKey: ['finance-stats', from, to],
    queryFn: () => apiFetch(`/finance/stats?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
    enabled: period !== 'custom' || (!!customFrom && !!customTo),
  });

  const handleExportCSV = () => {
    const url = `${BASE}/api/finance/export/csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    window.open(url, '_blank');
    toast({ title: 'Downloading CSV report...' });
  };

  const handleExportPDF = () => {
    if (!stats) return;
    void (async () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const green = [22, 163, 74] as [number, number, number];
    const dark  = [30, 30, 30]  as [number, number, number];
    const grey  = [100, 100, 100] as [number, number, number];

    const periodLabel =
      period === 'today' ? 'Today' :
      period === 'week'  ? 'This Week' :
      period === 'month' ? 'This Month' :
      `${customFrom} – ${customTo}`;

    const fmtP = (n: number) =>
      `GHs ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Header bar
    doc.setFillColor(...green);
    doc.rect(0, 0, 210, 22, 'F');
    const logo = await fetchLogoBase64().catch(() => null);
    if (logo) doc.addImage(logo, 'PNG', 10, 4, 13, 13);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Dormi — Finance Report', logo ? 26 : 14, 14);

    // Sub-header
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${periodLabel}   |   ${from.slice(0, 10)} to ${to.slice(0, 10)}   |   Generated: ${new Date().toLocaleString()}`, 14, 20);

    let y = 32;

    // KPI summary row
    const kpis = [
      { label: 'Total Revenue',  value: fmtP(stats.totalRevenue),  note: `${stats.ordersCount} orders` },
      { label: 'Net Profit',     value: fmtP(stats.netProfit),     note: stats.netProfit >= 0 ? 'Positive' : 'Deficit' },
      { label: 'Cash Collected', value: fmtP(stats.cashBalance),   note: 'Cash on delivery' },
      { label: 'Online Payments',value: fmtP(stats.paystackBalance), note: 'Paystack' },
    ];
    const colW = (210 - 28) / kpis.length;
    kpis.forEach((kpi, i) => {
      const x = 14 + i * colW;
      doc.setFillColor(245, 247, 250);
      doc.roundedRect(x, y, colW - 3, 18, 2, 2, 'F');
      doc.setTextColor(...grey);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(kpi.label.toUpperCase(), x + 3, y + 5);
      doc.setTextColor(...dark);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(kpi.value, x + 3, y + 11);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...grey);
      doc.text(kpi.note, x + 3, y + 16);
    });
    y += 25;

    // Revenue breakdown table
    doc.setTextColor(...dark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Revenue Breakdown', 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Revenue Stream', 'Amount (GHs)']],
      body: [
        ['Service Charge',      fmtP(stats.serviceChargeRevenue)],
        ['Delivery Fees',       fmtP(stats.deliveryFeeRevenue)],
        ['Vendor Commission',   fmtP(stats.vendorCommissionRevenue)],
        ['Courier Commission',  fmtP(stats.courierCommissionRevenue)],
        ['TOTAL REVENUE',       fmtP(stats.totalRevenue)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: green, textColor: 255, fontStyle: 'bold' },
      bodyStyles: { textColor: dark },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 4) {
          data.cell.styles.fillColor = [220, 252, 231];
          data.cell.styles.textColor = [21, 128, 61] as any;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Costs & payouts table
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Costs & Payouts', 14, y);
    y += 3;
    autoTable(doc, {
      startY: y,
      head: [['Item', 'Amount (GHs)']],
      body: [
        ['Total Expenses',  fmtP(stats.totalExpenses)],
        ['  of which: Utilities', fmtP(stats.utilitiesExpenses)],
        ['Total Payroll',   fmtP(stats.totalPayroll)],
        ['NET PROFIT',      fmtP(stats.netProfit)],
      ],
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [239, 68, 68] as [number,number,number], textColor: 255, fontStyle: 'bold' },
      bodyStyles: { textColor: dark },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === 3) {
          const color: [number,number,number] = stats.netProfit >= 0 ? [219, 234, 254] : [254, 226, 226];
          const textColor: [number,number,number] = stats.netProfit >= 0 ? [29, 78, 216] : [185, 28, 28];
          data.cell.styles.fillColor = color;
          data.cell.styles.textColor = textColor as any;
          data.cell.styles.fontStyle = 'bold';
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Expenses by type (if any)
    if (stats.expenseByType && Object.keys(stats.expenseByType).length > 0) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Expenses by Type', 14, y);
      y += 3;
      autoTable(doc, {
        startY: y,
        head: [['Expense Type', 'Amount (GHs)']],
        body: Object.entries(stats.expenseByType as Record<string, number>).map(
          ([type, amt]) => [type, fmtP(amt)]
        ),
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [107, 114, 128] as [number,number,number], textColor: 255, fontStyle: 'bold' },
        bodyStyles: { textColor: dark },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    }

    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(...grey);
      doc.text(`Dormi — Confidential   |   Page ${i} of ${pageCount}`, 14, 290);
    }

    const tag = period === 'custom' ? `${customFrom}_${customTo}` : period;
    doc.save(`finance_report_${tag}_${new Date().toISOString().slice(0, 10)}.pdf`);
    toast({ title: 'PDF report downloaded' });
  })();
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-bold font-display">Finance Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Revenue, expenses & net profit</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['today', 'week', 'month', 'custom'] as Period[]).map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant={period === p ? 'default' : 'outline'}
                  onClick={() => setPeriod(p)}
                  className="rounded-xl capitalize"
                >
                  {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : 'Custom'}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="rounded-xl" onClick={() => refetch()}>
                <RefreshCcw size={14} className="mr-1" /> Refresh
              </Button>
              <Button size="sm" className="rounded-xl bg-green-600 hover:bg-green-700" onClick={handleExportCSV}>
                <Download size={14} className="mr-1" /> CSV
              </Button>
              <Button size="sm" variant="outline" className="rounded-xl border-red-200 text-red-700 hover:bg-red-50" onClick={handleExportPDF} disabled={!stats}>
                <FileText size={14} className="mr-1" /> PDF
              </Button>
            </div>
          </div>

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

          {isLoading ? (
            <div className="flex items-center justify-center h-60 text-muted-foreground">Loading financials...</div>
          ) : stats ? (
            <>
              {stats.utilitiesFlag && (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-xl px-4 py-3 text-sm">
                  <AlertTriangle size={16} className="shrink-0" />
                  <span><strong>Utilities alert:</strong> Utilities expenses are over 20% of total revenue for this period.</span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={TrendingUp} label="Total Revenue" value={fmt(stats.totalRevenue)} sub={`${stats.ordersCount} delivered orders`} color="text-green-600" />
                <StatCard icon={DollarSign} label="Net Profit" value={fmt(stats.netProfit)} sub="Revenue − Expenses − Payroll" color={stats.netProfit >= 0 ? 'text-blue-600' : 'text-red-500'} />
                <StatCard icon={Users} label="Cash Collected" value={fmt(stats.cashBalance)} sub="Paid in cash" />
                <StatCard icon={DollarSign} label="Paystack Balance" value={fmt(stats.paystackBalance)} sub="Online payments" />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Revenue Breakdown</CardTitle>
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

                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Costs & Payouts</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      { label: 'Total Expenses', value: stats.totalExpenses, icon: '🧾' },
                      { label: 'Utilities', value: stats.utilitiesExpenses, icon: '💡', flag: stats.utilitiesFlag },
                      { label: 'Total Payroll', value: stats.totalPayroll, icon: '👷' },
                    ].map(({ label, value, icon, flag }) => (
                      <div key={label} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                        <span className="text-sm flex items-center gap-1.5">
                          {icon} {label}
                          {flag && <Badge variant="destructive" className="text-xs py-0 px-1.5">High</Badge>}
                        </span>
                        <span className="font-semibold text-sm text-red-600">{fmt(value)}</span>
                      </div>
                    ))}
                    <div className={`flex items-center justify-between py-2 font-bold ${stats.netProfit >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      <span>Net Profit</span>
                      <span>{fmt(stats.netProfit)}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {stats.expenseByType && Object.keys(stats.expenseByType).length > 0 && (
                <Card className="rounded-2xl border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Expenses by Type</CardTitle>
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
            </>
          ) : (
            <div className="text-center text-muted-foreground py-20">No data available for this period.</div>
          )}
        </div>
      </div>
    </div>
  );
}
