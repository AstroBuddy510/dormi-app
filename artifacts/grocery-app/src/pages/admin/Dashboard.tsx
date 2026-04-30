import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useAuth } from '@/store';
import {
  useGetAdminStats,
  useListOrders,
  useUpdateOrderStatus,
  useAssignRider,
  useListRiders,
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DeliveryTimer } from '@/components/ui/DeliveryTimer';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  format, parseISO, startOfDay, endOfDay,
  startOfWeek, endOfWeek, isWithinInterval,
} from 'date-fns';
import {
  Activity, ShoppingCart, Users, DollarSign, RefreshCcw,
  CheckCircle, Package, Eye, ChevronLeft, ChevronRight,
  Calendar, Clock3, Boxes, Zap, Building2, Truck, Store, AlertTriangle,
} from 'lucide-react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { OrderDetailModal } from '@/components/ui/OrderDetailModal';
import { BulkGroupDetailModal } from '@/components/ui/BulkGroupDetailModal';
import { cn } from '@/lib/utils';

interface DeliveryPartner { id: number; name: string; commissionPercent: number; isActive: boolean; }
interface Vendor { id: number; name: string; phone: string; isActive: boolean; categories: string[]; }

type LiveFilter  = 'all' | 'pending' | 'in_progress';
type DatePreset  = 'all' | 'today' | 'week' | 'custom';
type OrderTypeFilter = 'all' | 'single' | 'bulk' | 'third_party';

const HISTORY_PAGE_SIZE = 10;

export default function AdminDashboard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /* ── UI state ─────────────────────────────────────── */
  const [liveFilter, setLiveFilter]       = useState<LiveFilter>('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedBulkGroup, setSelectedBulkGroup] = useState<any>(null);
  const [isRefreshing, setIsRefreshing]   = useState(false);

  /* History filters */
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderTypeFilter>('all');

  /* ── Data ─────────────────────────────────────────── */
  const { data: stats, refetch: refetchStats } = useGetAdminStats({
    query: { refetchInterval: 30_000 },
  });
  const { data: allOrdersRaw = [], isLoading: ordersLoading, refetch: refetchOrders } = useListOrders(
    undefined,
    { query: { refetchInterval: 30_000 } },
  );

  /* Filter out block-type orders — those are represented by their group instead */
  const allOrders = useMemo(
    () => allOrdersRaw.filter((o: any) => o.orderType !== 'block'),
    [allOrdersRaw],
  );

  /* ── Block groups ──────────────────────────────────── */
  const { data: blockGroups = [], refetch: refetchGroups } = useQuery<any[]>({
    queryKey: ['/api/block-groups'],
    queryFn: () => fetch('/api/block-groups').then(r => r.json()),
    refetchInterval: 30_000,
  });

  /* ── Auto-detect rider-delivered orders ──────────────── */
  const prevStatusesRef = useRef<Record<number, string>>({});
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (!allOrders.length) return;

    if (!isInitialLoadRef.current) {
      const newlyDelivered = allOrders.filter((order: any) => {
        const prev = prevStatusesRef.current[order.id];
        return order.status === 'delivered' && prev === 'in_transit';
      });

      newlyDelivered.forEach((order: any) => {
        try {
          const ctx = new AudioContext();
          const notes = [523, 659, 784];
          notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
            gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
            gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.12 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.35);
            osc.start(ctx.currentTime + i * 0.12);
            osc.stop(ctx.currentTime + i * 0.12 + 0.36);
          });
          setTimeout(() => ctx.close(), 1500);
        } catch { /* AudioContext unavailable */ }

        toast({
          title: '✅ Order Delivered!',
          description: `Order #${order.id} — ${order.residentName || 'customer'} — delivered by ${(order as any).riderName || 'rider'}. Timer stopped.`,
        });
      });
    }

    prevStatusesRef.current = Object.fromEntries(allOrders.map((o: any) => [o.id, o.status]));
    isInitialLoadRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOrders]);

  const { data: riders = [] }          = useListRiders();
  const { data: deliveryPartners = [] } = useQuery<DeliveryPartner[]>({
    queryKey: ['/api/delivery-partners'],
    queryFn: () => fetch('/api/delivery-partners').then(r => r.json()),
  });
  const activePartners = deliveryPartners.filter(p => p.isActive);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ['/api/vendors'],
    queryFn: () => fetch('/api/vendors').then(r => r.json()),
  });
  const activeVendors = vendors.filter(v => v.isActive);

  /* ── Mutations ────────────────────────────────────── */
  const updateStatusMutation  = useUpdateOrderStatus();
  const assignRiderMutation   = useAssignRider();

  const assignDeliveryPartnerMutation = useMutation({
    mutationFn: ({ orderId, partnerId }: { orderId: number; partnerId: number }) =>
      fetch(`/api/orders/${orderId}/assign-delivery-partner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryPartnerId: partnerId }),
      }).then(r => r.json()),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries();
      toast({ title: 'Delivery Company Assigned', description: `Delivery partner assigned to order #${orderId}` });
    },
  });

  const assignVendorMutation = useMutation({
    mutationFn: ({ orderId, vendorId }: { orderId: number; vendorId: number }) =>
      fetch(`/api/orders/${orderId}/assign-vendor`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ vendorId }),
      }).then(r => r.json()),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries();
      toast({ title: 'Vendor Assigned', description: `Vendor assigned to order #${orderId}` });
    },
  });

  const assignBulkRiderMutation = useMutation({
    mutationFn: ({ groupId, riderId }: { groupId: number; riderId: number }) =>
      fetch(`/api/block-groups/${groupId}/assign-rider`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId }),
      }).then(r => r.json()),
    onSuccess: (_data, { groupId }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/block-groups'] });
      toast({ title: 'Rider Assigned', description: `Rider assigned to bulk group #${groupId}` });
    },
  });

  const updateBulkStatusMutation = useMutation({
    mutationFn: ({ groupId, status }: { groupId: number; status: string }) =>
      fetch(`/api/block-groups/${groupId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      }).then(r => r.json()),
    onSuccess: (_data, { groupId, status }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/block-groups'] });
      toast({ title: 'Bulk Order Updated', description: `Bulk group #${groupId} → ${status}` });
    },
  });

  /* ── Refresh ──────────────────────────────────────── */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([refetchOrders(), refetchStats(), refetchGroups(), queryClient.invalidateQueries()]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  /* ── Handlers for individual orders ──────────────── */
  const handleStatusUpdate = (orderId: number, newStatus: string) => {
    updateStatusMutation.mutate(
      { id: orderId, data: { status: newStatus as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          toast({ title: 'Order Updated', description: `Order #${orderId} → ${newStatus}` });
        },
      }
    );
  };

  const handleAssignRider = (orderId: number, riderId: string) => {
    assignRiderMutation.mutate(
      { id: orderId, data: { riderId: parseInt(riderId) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          toast({ title: 'Rider Assigned', description: `Rider assigned to order #${orderId}` });
        },
      }
    );
  };

  /* ── Handlers for bulk groups ─────────────────────── */
  const handleBulkAssignRider = (groupId: number, riderId: string) => {
    assignBulkRiderMutation.mutate({ groupId, riderId: parseInt(riderId) });
  };

  const handleBulkStatusUpdate = (groupId: number, newStatus: string) => {
    updateBulkStatusMutation.mutate({ groupId, status: newStatus });
  };

  /* ── Derived: combined live items (orders + bulk groups) ── */
  const liveSingle = useMemo(() => {
    return allOrders.filter((o: any) => {
      if (o.status === 'delivered' || o.status === 'cancelled') return false;
      if (liveFilter === 'pending')     return o.status === 'pending' || o.status === 'vendor_declined';
      if (liveFilter === 'in_progress') return ['accepted', 'ready', 'in_transit'].includes(o.status);
      return true;
    });
  }, [allOrders, liveFilter]);

  const liveBulkGroups = useMemo(() => {
    return blockGroups.filter((g: any) => {
      if (g.status === 'delivered' || g.status === 'cancelled') return false;
      if (liveFilter === 'pending')     return g.status === 'pending' || g.status === 'vendor_declined';
      if (liveFilter === 'in_progress') return ['accepted', 'ready', 'in_transit'].includes(g.status);
      return true;
    });
  }, [blockGroups, liveFilter]);

  /* Merge and sort by createdAt descending */
  const liveOrders = useMemo(() => {
    const combined: any[] = [...liveSingle, ...liveBulkGroups];
    return combined.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [liveSingle, liveBulkGroups]);

  /* ── Derived: delivered history ──────────────────────── */
  const deliveredSingle = useMemo(
    () => allOrders.filter((o: any) => o.status === 'delivered'),
    [allOrders],
  );
  const deliveredBulk = useMemo(
    () => blockGroups.filter((g: any) => g.status === 'delivered'),
    [blockGroups],
  );

  const deliveredFiltered = useMemo(() => {
    const now = new Date();
    const combined: any[] = [...deliveredSingle, ...deliveredBulk];
    return combined
      .filter((o) => {
        /* Order type filter */
        if (orderTypeFilter !== 'all') {
          const isBulk = !!o.isBulkGroup;
          if (orderTypeFilter === 'bulk' && !isBulk) return false;
          if (orderTypeFilter === 'single' && (isBulk || o.orderType === 'third_party')) return false;
          if (orderTypeFilter === 'third_party' && (isBulk || o.orderType !== 'third_party')) return false;
        }
        /* Date filter */
        if (datePreset === 'all') return true;
        /* Use deliveredAt for individual orders, updatedAt for bulk groups, fall back to createdAt */
        const rawDate = o.deliveredAt ?? o.updatedAt ?? o.createdAt;
        const date = parseISO(rawDate);
        if (datePreset === 'today') return isWithinInterval(date, { start: startOfDay(now), end: endOfDay(now) });
        if (datePreset === 'week')  return isWithinInterval(date, { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
        if (datePreset === 'custom') {
          if (fromDate && date < startOfDay(parseISO(fromDate))) return false;
          if (toDate   && date > endOfDay(parseISO(toDate)))     return false;
          return true;
        }
        return true;
      })
      .sort((a, b) => {
        const aDate = a.deliveredAt ?? a.updatedAt ?? a.createdAt;
        const bDate = b.deliveredAt ?? b.updatedAt ?? b.createdAt;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });
  }, [deliveredSingle, deliveredBulk, datePreset, fromDate, toDate, orderTypeFilter]);

  const historyTotalPages = Math.max(1, Math.ceil(deliveredFiltered.length / HISTORY_PAGE_SIZE));
  const safePage          = Math.min(historyPage, historyTotalPages);
  const historyPage_data  = deliveredFiltered.slice(
    (safePage - 1) * HISTORY_PAGE_SIZE,
    safePage * HISTORY_PAGE_SIZE,
  );

  function goHistoryPage(p: number) {
    setHistoryPage(Math.max(1, Math.min(historyTotalPages, p)));
  }

  /* ── Period label ─────────────────────────────────── */
  const periodLabel =
    datePreset === 'all'    ? 'All Time' :
    datePreset === 'today'  ? 'Today' :
    datePreset === 'week'   ? 'This Week' :
    (fromDate && toDate)    ? `${fromDate} – ${toDate}` : 'Custom';

  /* ── Helper: period date predicate (shared by all period filters) ── */
  const inPeriod = useCallback((rawDate: string | null | undefined): boolean => {
    if (!rawDate) return datePreset === 'all';
    if (datePreset === 'all') return true;
    const now = new Date();
    const date = parseISO(rawDate);
    if (datePreset === 'today')  return isWithinInterval(date, { start: startOfDay(now), end: endOfDay(now) });
    if (datePreset === 'week')   return isWithinInterval(date, { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) });
    if (datePreset === 'custom') {
      if (fromDate && date < startOfDay(parseISO(fromDate))) return false;
      if (toDate   && date > endOfDay(parseISO(toDate)))     return false;
      return true;
    }
    return true;
  }, [datePreset, fromDate, toDate]);

  /* ── Period-scoped individual orders (non-block, for display/live section) ── */
  const periodOrders = useMemo(
    () => allOrders.filter((o: any) => inPeriod(o.deliveredAt ?? o.updatedAt ?? o.createdAt)),
    [allOrders, inPeriod],
  );

  /* ── Period-scoped ALL orders including block sub-orders (for financials) ── */
  const periodOrdersAll = useMemo(
    () => allOrdersRaw.filter((o: any) => inPeriod(o.deliveredAt ?? o.updatedAt ?? o.createdAt)),
    [allOrdersRaw, inPeriod],
  );

  /* ── Period-scoped bulk groups (for stat counts, treated as single order events) ── */
  const periodBulkGroupsFiltered = useMemo(
    () => blockGroups.filter((g: any) => inPeriod(g.updatedAt ?? g.createdAt)),
    [blockGroups, inPeriod],
  );

  /* ── Net Revenue (all delivered orders including block sub-orders) ── */
  const partnerMap = useMemo(
    () => new Map(deliveryPartners.map((p: DeliveryPartner) => [p.id, p.commissionPercent ?? 0])),
    [deliveryPartners],
  );

  const periodNetRevenue = useMemo(() => {
    const delivered = periodOrdersAll.filter((o: any) => o.status === 'delivered');
    const serviceFeeTotal        = delivered.reduce((s: number, o: any) => s + (o.serviceFee ?? 0), 0);
    const inHouseDeliveryTotal   = delivered.filter((o: any) => o.riderId && !o.deliveryPartnerId)
                                            .reduce((s: number, o: any) => s + (o.deliveryFee ?? 0), 0);
    const partnerCommissionTotal = delivered.filter((o: any) => o.deliveryPartnerId)
                                            .reduce((s: number, o: any) => {
                                              const rate = (partnerMap.get(o.deliveryPartnerId) ?? 0) / 100;
                                              return s + (o.deliveryFee ?? 0) * rate;
                                            }, 0);
    const vendorCommissionTotal  = delivered.filter((o: any) => o.vendorId)
                                            .reduce((s: number, o: any) => {
                                              const rate = (o.vendorCommissionPercent ?? 0) / 100;
                                              return s + (o.subtotal ?? 0) * rate;
                                            }, 0);
    return { serviceFeeTotal, inHouseDeliveryTotal, partnerCommissionTotal, vendorCommissionTotal,
             total: serviceFeeTotal + inHouseDeliveryTotal + partnerCommissionTotal + vendorCommissionTotal };
  }, [periodOrdersAll, partnerMap]);

  const fmt = (n: number) => `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  /* ── Vendor Sales Breakdown (all delivered orders including block sub-orders) ── */
  const vendorSalesList = useMemo(() => {
    const delivered = periodOrdersAll.filter((o: any) => o.status === 'delivered' && o.vendorId);
    const m: Record<number, { vendorId: number; vendorName: string; orders: number; revenue: number; subtotal: number }> = {};
    for (const o of delivered) {
      if (!m[o.vendorId]) m[o.vendorId] = { vendorId: o.vendorId, vendorName: o.vendorName ?? `Vendor #${o.vendorId}`, orders: 0, revenue: 0, subtotal: 0 };
      m[o.vendorId].orders  += 1;
      m[o.vendorId].revenue += o.total ?? 0;
      m[o.vendorId].subtotal += o.subtotal ?? 0;
    }
    return Object.values(m).sort((a, b) => b.revenue - a.revenue);
  }, [periodOrdersAll]);

  const vendorSalesTotal = vendorSalesList.reduce((s, v) => s + v.revenue, 0);

  /* ── Stat cards (individual orders + bulk groups combined) ── */
  const statCards = [
    {
      title: 'Total Orders',
      value: periodOrders.length + periodBulkGroupsFiltered.length,
      icon: ShoppingCart, color: 'text-blue-600 bg-blue-50',
    },
    {
      title: 'Pending',
      value: periodOrders.filter((o: any) => o.status === 'pending').length
           + periodBulkGroupsFiltered.filter((g: any) => g.status === 'pending').length,
      icon: Activity, color: 'text-red-600 bg-red-50',
    },
    {
      title: 'In Progress',
      value: periodOrders.filter((o: any) => ['accepted','ready','in_transit'].includes(o.status)).length
           + periodBulkGroupsFiltered.filter((g: any) => ['accepted','collecting','ready','in_transit'].includes(g.status)).length,
      icon: Package, color: 'text-amber-600 bg-amber-50',
    },
    {
      title: 'Delivered',
      value: periodOrders.filter((o: any) => o.status === 'delivered').length
           + periodBulkGroupsFiltered.filter((g: any) => g.status === 'delivered').length,
      icon: CheckCircle, color: 'text-green-600 bg-green-50',
    },
    { title: 'Subscribers', value: stats?.subscriberCount ?? 0, icon: Users, color: 'text-purple-600 bg-purple-50' },
  ];

  const liveTabs: { label: string; value: LiveFilter }[] = [
    { label: 'All Active', value: 'all' },
    { label: 'Pending',    value: 'pending' },
    { label: 'In Progress', value: 'in_progress' },
  ];

  const nextStatus: Record<string, string | null> = {
    pending: 'accepted', accepted: 'collecting', collecting: 'ready', ready: 'in_transit', in_transit: 'delivered',
    delivered: null, cancelled: null,
  };
  const nextStatusLabel: Record<string, string> = {
    pending: 'Accept', accepted: 'Collecting', collecting: 'Mark Ready', ready: 'In Transit', in_transit: 'Delivered',
  };

  /* ── Render ──────────────────────────────────────── */
  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Live Orders Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Real-time overview of all orders</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}
            className="rounded-xl border-border gap-2 min-w-[110px]">
            <RefreshCcw className={cn('h-4 w-4 transition-transform duration-500', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {/* ── Stat Cards ── */}
        <p className="text-sm font-medium text-muted-foreground">
          Stats for: <span className="text-foreground font-semibold">{periodLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground/60">· auto-refreshes every 30s</span>
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {statCards.map(({ title, value, icon: Icon, color }) => (
            <Card key={title} className="rounded-2xl shadow-sm border-border/50">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className={`p-2 rounded-lg w-fit ${color}`}><Icon size={18} /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{title}</p>
                  <p className="text-xl font-bold text-foreground">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Net Revenue Card ── */}
        <Card className="rounded-2xl shadow-sm border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardContent className="p-5">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-100">
                  <DollarSign size={20} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Dormi Net Revenue</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-0.5">{fmt(periodNetRevenue.total)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Delivered orders · {periodLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 min-w-0">
                <div className="bg-white rounded-xl border border-emerald-100 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Service Fee (18%)</p>
                  <p className="text-sm font-bold text-emerald-700">{fmt(periodNetRevenue.serviceFeeTotal)}</p>
                </div>
                <div className="bg-white rounded-xl border border-blue-100 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">In-House Delivery</p>
                  <p className="text-sm font-bold text-blue-700">{fmt(periodNetRevenue.inHouseDeliveryTotal)}</p>
                </div>
                <div className="bg-white rounded-xl border border-amber-100 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">3rd-Party Commission</p>
                  <p className="text-sm font-bold text-amber-700">{fmt(periodNetRevenue.partnerCommissionTotal)}</p>
                </div>
                <div className="bg-white rounded-xl border border-purple-100 px-3 py-2.5">
                  <p className="text-[11px] text-muted-foreground">Vendor Commission</p>
                  <p className="text-sm font-bold text-purple-700">{fmt(periodNetRevenue.vendorCommissionTotal)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Vendor Sales Breakdown ── */}
        {vendorSalesList.length > 0 && (
          <Card className="rounded-2xl shadow-sm border-border/50">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-orange-50">
                  <Package size={18} className="text-orange-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Vendor Sales Breakdown</p>
                  <p className="text-xs text-muted-foreground">Delivered orders · {periodLabel}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 pr-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Vendor</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Orders</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Goods Value</th>
                      <th className="text-right py-2 pl-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Total Sales</th>
                      <th className="text-right py-2 pl-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendorSalesList.map((v, i) => {
                      const pct = vendorSalesTotal > 0 ? (v.revenue / vendorSalesTotal) * 100 : 0;
                      const colors = ['bg-orange-500', 'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
                      return (
                        <tr key={v.vendorId} className="border-b border-border/30 last:border-0 hover:bg-gray-50/60">
                          <td className="py-2.5 pr-4">
                            <div className="flex items-center gap-2">
                              <span className={cn('inline-block w-2 h-2 rounded-full', colors[i % colors.length])} />
                              <span className="font-medium text-foreground">{v.vendorName}</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium">{v.orders}</td>
                          <td className="py-2.5 px-3 text-right text-muted-foreground text-xs">{fmt(v.subtotal)}</td>
                          <td className="py-2.5 pl-3 text-right font-semibold text-green-700">{fmt(v.revenue)}</td>
                          <td className="py-2.5 pl-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                <div className={cn('h-full rounded-full', colors[i % colors.length])} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border/50">
                      <td className="pt-2.5 pr-4 text-xs font-bold text-muted-foreground uppercase">Total</td>
                      <td className="pt-2.5 px-3 text-right font-bold">{vendorSalesList.reduce((s, v) => s + v.orders, 0)}</td>
                      <td className="pt-2.5 px-3 text-right text-xs text-muted-foreground">{fmt(vendorSalesList.reduce((s, v) => s + v.subtotal, 0))}</td>
                      <td className="pt-2.5 pl-3 text-right font-bold text-green-700">{fmt(vendorSalesTotal)}</td>
                      <td className="pt-2.5 pl-3 text-right text-xs text-muted-foreground">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Live Orders ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">Live Orders</h2>
              <p className="text-xs text-muted-foreground">
                {liveOrders.length} active item{liveOrders.length !== 1 ? 's' : ''}
                {liveBulkGroups.length > 0 && (
                  <span className="ml-1 text-indigo-600">· {liveBulkGroups.length} bulk</span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {liveTabs.map((tab) => (
                <button key={tab.value} onClick={() => setLiveFilter(tab.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-medium transition-all',
                    liveFilter === tab.value
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white border border-border text-muted-foreground hover:text-foreground',
                  )}>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <Card className="rounded-2xl shadow-sm border-border/50 overflow-hidden">
            <CardContent className="p-0">
              {ordersLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">Loading orders…</div>
              ) : liveOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <ShoppingCart size={32} className="opacity-30" />
                  <p className="text-sm">No active orders right now</p>
                </div>
              ) : (
                <LiveOrdersTable
                  orders={liveOrders}
                  riders={riders}
                  activePartners={activePartners}
                  activeVendors={activeVendors}
                  nextStatus={nextStatus}
                  nextStatusLabel={nextStatusLabel}
                  updateStatusMutation={updateStatusMutation}
                  updateBulkStatusMutation={updateBulkStatusMutation}
                  assignRiderMutation={assignRiderMutation}
                  assignDeliveryPartnerMutation={assignDeliveryPartnerMutation}
                  assignVendorMutation={assignVendorMutation}
                  onSelectOrder={setSelectedOrder}
                  onSelectBulkGroup={setSelectedBulkGroup}
                  onStatusUpdate={handleStatusUpdate}
                  onAssignRider={handleAssignRider}
                  onBulkAssignRider={handleBulkAssignRider}
                  onBulkStatusUpdate={handleBulkStatusUpdate}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Delivered Orders History ── */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                <CheckCircle size={18} className="text-green-600" />
                Delivered Orders History
              </h2>
              <p className="text-xs text-muted-foreground">
                {deliveredFiltered.length} entr{deliveredFiltered.length !== 1 ? 'ies' : 'y'} · showing {HISTORY_PAGE_SIZE} per page
              </p>
            </div>

            <div className="flex flex-col gap-2">
              {/* Date filter row */}
              <div className="flex flex-wrap items-center gap-2">
                {([
                  { key: 'all',   label: 'All Time' },
                  { key: 'today', label: 'Today' },
                  { key: 'week',  label: 'This Week' },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => { setDatePreset(key); setHistoryPage(1); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                      datePreset === key
                        ? 'bg-green-600 text-white border-green-600 shadow-sm'
                        : 'bg-white border-border text-muted-foreground hover:text-foreground',
                    )}>
                    <Clock3 size={11} />
                    {label}
                  </button>
                ))}
                <button onClick={() => { setDatePreset('custom'); setHistoryPage(1); }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                    datePreset === 'custom'
                      ? 'bg-green-600 text-white border-green-600 shadow-sm'
                      : 'bg-white border-border text-muted-foreground hover:text-foreground',
                  )}>
                  <Calendar size={11} /> Custom range
                </button>
                {datePreset === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={fromDate}
                      onChange={(e) => { setFromDate(e.target.value); setHistoryPage(1); }}
                      className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                    />
                    <span className="text-xs text-muted-foreground">→</span>
                    <input type="date" value={toDate} min={fromDate}
                      onChange={(e) => { setToDate(e.target.value); setHistoryPage(1); }}
                      className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                    />
                  </div>
                )}
              </div>
              {/* Order type filter row */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mr-1">Type:</span>
                {([
                  { key: 'all',         label: 'All Types',    icon: Boxes },
                  { key: 'single',      label: 'Single',       icon: Zap },
                  { key: 'bulk',        label: 'Bulk',         icon: Building2 },
                  { key: 'third_party', label: 'Third-Party',  icon: Truck },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button key={key} onClick={() => { setOrderTypeFilter(key as OrderTypeFilter); setHistoryPage(1); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                      orderTypeFilter === key
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-white border-border text-muted-foreground hover:text-foreground',
                    )}>
                    <Icon size={11} />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Card className="rounded-2xl shadow-sm border-border/50 overflow-hidden">
            <CardContent className="p-0">
              {deliveredFiltered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
                  <CheckCircle size={32} className="opacity-20" />
                  <p className="text-sm">No delivered orders for this period</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader className="bg-gray-50">
                        <TableRow>
                          <TableHead className="w-14">ID</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Resident / Estate</TableHead>
                          <TableHead>Items / Summary</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Rider / Partner</TableHead>
                          <TableHead>Delivered At</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyPage_data.map((entry: any) => {
                          const isBulk = !!entry.isBulkGroup;
                          return (
                            <TableRow key={isBulk ? `bulk-${entry.id}` : entry.id} className="hover:bg-gray-50/50">
                              <TableCell>
                                <button
                                  onClick={() => isBulk ? setSelectedBulkGroup(entry) : setSelectedOrder(entry)}
                                  className={cn('font-bold hover:underline', isBulk ? 'text-indigo-700' : 'text-green-700')}
                                >
                                  {isBulk ? `BLK-${entry.id}` : `#${entry.id}`}
                                </button>
                              </TableCell>
                              <TableCell>
                                {isBulk ? (
                                  <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px] px-2 gap-1 rounded-full">
                                    <Boxes size={10} /> Bulk
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] px-2 rounded-full capitalize">
                                    {entry.orderType || 'single'}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {isBulk ? (
                                  <div>
                                    <p className="font-medium text-sm">{entry.estate}</p>
                                    <p className="text-xs text-muted-foreground">{entry.totalOrders} residents</p>
                                  </div>
                                ) : (
                                  <div>
                                    <p className="font-medium text-sm">{entry.residentName || '—'}</p>
                                    <p className="text-xs text-muted-foreground">{entry.residentPhone || ''}</p>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-sm max-w-[160px]">
                                {isBulk ? (
                                  <p className="text-xs text-muted-foreground">{entry.name}</p>
                                ) : (
                                  Array.isArray(entry.items) && entry.items.length > 0 ? (
                                    <div className="space-y-0.5">
                                      {entry.items.slice(0, 2).map((item: any, i: number) => (
                                        <p key={i} className="truncate text-xs">{item.itemName} ×{item.quantity}</p>
                                      ))}
                                      {entry.items.length > 2 && (
                                        <p className="text-xs text-muted-foreground">+{entry.items.length - 2} more</p>
                                      )}
                                    </div>
                                  ) : '—'
                                )}
                              </TableCell>
                              <TableCell className="font-bold text-green-700">
                                ₵{(isBulk ? entry.totalAmount : entry.total)?.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {isBulk
                                  ? (entry.riderName || '—')
                                  : (entry.orderType === 'third_party' ? (entry.deliveryPartnerName || '—') : (entry.riderName || '—'))}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                {format(parseISO(entry.updatedAt ?? entry.createdAt), 'dd MMM yyyy, HH:mm')}
                              </TableCell>
                              <TableCell>
                                <button
                                  onClick={() => isBulk ? setSelectedBulkGroup(entry) : setSelectedOrder(entry)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-green-700 hover:bg-green-50 transition-colors"
                                >
                                  <Eye size={15} />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {historyTotalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-gray-50/50">
                      <p className="text-xs text-muted-foreground">
                        Showing {(safePage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(safePage * HISTORY_PAGE_SIZE, deliveredFiltered.length)} of {deliveredFiltered.length}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => goHistoryPage(safePage - 1)} disabled={safePage === 1}
                          className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          <ChevronLeft size={14} />
                        </button>
                        {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map((p) => (
                          <button key={p} onClick={() => goHistoryPage(p)}
                            className={cn('w-7 h-7 rounded-lg text-xs font-medium transition-all',
                              p === safePage
                                ? 'bg-green-600 text-white shadow-sm'
                                : 'bg-white border border-border text-muted-foreground hover:text-foreground')}>
                            {p}
                          </button>
                        ))}
                        <button onClick={() => goHistoryPage(safePage + 1)} disabled={safePage === historyTotalPages}
                          className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      <OrderDetailModal
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      <BulkGroupDetailModal
        group={selectedBulkGroup}
        open={!!selectedBulkGroup}
        onClose={() => setSelectedBulkGroup(null)}
      />
    </div>
  );
}

/* ── Status-flow maps (module-level so they never re-create) ────────────── */
/** Bulk / block-group flow includes a "collecting" step */
const BULK_NEXT_STATUS: Record<string, string | null> = {
  pending: 'accepted', accepted: 'collecting', collecting: 'ready',
  ready: 'in_transit', in_transit: 'delivered', delivered: null, cancelled: null,
};
const BULK_NEXT_LABEL: Record<string, string> = {
  pending: 'Accept', accepted: 'Collecting', collecting: 'Mark Ready',
  ready: 'In Transit', in_transit: 'Delivered',
};

/** Individual order flow skips "collecting" entirely */
const SINGLE_NEXT_STATUS: Record<string, string | null> = {
  pending: 'accepted', accepted: 'ready',
  ready: 'in_transit', in_transit: 'delivered', delivered: null, cancelled: null,
};
const SINGLE_NEXT_LABEL: Record<string, string> = {
  pending: 'Accept', accepted: 'Mark Ready',
  ready: 'In Transit', in_transit: 'Delivered',
};

/* ── Live Orders Table ─────────────────────────────── */
function LiveOrdersTable({
  orders, riders, activePartners, activeVendors, nextStatus, nextStatusLabel,
  updateStatusMutation, updateBulkStatusMutation,
  assignRiderMutation, assignDeliveryPartnerMutation, assignVendorMutation,
  onSelectOrder, onSelectBulkGroup, onStatusUpdate, onAssignRider,
  onBulkAssignRider, onBulkStatusUpdate,
}: any) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="w-14">ID</TableHead>
            <TableHead className="w-20">Type</TableHead>
            <TableHead>Resident / Estate</TableHead>
            <TableHead>Address / Batch</TableHead>
            <TableHead>Items / Summary</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Rider / Delivery Co.</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>⏱ Timer</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((entry: any) => {
            const isBulk = !!entry.isBulkGroup;
            const statusMap = isBulk ? BULK_NEXT_STATUS : SINGLE_NEXT_STATUS;
            const labelMap  = isBulk ? BULK_NEXT_LABEL  : SINGLE_NEXT_LABEL;
            const next = statusMap[entry.status];

            if (isBulk) {
              return (
                <TableRow key={`bulk-${entry.id}`} className="hover:bg-indigo-50/30 bg-indigo-50/10">
                  <TableCell>
                    <button
                      onClick={() => onSelectBulkGroup(entry)}
                      className="font-bold text-indigo-700 hover:underline"
                    >
                      BLK-{entry.id}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 text-[10px] px-2 gap-1 rounded-full font-semibold">
                      <Boxes size={10} /> Bulk · {entry.totalOrders}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-semibold text-sm">{entry.estate}</p>
                      <p className="text-xs text-muted-foreground">{entry.totalOrders} resident{entry.totalOrders !== 1 ? 's' : ''}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground font-mono">
                    {entry.batchNumber || `BLK-${entry.id}`}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <button
                      onClick={() => onSelectBulkGroup(entry)}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      View {entry.totalOrders} orders →
                    </button>
                  </TableCell>
                  <TableCell className="font-bold text-indigo-700">
                    ₵{entry.totalAmount?.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={entry.status} />
                      {entry.riderAccepted && (
                        <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                          ✓ Rider Accepted
                        </span>
                      )}
                      {entry.riderId && !entry.riderAccepted && entry.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-700 border border-yellow-200 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                          ⏳ Awaiting Rider
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="min-w-[140px]">
                    <span className="text-xs text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell className="min-w-[160px]">
                    <Select
                      value={entry.riderId?.toString() ?? ''}
                      onValueChange={(val) => onBulkAssignRider(entry.id, val)}
                    >
                      <SelectTrigger className="h-8 text-xs rounded-lg border-indigo-200 bg-indigo-50">
                        <SelectValue placeholder="Assign rider" />
                      </SelectTrigger>
                      <SelectContent>
                        {riders.map((r: any) => (
                          <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {entry.riderName && (
                      <p className="text-[10px] text-indigo-600 font-medium mt-0.5 truncate">✓ {entry.riderName}</p>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[110px]">
                    {next ? (
                      <Button size="sm"
                        variant={entry.status === 'pending' ? 'destructive' : 'default'}
                        className="h-7 text-xs rounded-lg px-2 bg-indigo-600 hover:bg-indigo-700 text-white border-0"
                        onClick={() => onBulkStatusUpdate(entry.id, next)}
                        disabled={updateBulkStatusMutation.isPending}
                      >
                        {labelMap[entry.status]}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground capitalize">{entry.status}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(new Date(entry.createdAt), 'dd MMM HH:mm')}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell>
                    <button
                      onClick={() => onSelectBulkGroup(entry)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-indigo-700 hover:bg-indigo-50 transition-colors"
                    >
                      <Eye size={15} />
                    </button>
                  </TableCell>
                </TableRow>
              );
            }

            /* ── Regular single / third-party order row ── */
            return (
              <TableRow key={entry.id} className="hover:bg-gray-50/50">
                <TableCell>
                  <button
                    onClick={() => onSelectOrder(entry)}
                    className="font-bold text-primary hover:underline hover:text-primary/80 transition-colors"
                  >
                    #{entry.id}
                  </button>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px] px-2 rounded-full capitalize">
                    {entry.orderType || 'single'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{entry.residentName || '—'}</p>
                    <p className="text-xs text-muted-foreground">{entry.residentPhone || ''}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                  {entry.residentAddress || '—'}
                </TableCell>
                <TableCell className="text-sm max-w-[160px]">
                  {Array.isArray(entry.items) && entry.items.length > 0 ? (
                    <div className="space-y-0.5">
                      {entry.items.slice(0, 2).map((item: any, i: number) => (
                        <p key={i} className="truncate text-xs">{item.itemName} ×{item.quantity}</p>
                      ))}
                      {entry.items.length > 2 && (
                        <p className="text-xs text-muted-foreground">+{entry.items.length - 2} more</p>
                      )}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell className="font-bold text-primary">₵{entry.total?.toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusBadge status={entry.status} />
                    {entry.declineReason && (
                      <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 rounded-lg px-2 py-1 text-[10px] font-semibold">
                        <AlertTriangle size={10} /> {entry.declineReason}
                      </span>
                    )}
                    {entry.splitFromOrderId && (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2 py-1 text-[10px] font-semibold">
                        <RefreshCcw size={10} /> Split from #{entry.splitFromOrderId}
                      </span>
                    )}
                    {entry.riderAccepted === true && (
                      <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap">
                        ✓ Rider Accepted
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="min-w-[140px]">
                  <div className="space-y-1">
                    <Select
                      value={entry.vendorId?.toString() ?? ''}
                      onValueChange={(val) =>
                        assignVendorMutation.mutate({ orderId: entry.id, vendorId: parseInt(val) })
                      }
                    >
                      <SelectTrigger className={cn(
                        'h-8 text-xs rounded-lg',
                        !entry.vendorId
                          ? 'border-orange-300 bg-orange-50 text-orange-700 animate-pulse'
                          : 'border-orange-200 bg-orange-50'
                      )}>
                        <SelectValue placeholder={!entry.vendorId ? '⚠ Assign vendor' : 'Change vendor'} />
                      </SelectTrigger>
                      <SelectContent>
                        {activeVendors.map((v: any) => (
                          <SelectItem key={v.id} value={v.id.toString()}>
                            <span className="flex items-center gap-1.5">
                              <Store size={10} className="text-orange-500" />
                              {v.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {entry.vendorName ? (
                      <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-800 border border-orange-200 rounded-lg px-2 py-1 shadow-sm animate-in fade-in zoom-in duration-300">
                        <Store size={11} />
                        <p className="text-[10px] font-bold truncate">{entry.vendorName}</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-orange-500 font-medium flex items-center gap-0.5 animate-pulse">
                        <AlertTriangle size={9} /> Pending Assignment
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell className="min-w-[160px]">
                  {entry.orderType === 'third_party' ? (
                    <div className="space-y-1">
                      <Select
                        value={entry.deliveryPartnerId?.toString() ?? ''}
                        onValueChange={(val) =>
                          assignDeliveryPartnerMutation.mutate({ orderId: entry.id, partnerId: parseInt(val) })
                        }
                      >
                        <SelectTrigger className="h-8 text-xs rounded-lg border-blue-200 bg-blue-50">
                          <SelectValue placeholder="Assign delivery co." />
                        </SelectTrigger>
                        <SelectContent>
                          {activePartners.map((p: any) => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {entry.deliveryPartnerName && (
                        <p className="text-[10px] text-blue-600 font-medium truncate">✓ {entry.deliveryPartnerName}</p>
                      )}
                    </div>
                  ) : (
                    <Select
                      value={entry.riderId?.toString() ?? ''}
                      onValueChange={(val) => onAssignRider(entry.id, val)}
                    >
                      <SelectTrigger className="h-8 text-xs rounded-lg">
                        <SelectValue placeholder="Assign rider" />
                      </SelectTrigger>
                      <SelectContent>
                        {riders.map((r: any) => (
                          <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="min-w-[110px]">
                  {next ? (
                    <Button size="sm"
                      variant={entry.status === 'pending' ? 'destructive' : 'default'}
                      className="h-7 text-xs rounded-lg px-2"
                      onClick={() => onStatusUpdate(entry.id, next)}
                      disabled={updateStatusMutation.isPending}
                    >
                      {labelMap[entry.status]}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{entry.status}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(entry.createdAt), 'dd MMM HH:mm')}
                </TableCell>
                <TableCell>
                  <DeliveryTimer pickedUpAt={entry.pickedUpAt} deliveredAt={entry.deliveredAt} size="sm" />
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => onSelectOrder(entry)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Eye size={15} />
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
