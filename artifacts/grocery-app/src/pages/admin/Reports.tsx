import { useState, useMemo } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useListOrders, useListRiders } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart3, Users, Truck, PhoneCall, Building2, Download,
  Star, Trophy, TrendingUp, Package, CheckCircle, XCircle,
  Calendar, Clock3, ChevronDown, ArrowLeft,
} from 'lucide-react';
import { format, parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval, subMonths } from 'date-fns';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type DatePreset = 'today' | 'week' | 'month' | '3months' | 'custom';

const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today', week: 'This Week', month: 'This Month', '3months': 'Last 3 Months', custom: 'Custom Range',
};

function getPresetRange(preset: DatePreset): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'today')    return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === 'week')     return { from: startOfWeek(now, { weekStartsOn: 1 }), to: endOfWeek(now, { weekStartsOn: 1 }) };
  if (preset === 'month')    return { from: startOfMonth(now), to: endOfMonth(now) };
  if (preset === '3months')  return { from: startOfMonth(subMonths(now, 2)), to: endOfMonth(now) };
  return { from: startOfMonth(now), to: endOfMonth(now) };
}

function useReportData(fromDate: Date, toDate: Date) {
  const { data: allOrders = [] } = useListOrders();
  const { data: riders = [] }    = useListRiders();
  const { data: vendors = [] }   = useQuery<any[]>({ queryKey: ['/api/vendors'], queryFn: () => fetch(`${BASE}/api/vendors`).then(r => r.json()) });
  const { data: agents = [] }    = useQuery<any[]>({ queryKey: ['/api/agents'], queryFn: () => fetch(`${BASE}/api/agents`).then(r => r.json()) });
  const { data: partners = [] }  = useQuery<any[]>({ queryKey: ['/api/delivery-partners'], queryFn: () => fetch(`${BASE}/api/delivery-partners`).then(r => r.json()) });

  const orders = useMemo(() => {
    return allOrders.filter(o => {
      const d = parseISO(o.createdAt);
      return isWithinInterval(d, { start: fromDate, end: toDate });
    });
  }, [allOrders, fromDate, toDate]);

  const deliveredOrders = orders.filter(o => o.status === 'delivered');

  /* ── Residents ── */
  const residentMap = useMemo(() => {
    const m: Record<number, {
      id: number; name: string; phone: string; estate: string;
      orders: number; delivered: number; spend: number; itemsCount: number; lastOrderDate: string;
    }> = {};
    for (const o of orders) {
      if (!o.residentId) continue;
      if (!m[o.residentId]) m[o.residentId] = {
        id: o.residentId, name: (o as any).residentName || '—', phone: (o as any).residentPhone || '',
        estate: (o as any).residentEstate || '—',
        orders: 0, delivered: 0, spend: 0, itemsCount: 0, lastOrderDate: o.createdAt,
      };
      m[o.residentId].orders += 1;
      if (o.status === 'delivered') {
        m[o.residentId].delivered += 1;
        m[o.residentId].spend += o.total;
      }
      m[o.residentId].itemsCount += o.items?.length ?? 0;
      if (o.createdAt > m[o.residentId].lastOrderDate) m[o.residentId].lastOrderDate = o.createdAt;
    }
    return Object.values(m).sort((a, b) => b.spend - a.spend);
  }, [orders]);

  /* ── Vendors ── */
  const vendorMap = useMemo(() => {
    const m: Record<number, {
      id: number; name: string; orders: number; revenue: number;
      subtotal: number; itemsSold: number; residents: Set<number>;
    }> = {};
    for (const v of vendors as any[]) m[v.id] = { id: v.id, name: v.name, orders: 0, revenue: 0, subtotal: 0, itemsSold: 0, residents: new Set() };
    for (const o of deliveredOrders) {
      if (o.vendorId && m[o.vendorId]) {
        m[o.vendorId].orders  += 1;
        m[o.vendorId].revenue += o.total;
        m[o.vendorId].subtotal += o.subtotal ?? 0;
        m[o.vendorId].itemsSold += o.items?.reduce((s: number, it: any) => s + (it.quantity ?? 1), 0) ?? 0;
        if (o.residentId) m[o.vendorId].residents.add(o.residentId);
      }
    }
    return Object.values(m)
      .filter(v => v.orders > 0)
      .map(v => ({ ...v, uniqueCustomers: v.residents.size, avgOrder: v.revenue / (v.orders || 1) }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [vendors, deliveredOrders]);

  /* ── Riders ── */
  const riderMap = useMemo(() => {
    const m: Record<number, {
      id: number; name: string; deliveries: number; earnings: number;
      singleDeliveries: number; bulkDeliveries: number;
    }> = {};
    for (const r of riders as any[]) m[r.id] = { id: r.id, name: r.name, deliveries: 0, earnings: 0, singleDeliveries: 0, bulkDeliveries: 0 };
    for (const o of deliveredOrders) {
      if (o.riderId && m[o.riderId]) {
        m[o.riderId].deliveries += 1;
        m[o.riderId].earnings   += o.deliveryFee ?? 0;
        if ((o as any).orderType === 'block') m[o.riderId].bulkDeliveries += 1;
        else m[o.riderId].singleDeliveries += 1;
      }
    }
    return Object.values(m)
      .filter(r => r.deliveries > 0)
      .map(r => ({ ...r, avgFee: r.earnings / (r.deliveries || 1) }))
      .sort((a, b) => b.deliveries - a.deliveries);
  }, [riders, deliveredOrders]);

  /* ── Agents ── */
  const agentMap = useMemo(() => {
    const m: Record<number, { id: number; name: string; orders: number; value: number }> = {};
    for (const a of agents as any[]) m[a.id] = { id: a.id, name: a.name, orders: 0, value: 0 };
    for (const o of orders.filter(x => x.callOnly)) {
      const agentId = (o as any).agentId;
      if (agentId && m[agentId]) { m[agentId].orders += 1; m[agentId].value += o.total; }
    }
    const callOrders = orders.filter(x => x.callOnly);
    return { agents: Object.values(m).filter(a => a.orders > 0).sort((a, b) => b.orders - a.orders), callOrders };
  }, [agents, orders]);

  /* ── Delivery Partners ── */
  const partnerMap = useMemo(() => {
    const m: Record<number, { id: number; name: string; outsourced: number; fulfilled: number; pending: number }> = {};
    for (const p of partners as any[]) m[p.id] = { id: p.id, name: p.name, outsourced: 0, fulfilled: 0, pending: 0 };
    for (const o of orders.filter(x => (x as any).orderType === 'third_party')) {
      const pid = (o as any).deliveryPartnerId;
      if (pid && m[pid]) {
        m[pid].outsourced += 1;
        if (o.status === 'delivered') m[pid].fulfilled += 1;
        else m[pid].pending += 1;
      }
    }
    return Object.values(m).filter(p => p.outsourced > 0).sort((a, b) => b.outsourced - a.outsourced);
  }, [partners, orders]);

  return { orders, deliveredOrders, residentMap, vendorMap, riderMap, agentMap, partnerMap };
}

/* ── PDF Export ─────────────────────────────────────────── */
async function exportPDF(section: string, rows: any[], columns: string[], title: string, dateLabel: string) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(18);
  doc.setTextColor(22, 163, 74);
  doc.text('Dormi', 14, 20);

  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(`${title} Report`, 14, 29);

  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Period: ${dateLabel}`, 14, 36);
  doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}`, 14, 41);

  autoTable(doc, {
    startY: 48,
    head: [columns],
    body: rows,
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [22, 163, 74], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 250, 246] },
  });

  doc.save(`grocerease-${section}-report-${format(new Date(), 'yyyyMMdd')}.pdf`);
}

/* ── Rank badge ─────────────────────────────────────────── */
function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy size={16} className="text-yellow-500" />;
  if (rank === 2) return <Trophy size={16} className="text-gray-400" />;
  if (rank === 3) return <Trophy size={16} className="text-amber-600" />;
  return <span className="text-xs text-muted-foreground font-mono w-4 text-center">{rank}</span>;
}

/* ── Section card ───────────────────────────────────────── */
function ReportCard({ title, icon: Icon, color, children, count, onExport }: any) {
  return (
    <Card className="rounded-2xl shadow-sm border-border/50 overflow-hidden">
      <CardHeader className={cn('px-5 py-4 border-b border-border/50', color)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon size={18} />
            <CardTitle className="text-base font-bold">{title}</CardTitle>
            {count !== undefined && (
              <span className="text-xs bg-white/30 rounded-full px-2 py-0.5 font-semibold">{count} records</span>
            )}
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg gap-1.5 bg-white/60 hover:bg-white border-white/60" onClick={onExport}>
            <Download size={12} /> PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">{children}</CardContent>
    </Card>
  );
}

const TH = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={cn('px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-gray-50', right && 'text-right')}>{children}</th>
);
const TD = ({ children, right, bold, muted, green }: any) => (
  <td className={cn('px-4 py-2.5 text-sm border-b border-border/30', right && 'text-right', bold && 'font-semibold', muted && 'text-muted-foreground', green && 'text-green-700 font-bold font-mono')}>
    {children}
  </td>
);

/* ── Main Page ──────────────────────────────────────────── */
export default function AdminReports() {
  const [preset, setPreset]   = useState<DatePreset>('month');
  const [fromStr, setFromStr] = useState('');
  const [toStr, setToStr]     = useState('');
  const [showPresets, setShowPresets] = useState(false);
  const [tab, setTab]         = useState<'residents' | 'vendors' | 'riders' | 'agents' | 'partners'>('residents');
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);

  const { from, to } = useMemo(() => {
    if (preset === 'custom') {
      return {
        from: fromStr ? startOfDay(parseISO(fromStr)) : startOfMonth(new Date()),
        to:   toStr   ? endOfDay(parseISO(toStr))     : endOfMonth(new Date()),
      };
    }
    return getPresetRange(preset);
  }, [preset, fromStr, toStr]);

  const dateLabel = preset === 'custom'
    ? `${fromStr || '?'} → ${toStr || '?'}`
    : `${PRESET_LABELS[preset]}: ${format(from, 'dd MMM yyyy')} – ${format(to, 'dd MMM yyyy')}`;

  const { orders, deliveredOrders, residentMap, vendorMap, riderMap, agentMap, partnerMap } = useReportData(from, to);

  const tabs = [
    { id: 'residents', label: 'Residents', icon: Users, color: 'text-violet-700 bg-violet-50 border-violet-100' },
    { id: 'vendors',   label: 'Vendors',   icon: Package, color: 'text-blue-700 bg-blue-50 border-blue-100' },
    { id: 'riders',    label: 'Riders',    icon: Truck, color: 'text-green-700 bg-green-50 border-green-100' },
    { id: 'agents',    label: 'Call Agents', icon: PhoneCall, color: 'text-pink-700 bg-pink-50 border-pink-100' },
    { id: 'partners',  label: 'Delivery Cos.', icon: Building2, color: 'text-amber-700 bg-amber-50 border-amber-100' },
  ] as const;

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
                <BarChart3 size={26} className="text-primary" /> Transaction Reports
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {orders.length} orders · {deliveredOrders.length} delivered · in period
              </p>
            </div>

            {/* Date Preset Picker */}
            <div className="relative">
              <button
                onClick={() => setShowPresets(v => !v)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-border rounded-xl text-sm font-medium shadow-sm hover:border-primary/40 transition-colors"
              >
                <Calendar size={14} className="text-primary" />
                <span>{PRESET_LABELS[preset]}</span>
                <ChevronDown size={13} className={cn('text-muted-foreground transition-transform', showPresets && 'rotate-180')} />
              </button>
              {showPresets && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-2xl shadow-lg z-20 p-2 min-w-[180px]">
                  {(Object.keys(PRESET_LABELS) as DatePreset[]).map(p => (
                    <button
                      key={p}
                      onClick={() => { setPreset(p); setShowPresets(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2 rounded-xl text-sm transition-colors',
                        preset === p ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-gray-50 text-gray-700',
                      )}
                    >
                      {PRESET_LABELS[p]}
                    </button>
                  ))}
                  {preset === 'custom' && (
                    <div className="border-t border-border mt-2 pt-2 space-y-1 px-1">
                      <input type="date" value={fromStr} onChange={e => setFromStr(e.target.value)}
                        className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-gray-50" />
                      <input type="date" value={toStr} min={fromStr} onChange={e => setToStr(e.target.value)}
                        className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-gray-50" />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Summary strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Orders',     value: orders.length,                      icon: TrendingUp, color: 'text-blue-600 bg-blue-50' },
              { label: 'Delivered',        value: deliveredOrders.length,             icon: CheckCircle, color: 'text-green-600 bg-green-50' },
              { label: 'Active Residents', value: residentMap.length,                 icon: Users, color: 'text-violet-600 bg-violet-50' },
              { label: 'Total Revenue',    value: `GHs ${orders.reduce((s, o) => s + (o.status === 'delivered' ? o.total : 0), 0).toFixed(2)}`, icon: BarChart3, color: 'text-emerald-600 bg-emerald-50' },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="rounded-2xl border-border/50 shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={cn('p-2 rounded-xl', color)}><Icon size={16} /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-bold text-foreground">{value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Section tabs */}
          <div className="flex gap-2 flex-wrap">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id as any)}
                className={cn(
                  'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all',
                  tab === id
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-muted-foreground border-border hover:text-foreground',
                )}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          {/* ── Residents ── */}
          {tab === 'residents' && (
            <ReportCard
              title="Resident Patronage"
              icon={Users}
              color="bg-violet-50 text-violet-800"
              count={residentMap.length}
              onExport={() => exportPDF('residents', residentMap.map((r, i) => [
                i + 1, r.name, r.phone, r.estate, r.orders, r.delivered,
                `GHs ${r.spend.toFixed(2)}`,
                r.delivered > 0 ? `GHs ${(r.spend / r.delivered).toFixed(2)}` : '—',
                format(parseISO(r.lastOrderDate), 'dd MMM yyyy'),
                r.orders >= 20 ? 'Gold' : r.orders >= 10 ? 'Silver' : r.orders >= 5 ? 'Bronze' : '—',
              ]), ['Rank', 'Name', 'Phone', 'Estate', 'Orders', 'Delivered', 'Total Spend', 'Avg/Order', 'Last Order', 'Award'], 'Resident Patronage', dateLabel)}
            >
              {residentMap.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No resident orders in this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <TH>Rank</TH>
                        <TH>Resident</TH>
                        <TH>Estate</TH>
                        <TH right>Orders</TH>
                        <TH right>Delivered</TH>
                        <TH right>Total Spend</TH>
                        <TH right>Avg / Order</TH>
                        <TH>Last Order</TH>
                        <TH>Award</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {residentMap.map((r, i) => {
                        const tier = r.orders >= 20 ? { label: '🏆 Gold', cls: 'text-yellow-600 font-bold' }
                                   : r.orders >= 10 ? { label: '🥈 Silver', cls: 'text-gray-500 font-bold' }
                                   : r.orders >= 5  ? { label: '🥉 Bronze', cls: 'text-amber-600 font-bold' }
                                   : { label: '—', cls: 'text-muted-foreground' };
                        const completionRate = r.orders > 0 ? Math.round((r.delivered / r.orders) * 100) : 0;
                        return (
                          <tr key={r.id} className={cn('hover:bg-gray-50/70', i < 3 && 'bg-yellow-50/30')}>
                            <TD><div className="flex items-center gap-1.5"><RankBadge rank={i + 1} /></div></TD>
                            <TD><div><p className="font-medium">{r.name}</p><p className="text-xs text-muted-foreground">{r.phone}</p></div></TD>
                            <TD muted>{r.estate}</TD>
                            <TD right bold>{r.orders}</TD>
                            <TD right>
                              <span className="text-green-700 font-semibold">{r.delivered}</span>
                              <span className="text-xs text-muted-foreground ml-1">({completionRate}%)</span>
                            </TD>
                            <TD green right>GHs {r.spend.toFixed(2)}</TD>
                            <TD right muted>{r.delivered > 0 ? `GHs ${(r.spend / r.delivered).toFixed(2)}` : '—'}</TD>
                            <TD muted>{format(parseISO(r.lastOrderDate), 'dd MMM yy')}</TD>
                            <TD><span className={tier.cls}>{tier.label}</span></TD>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </ReportCard>
          )}

          {/* ── Vendors ── */}
          {tab === 'vendors' && (
            <ReportCard
              title="Vendor Performance"
              icon={Package}
              color="bg-blue-50 text-blue-800"
              count={vendorMap.length}
              onExport={() => exportPDF('vendors', vendorMap.map((v, i) => [
                i + 1, v.name, v.orders,
                `GHs ${v.revenue.toFixed(2)}`,
                `GHs ${v.subtotal.toFixed(2)}`,
                v.uniqueCustomers,
                v.itemsSold,
                `GHs ${v.avgOrder.toFixed(2)}`,
              ]), ['Rank', 'Vendor', 'Orders', 'Total Sales', 'Goods Value', 'Customers', 'Items Sold', 'Avg Order'], 'Vendor Performance', dateLabel)}
            >
              {vendorMap.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No vendor data in this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <TH>Rank</TH>
                        <TH>Vendor</TH>
                        <TH right>Orders</TH>
                        <TH right>Total Sales</TH>
                        <TH right>Goods Value</TH>
                        <TH right>Customers</TH>
                        <TH right>Items Sold</TH>
                        <TH right>Avg / Order</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorMap.map((v, i) => (
                        <tr key={v.id} className={cn('hover:bg-gray-50/70', i < 3 && 'bg-blue-50/20')}>
                          <TD><RankBadge rank={i + 1} /></TD>
                          <TD bold>{v.name}</TD>
                          <TD right bold>{v.orders}</TD>
                          <TD green right>GHs {v.revenue.toFixed(2)}</TD>
                          <TD right muted>GHs {v.subtotal.toFixed(2)}</TD>
                          <TD right>
                            <span className="inline-flex items-center gap-1">
                              <Users size={11} className="text-muted-foreground" />
                              {v.uniqueCustomers}
                            </span>
                          </TD>
                          <TD right muted>{v.itemsSold}</TD>
                          <TD right muted>GHs {v.avgOrder.toFixed(2)}</TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ReportCard>
          )}

          {/* ── Riders ── */}
          {tab === 'riders' && (
            <ReportCard
              title="Rider Deliveries"
              icon={Truck}
              color="bg-green-50 text-green-800"
              count={riderMap.length}
              onExport={() => exportPDF('riders', riderMap.map((r, i) => [
                i + 1, r.name, r.deliveries, r.singleDeliveries, r.bulkDeliveries,
                `GHs ${r.earnings.toFixed(2)}`,
                `GHs ${r.avgFee.toFixed(2)}`,
              ]), ['Rank', 'Rider', 'Total', 'Individual', 'Bulk', 'Total Fees', 'Avg Fee'], 'Rider Deliveries', dateLabel)}
            >
              {riderMap.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No rider deliveries in this period.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <TH>Rank</TH>
                        <TH>Rider</TH>
                        <TH right>Total Deliveries</TH>
                        <TH right>Individual</TH>
                        <TH right>Bulk Orders</TH>
                        <TH right>Fees Earned</TH>
                        <TH right>Avg / Delivery</TH>
                      </tr>
                    </thead>
                    <tbody>
                      {riderMap.map((r, i) => (
                        <tr key={r.id} className={cn('hover:bg-gray-50/70', i < 3 && 'bg-green-50/20')}>
                          <TD><RankBadge rank={i + 1} /></TD>
                          <TD bold>{r.name}</TD>
                          <TD right bold>{r.deliveries}</TD>
                          <TD right muted>{r.singleDeliveries}</TD>
                          <TD right>
                            {r.bulkDeliveries > 0
                              ? <span className="text-indigo-600 font-medium">{r.bulkDeliveries}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </TD>
                          <TD green right>GHs {r.earnings.toFixed(2)}</TD>
                          <TD right muted>GHs {r.avgFee.toFixed(2)}</TD>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ReportCard>
          )}

          {/* ── Call Agents ── */}
          {tab === 'agents' && (() => {
            const { agents: agentRows, callOrders } = agentMap;
            const selectedAgent = selectedAgentId !== null
              ? agentRows.find(a => a.id === selectedAgentId) ?? null
              : null;
            const agentOrders = selectedAgentId !== null
              ? callOrders.filter((o: any) => o.agentId === selectedAgentId)
              : [];
            const delivered = agentOrders.filter((o: any) => o.status === 'delivered');
            const agentValue = agentOrders.reduce((s: number, o: any) => s + o.total, 0);

            /* ── Drill-down: individual agent ── */
            if (selectedAgent) {
              return (
                <div className="space-y-4">
                  {/* Back breadcrumb */}
                  <button
                    onClick={() => setSelectedAgentId(null)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors"
                  >
                    <ArrowLeft size={15} /> Back to all agents
                  </button>

                  {/* Agent hero card */}
                  <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
                    <div className="bg-gradient-to-br from-pink-50 to-rose-50 px-6 py-5 border-b border-border/40">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-2xl bg-pink-100 flex items-center justify-center">
                            <PhoneCall size={22} className="text-pink-600" />
                          </div>
                          <div>
                            <h2 className="text-lg font-bold text-foreground">{selectedAgent.name}</h2>
                            <p className="text-sm text-muted-foreground">Call Agent · {dateLabel}</p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs rounded-xl gap-1.5 bg-white/70 hover:bg-white"
                          onClick={() => exportPDF(
                            `agent-${selectedAgent.id}`,
                            agentOrders.map((o: any) => [
                              `#${o.id}`, o.residentName || '—',
                              format(parseISO(o.createdAt), 'dd MMM yyyy HH:mm'),
                              o.items?.length ?? 0, `GHs ${o.total.toFixed(2)}`, o.status,
                            ]),
                            ['Order #', 'Resident', 'Date', 'Items', 'Total', 'Status'],
                            `${selectedAgent.name} — Call Agent Sales`,
                            dateLabel,
                          )}
                        >
                          <Download size={12} /> Export PDF
                        </Button>
                      </div>
                    </div>

                    {/* Stats strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-border/40">
                      {[
                        { label: 'Total Orders', value: agentOrders.length, color: 'text-foreground' },
                        { label: 'Delivered', value: delivered.length, color: 'text-green-700' },
                        { label: 'In Progress', value: agentOrders.length - delivered.length, color: 'text-amber-600' },
                        { label: 'Total Value', value: `GHs ${agentValue.toFixed(2)}`, color: 'text-green-700 font-mono' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="px-5 py-4">
                          <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
                          <p className={cn('text-xl font-bold', color)}>{value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Success rate bar */}
                    {agentOrders.length > 0 && (
                      <div className="px-6 py-3 bg-gray-50/60 border-t border-border/30 flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-24 shrink-0">Delivery Rate</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 rounded-full transition-all"
                            style={{ width: `${Math.round((delivered.length / agentOrders.length) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-green-700 w-10 text-right">
                          {Math.round((delivered.length / agentOrders.length) * 100)}%
                        </span>
                      </div>
                    )}
                  </Card>

                  {/* Individual orders table */}
                  <Card className="rounded-2xl border-border/50 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-border/50 bg-gray-50/60">
                      <p className="text-sm font-semibold text-muted-foreground">
                        {agentOrders.length === 0 ? 'No orders' : `${agentOrders.length} order${agentOrders.length !== 1 ? 's' : ''} in this period`}
                      </p>
                    </div>
                    {agentOrders.length === 0 ? (
                      <div className="py-10 text-center text-muted-foreground text-sm">No call orders attributed to this agent in this period.</div>
                    ) : (
                      <table className="w-full">
                        <thead>
                          <tr><TH>Order #</TH><TH>Resident</TH><TH>Date</TH><TH right>Items</TH><TH right>Total</TH><TH>Status</TH></tr>
                        </thead>
                        <tbody>
                          {agentOrders.map((o: any) => (
                            <tr key={o.id} className="hover:bg-gray-50/70">
                              <TD bold>#{o.id}</TD>
                              <TD>{o.residentName || '—'}</TD>
                              <TD muted>{format(parseISO(o.createdAt), 'dd MMM, HH:mm')}</TD>
                              <TD right>{o.items?.length ?? 0}</TD>
                              <TD green right>GHs {o.total.toFixed(2)}</TD>
                              <TD>
                                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full',
                                  o.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                )}>{o.status}</span>
                              </TD>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </Card>
                </div>
              );
            }

            /* ── Overview: all agents leaderboard + selectable cards ── */
            return (
              <div className="space-y-4">
                <ReportCard
                  title="Call Agent Leaderboard"
                  icon={PhoneCall}
                  color="bg-pink-50 text-pink-800"
                  count={agentRows.length}
                  onExport={() => exportPDF('agents', agentRows.map((a, i) => [
                    i + 1, a.name, a.orders, `GHs ${a.value.toFixed(2)}`,
                  ]), ['Rank', 'Agent', 'Total Orders', 'Total Value'], 'Call Agent Performance', dateLabel)}
                >
                  {agentRows.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-sm">No call-created orders in this period.</div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr><TH>Rank</TH><TH>Agent</TH><TH right>Orders</TH><TH right>Total Value</TH><TH right>Avg / Order</TH><TH></TH></tr>
                      </thead>
                      <tbody>
                        {agentRows.map((a, i) => (
                          <tr key={a.id} className="hover:bg-gray-50/70 cursor-pointer" onClick={() => setSelectedAgentId(a.id)}>
                            <TD><RankBadge rank={i + 1} /></TD>
                            <TD bold>{a.name}</TD>
                            <TD right>{a.orders}</TD>
                            <TD green right>GHs {a.value.toFixed(2)}</TD>
                            <TD right muted>GHs {(a.value / a.orders).toFixed(2)}</TD>
                            <TD>
                              <span className="text-xs text-primary font-medium hover:underline">View →</span>
                            </TD>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </ReportCard>

                {/* Agent selector cards */}
                {agentRows.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground font-medium mb-3 uppercase tracking-wide">
                      Click an agent to see their individual sales breakdown
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {agentRows.map((a, i) => (
                        <button
                          key={a.id}
                          onClick={() => setSelectedAgentId(a.id)}
                          className="text-left p-4 rounded-2xl border border-border bg-white hover:border-pink-200 hover:bg-pink-50/40 hover:shadow-sm transition-all group"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="h-9 w-9 rounded-xl bg-pink-100 group-hover:bg-pink-200 transition-colors flex items-center justify-center text-pink-700 font-bold text-sm">
                              {a.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-sm text-foreground truncate">{a.name}</p>
                              <p className="text-xs text-muted-foreground">Rank #{i + 1}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gray-50 rounded-xl p-2.5">
                              <p className="text-xs text-muted-foreground">Orders</p>
                              <p className="font-bold text-foreground">{a.orders}</p>
                            </div>
                            <div className="bg-green-50 rounded-xl p-2.5">
                              <p className="text-xs text-muted-foreground">Value</p>
                              <p className="font-bold text-green-700 text-xs">GHs {a.value.toFixed(0)}</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── Delivery Partners ── */}
          {tab === 'partners' && (
            <ReportCard
              title="Delivery Company Report"
              icon={Building2}
              color="bg-amber-50 text-amber-800"
              count={partnerMap.length}
              onExport={() => exportPDF('delivery-partners', partnerMap.map((p, i) => [
                i + 1, p.name, p.outsourced, p.fulfilled, p.pending,
                `${p.outsourced > 0 ? Math.round((p.fulfilled / p.outsourced) * 100) : 0}%`,
              ]), ['Rank', 'Company', 'Outsourced', 'Fulfilled', 'Pending', 'Fulfilment Rate'], 'Delivery Company Report', dateLabel)}
            >
              {partnerMap.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-sm">No outsourced deliveries in this period.</div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr>
                      <TH>Rank</TH>
                      <TH>Company</TH>
                      <TH right>Outsourced</TH>
                      <TH right>Fulfilled</TH>
                      <TH right>Pending</TH>
                      <TH right>Rate</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerMap.map((p, i) => {
                      const rate = p.outsourced > 0 ? Math.round((p.fulfilled / p.outsourced) * 100) : 0;
                      return (
                        <tr key={p.id} className="hover:bg-gray-50/70">
                          <TD><RankBadge rank={i + 1} /></TD>
                          <TD bold>{p.name}</TD>
                          <TD right>{p.outsourced}</TD>
                          <TD right><span className="text-green-700 font-semibold">{p.fulfilled}</span></TD>
                          <TD right><span className="text-amber-600">{p.pending}</span></TD>
                          <TD right>
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500 rounded-full" style={{ width: `${rate}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-green-700">{rate}%</span>
                            </div>
                          </TD>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </ReportCard>
          )}

          <p className="text-xs text-muted-foreground text-center pb-4">
            All figures reflect the selected period · {dateLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
