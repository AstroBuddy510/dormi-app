import { useState, useMemo } from 'react';
import { useAuth } from '@/store';
import { useListOrders } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderDetailModal } from '@/components/ui/OrderDetailModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { format, isWithinInterval, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, getHours } from 'date-fns';
import {
  Receipt, ChevronRight, SlidersHorizontal, X, ChevronLeft,
  Calendar, Clock, ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 5;

type Status = 'all' | 'pending' | 'in_progress' | 'delivered' | 'cancelled';
type TimeSlot = 'all' | 'morning' | 'afternoon' | 'evening';

const STATUS_OPTIONS: { value: Status; label: string; color: string }[] = [
  { value: 'all',         label: 'All',        color: 'bg-gray-100 text-gray-700 border-gray-200' },
  { value: 'pending',     label: 'Pending',     color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'delivered',   label: 'Delivered',   color: 'bg-green-50 text-green-700 border-green-200' },
  { value: 'cancelled',   label: 'Cancelled',   color: 'bg-red-50 text-red-700 border-red-200' },
];

const TIME_OPTIONS: { value: TimeSlot; label: string; range: string }[] = [
  { value: 'all',       label: 'Any time',  range: '' },
  { value: 'morning',   label: '🌅 Morning',   range: '6am – 12pm' },
  { value: 'afternoon', label: '☀️ Afternoon', range: '12pm – 6pm' },
  { value: 'evening',   label: '🌙 Evening',   range: '6pm – 12am' },
];

function quickRange(key: 'today' | 'week' | 'month') {
  const now = new Date();
  if (key === 'today')  return { from: format(startOfDay(now), 'yyyy-MM-dd'), to: format(endOfDay(now), 'yyyy-MM-dd') };
  if (key === 'week')   return { from: format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd'), to: format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd') };
  return { from: format(startOfMonth(now), 'yyyy-MM-dd'), to: format(endOfMonth(now), 'yyyy-MM-dd') };
}

function inTimeSlot(dateStr: string, slot: TimeSlot) {
  if (slot === 'all') return true;
  const h = getHours(parseISO(dateStr));
  if (slot === 'morning')   return h >= 6  && h < 12;
  if (slot === 'afternoon') return h >= 12 && h < 18;
  if (slot === 'evening')   return h >= 18 || h < 6;
  return true;
}

export default function ResidentHistory() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useListOrders(
    { residentId: user?.id },
    { query: { enabled: !!user?.id, refetchInterval: 15000 } }
  );

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [showFilters, setShowFilters] = useState(false);

  const [statusFilter, setStatusFilter] = useState<Status>('all');
  const [fromDate, setFromDate]         = useState('');
  const [toDate, setToDate]             = useState('');
  const [timeSlot, setTimeSlot]         = useState<TimeSlot>('all');
  const [page, setPage]                 = useState(1);

  const activeFilterCount = [
    statusFilter !== 'all',
    fromDate !== '' || toDate !== '',
    timeSlot !== 'all',
  ].filter(Boolean).length;

  function clearFilters() {
    setStatusFilter('all');
    setFromDate('');
    setToDate('');
    setTimeSlot('all');
    setPage(1);
  }

  const IN_PROGRESS_STATUSES = ['accepted', 'ready', 'in_transit'];

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (statusFilter !== 'all') {
        if (statusFilter === 'in_progress') {
          if (!IN_PROGRESS_STATUSES.includes(order.status)) return false;
        } else if (order.status !== statusFilter) {
          return false;
        }
      }

      const orderDate = parseISO(order.createdAt);
      if (fromDate) {
        const from = startOfDay(parseISO(fromDate));
        if (orderDate < from) return false;
      }
      if (toDate) {
        const to = endOfDay(parseISO(toDate));
        if (orderDate > to) return false;
      }

      if (!inTimeSlot(order.createdAt, timeSlot)) return false;

      return true;
    });
  }, [orders, statusFilter, fromDate, toDate, timeSlot]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const paginated  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function goPage(p: number) {
    setPage(Math.max(1, Math.min(totalPages, p)));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-5 rounded-b-3xl shadow-sm border-b border-border mb-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Order History</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {filtered.length} order{filtered.length !== 1 ? 's' : ''} found
            </p>
          </div>
          <button
            onClick={() => setShowFilters(v => !v)}
            className={cn(
              'relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-sm font-medium transition-all',
              showFilters
                ? 'bg-primary text-white border-primary shadow'
                : 'bg-white text-gray-700 border-border hover:border-primary/50',
            )}
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown size={13} className={cn('transition-transform', showFilters && 'rotate-180')} />
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mt-4 space-y-4 border-t border-border pt-4">
            {/* Status chips */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(({ value, label, color }) => (
                  <button
                    key={value}
                    onClick={() => { setStatusFilter(value); setPage(1); }}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-all',
                      statusFilter === value
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : color,
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Calendar size={12} /> Date Range
                </p>
                <div className="flex gap-1.5">
                  {(['today', 'week', 'month'] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => { const r = quickRange(k); setFromDate(r.from); setToDate(r.to); setPage(1); }}
                      className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium hover:bg-primary/20 transition-colors capitalize"
                    >
                      {k === 'week' ? 'This week' : k === 'month' ? 'This month' : 'Today'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground mb-1 block">From</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => { setFromDate(e.target.value); setPage(1); }}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-gray-50"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] text-muted-foreground mb-1 block">To</label>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate}
                    onChange={(e) => { setToDate(e.target.value); setPage(1); }}
                    className="w-full text-sm border border-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/30 bg-gray-50"
                  />
                </div>
              </div>
            </div>

            {/* Time of day */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <Clock size={12} /> Time of Day
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TIME_OPTIONS.map(({ value, label, range }) => (
                  <button
                    key={value}
                    onClick={() => { setTimeSlot(value); setPage(1); }}
                    className={cn(
                      'flex flex-col items-start px-3 py-2 rounded-xl border text-left transition-all',
                      timeSlot === value
                        ? 'bg-primary text-white border-primary shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-border hover:border-primary/40',
                    )}
                  >
                    <span className="text-xs font-medium">{label}</span>
                    {range && <span className={cn('text-[10px]', timeSlot === value ? 'text-white/80' : 'text-muted-foreground')}>{range}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 text-xs text-red-500 font-medium hover:text-red-600 transition-colors"
              >
                <X size={12} /> Clear all filters
              </button>
            )}
          </div>
        )}
      </div>

      {/* Order list */}
      <div className="px-4 space-y-4 max-w-md mx-auto">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground flex flex-col items-center">
            <Receipt className="w-12 h-12 mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">No orders match your filters</p>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="mt-2 text-sm text-primary hover:underline">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          paginated.map((order) => (
            <Card
              key={order.id}
              className="rounded-2xl shadow-sm border-0 bg-white overflow-hidden cursor-pointer hover:shadow-md active:scale-[0.99] transition-all"
              onClick={() => setSelectedOrder(order)}
            >
              <div className="bg-gray-50 px-4 py-3 border-b border-border flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {format(parseISO(order.createdAt), 'MMM d, yyyy • h:mm a')}
                </span>
                <StatusBadge status={order.status} />
              </div>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-foreground text-lg">Order #{order.id}</p>
                    <p className="text-sm text-muted-foreground">
                      {order.items.length} item{order.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="font-bold text-primary text-lg tracking-tight">₵{order.total.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground uppercase">{order.paymentMethod.replace('_', ' ')}</p>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground/50 mt-1" />
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Items</p>
                  <div className="space-y-1">
                    {order.items.slice(0, 3).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-foreground">{item.quantity}× {item.itemName}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          ₵{Number(item.totalPrice ?? (item.unitPrice * item.quantity)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-primary mt-1.5 font-medium">
                        +{order.items.length - 3} more — tap to see all
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="max-w-md mx-auto px-4 mt-6">
          <div className="bg-white rounded-2xl border border-border shadow-sm p-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => goPage(safePage - 1)}
              disabled={safePage === 1}
              className="rounded-xl gap-1 text-sm"
            >
              <ChevronLeft size={15} /> Prev
            </Button>

            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => goPage(p)}
                  className={cn(
                    'w-8 h-8 rounded-lg text-sm font-medium transition-all',
                    p === safePage
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:bg-gray-100',
                  )}
                >
                  {p}
                </button>
              ))}
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => goPage(safePage + 1)}
              disabled={safePage === totalPages}
              className="rounded-xl gap-1 text-sm"
            >
              Next <ChevronRight size={15} />
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} of {filtered.length} orders
          </p>
        </div>
      )}

      <OrderDetailModal
        order={selectedOrder ? (orders.find(o => o.id === selectedOrder.id) ?? selectedOrder) : null}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
