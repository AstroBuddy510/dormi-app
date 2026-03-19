import { useState, useMemo } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import {
  useGetAdminStats,
  useListOrders,
  useUpdateOrderStatus,
  useAssignRider,
  useListRiders,
} from '@workspace/api-client-react';
import { Card, CardContent } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  format, parseISO, startOfDay, endOfDay,
  startOfWeek, endOfWeek, isWithinInterval,
} from 'date-fns';
import {
  Activity, ShoppingCart, Users, DollarSign, RefreshCcw,
  CheckCircle, Package, Eye, ChevronLeft, ChevronRight,
  Calendar, Clock3,
} from 'lucide-react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { OrderDetailModal } from '@/components/ui/OrderDetailModal';
import { cn } from '@/lib/utils';

interface DeliveryPartner { id: number; name: string; isActive: boolean; }

type LiveFilter  = 'all' | 'pending' | 'in_progress';
type DatePreset  = 'today' | 'week' | 'custom';

const HISTORY_PAGE_SIZE = 10;

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  /* ── UI state ─────────────────────────────────────── */
  const [liveFilter, setLiveFilter]     = useState<LiveFilter>('all');
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isRefreshing, setIsRefreshing]   = useState(false);

  /* History filters */
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [fromDate, setFromDate]     = useState('');
  const [toDate, setToDate]         = useState('');
  const [historyPage, setHistoryPage] = useState(1);

  /* ── Data ─────────────────────────────────────────── */
  const { data: stats, refetch: refetchStats } = useGetAdminStats({
    query: { refetchInterval: 30_000 },
  });
  const { data: allOrders = [], isLoading: ordersLoading, refetch: refetchOrders } = useListOrders(
    undefined,
    { query: { refetchInterval: 30_000 } },
  );
  const { data: riders = [] }          = useListRiders();
  const { data: deliveryPartners = [] } = useQuery<DeliveryPartner[]>({
    queryKey: ['/api/delivery-partners'],
    queryFn: () => fetch('/api/delivery-partners').then(r => r.json()),
  });
  const activePartners = deliveryPartners.filter(p => p.isActive);

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

  /* ── Refresh ──────────────────────────────────────── */
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      refetchOrders(),
      refetchStats(),
      queryClient.invalidateQueries(),
    ]);
    setTimeout(() => setIsRefreshing(false), 600);
  };

  /* ── Handlers ─────────────────────────────────────── */
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

  /* ── Derived: live orders (non-delivered, non-cancelled) ── */
  const liveOrders = useMemo(() => {
    return allOrders.filter((o) => {
      if (o.status === 'delivered' || o.status === 'cancelled') return false;
      if (liveFilter === 'pending')     return o.status === 'pending';
      if (liveFilter === 'in_progress') return ['accepted', 'ready', 'in_transit'].includes(o.status);
      return true;
    });
  }, [allOrders, liveFilter]);

  /* ── Derived: delivered history ──────────────────────── */
  const deliveredAll = useMemo(
    () => allOrders.filter(o => o.status === 'delivered'),
    [allOrders]
  );

  const deliveredFiltered = useMemo(() => {
    const now = new Date();
    return deliveredAll.filter((o) => {
      const date = parseISO(o.createdAt);
      if (datePreset === 'today') {
        return isWithinInterval(date, { start: startOfDay(now), end: endOfDay(now) });
      }
      if (datePreset === 'week') {
        return isWithinInterval(date, {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        });
      }
      if (datePreset === 'custom') {
        if (fromDate && date < startOfDay(parseISO(fromDate))) return false;
        if (toDate   && date > endOfDay(parseISO(toDate)))     return false;
        return true;
      }
      return true;
    });
  }, [deliveredAll, datePreset, fromDate, toDate]);

  const historyTotalPages = Math.max(1, Math.ceil(deliveredFiltered.length / HISTORY_PAGE_SIZE));
  const safePage          = Math.min(historyPage, historyTotalPages);
  const historyPage_data  = deliveredFiltered.slice(
    (safePage - 1) * HISTORY_PAGE_SIZE,
    safePage * HISTORY_PAGE_SIZE
  );

  function goHistoryPage(p: number) {
    setHistoryPage(Math.max(1, Math.min(historyTotalPages, p)));
  }

  /* ── Period label ────────────────────────────────────── */
  const periodLabel =
    datePreset === 'today'  ? 'Today' :
    datePreset === 'week'   ? 'This Week' :
    (fromDate && toDate)    ? `${fromDate} – ${toDate}` : 'All Time';

  /* ── Period-scoped orders (all statuses, within date range) ── */
  const periodOrders = useMemo(() => {
    const now = new Date();
    return allOrders.filter((o) => {
      const date = parseISO(o.createdAt);
      if (datePreset === 'today') {
        return isWithinInterval(date, { start: startOfDay(now), end: endOfDay(now) });
      }
      if (datePreset === 'week') {
        return isWithinInterval(date, {
          start: startOfWeek(now, { weekStartsOn: 1 }),
          end: endOfWeek(now, { weekStartsOn: 1 }),
        });
      }
      if (datePreset === 'custom') {
        if (fromDate && date < startOfDay(parseISO(fromDate))) return false;
        if (toDate   && date > endOfDay(parseISO(toDate)))     return false;
        return true;
      }
      return true;
    });
  }, [allOrders, datePreset, fromDate, toDate]);

  const periodRevenue = useMemo(
    () => periodOrders.filter(o => o.status === 'delivered').reduce((sum, o) => sum + parseFloat(o.total ?? '0'), 0),
    [periodOrders]
  );

  /* ── Stat cards ──────────────────────────────────────── */
  const statCards = [
    { title: 'Total Orders',  value: periodOrders.length,                                             icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { title: 'Pending',       value: periodOrders.filter(o => o.status === 'pending').length,         icon: Activity,     color: 'text-red-600 bg-red-50' },
    { title: 'In Progress',   value: periodOrders.filter(o => ['accepted','ready','in_transit'].includes(o.status)).length, icon: Package, color: 'text-amber-600 bg-amber-50' },
    { title: 'Delivered',     value: periodOrders.filter(o => o.status === 'delivered').length,       icon: CheckCircle,  color: 'text-green-600 bg-green-50' },
    { title: 'Subscribers',   value: stats?.subscriberCount ?? 0,                                     icon: Users,        color: 'text-purple-600 bg-purple-50' },
    { title: 'Revenue',       value: `GH₵ ${periodRevenue.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
  ];

  const liveTabs: { label: string; value: LiveFilter }[] = [
    { label: 'All Active', value: 'all' },
    { label: 'Pending',    value: 'pending' },
    { label: 'In Progress', value: 'in_progress' },
  ];

  const nextStatus: Record<string, string | null> = {
    pending: 'accepted', accepted: 'ready', ready: 'in_transit', in_transit: 'delivered',
    delivered: null, cancelled: null,
  };
  const nextStatusLabel: Record<string, string> = {
    pending: 'Accept', accepted: 'Mark Ready', ready: 'In Transit', in_transit: 'Delivered',
  };

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto space-y-8">

        {/* ── Header ── */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Live Orders Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Real-time overview of all orders</p>
          </div>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-xl border-border gap-2 min-w-[110px]"
          >
            <RefreshCcw className={cn('h-4 w-4 transition-transform duration-500', isRefreshing && 'animate-spin')} />
            {isRefreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        {/* ── Stat Cards ── */}
        <p className="text-sm font-medium text-muted-foreground">
          Stats for: <span className="text-foreground font-semibold">{periodLabel}</span>
          <span className="ml-2 text-xs text-muted-foreground/60">· auto-refreshes every 30s</span>
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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

        {/* ── Live Orders ── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-bold text-foreground">Live Orders</h2>
              <p className="text-xs text-muted-foreground">{liveOrders.length} active order{liveOrders.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2">
              {liveTabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setLiveFilter(tab.value)}
                  className={cn(
                    'px-3 py-1.5 rounded-xl text-xs font-medium transition-all',
                    liveFilter === tab.value
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-white border border-border text-muted-foreground hover:text-foreground',
                  )}
                >
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
                  nextStatus={nextStatus}
                  nextStatusLabel={nextStatusLabel}
                  updateStatusMutation={updateStatusMutation}
                  assignRiderMutation={assignRiderMutation}
                  assignDeliveryPartnerMutation={assignDeliveryPartnerMutation}
                  onSelectOrder={setSelectedOrder}
                  onStatusUpdate={handleStatusUpdate}
                  onAssignRider={handleAssignRider}
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
                {deliveredFiltered.length} order{deliveredFiltered.length !== 1 ? 's' : ''} · showing {HISTORY_PAGE_SIZE} per page
              </p>
            </div>

            {/* Date filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Preset chips */}
              {(['today', 'week'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setDatePreset(p); setHistoryPage(1); }}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                    datePreset === p
                      ? 'bg-green-600 text-white border-green-600 shadow-sm'
                      : 'bg-white border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Clock3 size={11} />
                  {p === 'today' ? 'Today' : 'This Week'}
                </button>
              ))}

              {/* Custom range */}
              <button
                onClick={() => { setDatePreset('custom'); setHistoryPage(1); }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all',
                  datePreset === 'custom'
                    ? 'bg-green-600 text-white border-green-600 shadow-sm'
                    : 'bg-white border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Calendar size={11} /> Custom range
              </button>

              {datePreset === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => { setFromDate(e.target.value); setHistoryPage(1); }}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  />
                  <span className="text-xs text-muted-foreground">→</span>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    onChange={(e) => { setToDate(e.target.value); setHistoryPage(1); }}
                    className="text-xs border border-border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  />
                </div>
              )}
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
                          <TableHead>Resident</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Vendor</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Rider / Partner</TableHead>
                          <TableHead>Delivered At</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {historyPage_data.map((order) => (
                          <TableRow key={order.id} className="hover:bg-gray-50/50">
                            <TableCell>
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="font-bold text-green-700 hover:underline"
                              >
                                #{order.id}
                              </button>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{order.residentName || '—'}</p>
                              <p className="text-xs text-muted-foreground">{order.residentPhone || ''}</p>
                            </TableCell>
                            <TableCell className="text-sm max-w-[160px]">
                              {Array.isArray(order.items) && order.items.length > 0 ? (
                                <div className="space-y-0.5">
                                  {order.items.slice(0, 2).map((item: any, i: number) => (
                                    <p key={i} className="truncate text-xs">{item.itemName} ×{item.quantity}</p>
                                  ))}
                                  {order.items.length > 2 && (
                                    <p className="text-xs text-muted-foreground">+{order.items.length - 2} more</p>
                                  )}
                                </div>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{order.vendorName || '—'}</TableCell>
                            <TableCell className="font-bold text-green-700">₵{order.total.toFixed(2)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {(order as any).orderType === 'third_party'
                                ? ((order as any).deliveryPartnerName || '—')
                                : (order.riderName || '—')}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(parseISO(order.updatedAt), 'dd MMM yyyy, HH:mm')}
                            </TableCell>
                            <TableCell>
                              <button
                                onClick={() => setSelectedOrder(order)}
                                title="View order details"
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-green-700 hover:bg-green-50 transition-colors"
                              >
                                <Eye size={15} />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Pagination */}
                  {historyTotalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-gray-50/50">
                      <p className="text-xs text-muted-foreground">
                        Showing {(safePage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(safePage * HISTORY_PAGE_SIZE, deliveredFiltered.length)} of {deliveredFiltered.length} orders
                      </p>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => goHistoryPage(safePage - 1)}
                          disabled={safePage === 1}
                          className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        {Array.from({ length: historyTotalPages }, (_, i) => i + 1).map((p) => (
                          <button
                            key={p}
                            onClick={() => goHistoryPage(p)}
                            className={cn(
                              'w-7 h-7 rounded-lg text-xs font-medium transition-all',
                              p === safePage
                                ? 'bg-green-600 text-white shadow-sm'
                                : 'bg-white border border-border text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {p}
                          </button>
                        ))}
                        <button
                          onClick={() => goHistoryPage(safePage + 1)}
                          disabled={safePage === historyTotalPages}
                          className="p-1.5 rounded-lg border border-border bg-white text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
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
    </div>
  );
}

/* ── Extracted live orders table ────────────────────────── */
function LiveOrdersTable({
  orders, riders, activePartners, nextStatus, nextStatusLabel,
  updateStatusMutation, assignRiderMutation, assignDeliveryPartnerMutation,
  onSelectOrder, onStatusUpdate, onAssignRider,
}: any) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader className="bg-gray-50">
          <TableRow>
            <TableHead className="w-14">ID</TableHead>
            <TableHead className="w-8"></TableHead>
            <TableHead>Resident</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Rider / Delivery Co.</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Time</TableHead>
            <TableHead className="w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order: any) => {
            const next = nextStatus[order.status];
            return (
              <TableRow key={order.id} className="hover:bg-gray-50/50">
                <TableCell>
                  <button
                    onClick={() => onSelectOrder(order)}
                    className="font-bold text-primary hover:underline hover:text-primary/80 transition-colors"
                  >
                    #{order.id}
                  </button>
                </TableCell>
                <TableCell></TableCell>
                <TableCell>
                  <div>
                    <p className="font-medium">{order.residentName || '—'}</p>
                    <p className="text-xs text-muted-foreground">{order.residentPhone || ''}</p>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                  {order.residentAddress || '—'}
                </TableCell>
                <TableCell className="text-sm max-w-[160px]">
                  {Array.isArray(order.items) && order.items.length > 0 ? (
                    <div className="space-y-0.5">
                      {order.items.slice(0, 2).map((item: any, i: number) => (
                        <p key={i} className="truncate text-xs">{item.itemName} ×{item.quantity}</p>
                      ))}
                      {order.items.length > 2 && (
                        <p className="text-xs text-muted-foreground">+{order.items.length - 2} more</p>
                      )}
                    </div>
                  ) : '—'}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{order.vendorName || '—'}</TableCell>
                <TableCell className="font-bold text-primary">₵{order.total.toFixed(2)}</TableCell>
                <TableCell><StatusBadge status={order.status} /></TableCell>
                <TableCell className="min-w-[160px]">
                  {order.orderType === 'third_party' ? (
                    <div className="space-y-1">
                      <Select
                        value={order.deliveryPartnerId?.toString() ?? ''}
                        onValueChange={(val) =>
                          assignDeliveryPartnerMutation.mutate({ orderId: order.id, partnerId: parseInt(val) })
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
                      {order.deliveryPartnerName && (
                        <p className="text-[10px] text-blue-600 font-medium truncate">✓ {order.deliveryPartnerName}</p>
                      )}
                    </div>
                  ) : (
                    <Select
                      value={order.riderId?.toString() ?? ''}
                      onValueChange={(val) => onAssignRider(order.id, val)}
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
                    <Button
                      size="sm"
                      variant={order.status === 'pending' ? 'destructive' : 'default'}
                      className="h-7 text-xs rounded-lg px-2"
                      onClick={() => onStatusUpdate(order.id, next)}
                      disabled={updateStatusMutation.isPending}
                    >
                      {nextStatusLabel[order.status]}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{order.status}</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(order.createdAt), 'dd MMM HH:mm')}
                </TableCell>
                <TableCell>
                  <button
                    onClick={() => onSelectOrder(order)}
                    title="View order details"
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
