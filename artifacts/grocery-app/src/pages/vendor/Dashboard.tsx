import { useState, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/store';
import { useListOrders, useUpdateOrderStatus, OrderStatus } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Store, CheckCircle, PackageCheck, BarChart3, MessageCircle,
  ShoppingBag, TrendingUp, Clock, Send, Star, Package,
  ChevronRight, Inbox, LogOut, Wallet, Calendar, Percent,
  Banknote, CreditCard, HandCoins, Hourglass,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import EmojiPickerButton from '@/components/EmojiPickerButton';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface VendorStats {
  ordersToday: number;
  ordersThisWeek: number;
  ordersThisMonth: number;
  totalCompleted: number;
  completedThisMonth: number;
  pendingCount: number;
  acceptedCount: number;
  readyCount: number;
  totalSubtotal: number;
  monthSubtotal: number;
  acceptanceRate: number;
}

interface VendorMessage {
  id: number;
  vendorId: number;
  senderRole: string;
  senderName: string | null;
  content: string;
  createdAt: string;
  readAt: string | null;
}

function StatCard({ icon: Icon, label, value, sub, color = 'green' }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color?: 'green' | 'blue' | 'amber' | 'purple';
}) {
  const colors = {
    green:  { bg: 'bg-green-50',  border: 'border-green-100',  icon: 'text-green-600',  val: 'text-green-700' },
    blue:   { bg: 'bg-blue-50',   border: 'border-blue-100',   icon: 'text-blue-600',   val: 'text-blue-700' },
    amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  icon: 'text-amber-600',  val: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', border: 'border-purple-100', icon: 'text-purple-600', val: 'text-purple-700' },
  }[color];

  return (
    <div className={`rounded-2xl border p-4 ${colors.bg} ${colors.border}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 bg-white shadow-sm`}>
        <Icon className={`h-5 w-5 ${colors.icon}`} />
      </div>
      <p className={`text-2xl font-bold ${colors.val}`}>{value}</p>
      <p className="text-xs font-medium text-gray-500 mt-0.5">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

function OrderCard({ order, onUpdate, isPending }: { order: any; onUpdate: (id: number, status: OrderStatus) => void; isPending: boolean }) {
  return (
    <Card className="rounded-2xl shadow-sm border border-border/50 overflow-hidden">
      <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 px-4 py-3 border-b border-border flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-bold text-gray-800">Order #{order.id}</span>
        </div>
        <StatusBadge status={order.status} />
      </div>
      <CardContent className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <p className="font-semibold text-gray-900">{order.residentName}</p>
            <p className="text-xs text-muted-foreground">{order.residentAddress}</p>
          </div>
          <p className="text-xs text-muted-foreground">{format(new Date(order.createdAt), 'dd MMM · HH:mm')}</p>
        </div>

        <div className="space-y-1.5 border-t border-border/50 pt-3">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Items to Prepare</p>
          {order.items.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center bg-gray-50 px-3 py-2 rounded-xl">
              <span className="font-medium text-sm text-gray-800">{item.itemName}</span>
              <span className="bg-white border border-border px-2 py-0.5 rounded-lg text-xs font-bold text-gray-700 shadow-sm">
                {item.quantity} {item.unit || 'x'}
              </span>
            </div>
          ))}
        </div>
      </CardContent>

      {order.status === 'pending' && (
        <CardFooter className="bg-gray-50/80 p-4 border-t border-border">
          <Button
            className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold"
            onClick={() => onUpdate(order.id, OrderStatus.accepted)}
            disabled={isPending}
          >
            <CheckCircle className="mr-2 h-4 w-4" /> Accept Order
          </Button>
        </CardFooter>
      )}
      {order.status === 'accepted' && (
        <CardFooter className="bg-gray-50/80 p-4 border-t border-border">
          <Button
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"
            onClick={() => onUpdate(order.id, OrderStatus.ready)}
            disabled={isPending}
          >
            <PackageCheck className="mr-2 h-4 w-4" /> Mark Ready for Pickup
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function ChatView({ vendorId, vendorName }: { vendorId: number; vendorName: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [message, setMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleEmojiSelect = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setMessage(prev => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? message.length;
    const end = el.selectionEnd ?? message.length;
    const newMessage = message.slice(0, start) + emoji + message.slice(end);
    setMessage(newMessage);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const { data: messages = [], isLoading } = useQuery<VendorMessage[]>({
    queryKey: ['vendor-messages', vendorId],
    queryFn: () => fetch(`${BASE}/api/vendor-messages?vendorId=${vendorId}`).then(r => r.json()),
    refetchInterval: 8000,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    messages
      .filter(m => m.senderRole === 'admin' && !m.readAt)
      .forEach(m =>
        fetch(`${BASE}/api/vendor-messages/${m.id}/read`, { method: 'PUT' })
      );
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      fetch(`${BASE}/api/vendor-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, senderRole: 'vendor', senderName: vendorName, content }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-messages', vendorId] });
      setMessage('');
    },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  const handleSend = () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <p className="text-sm text-muted-foreground">Loading messages…</p>
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-240px)]">
      <div className="bg-white rounded-2xl border border-border shadow-sm flex flex-col flex-1 overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-gradient-to-r from-primary/5 to-transparent flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <MessageCircle className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-900">Dormi Support</p>
            <p className="text-[11px] text-muted-foreground">We typically reply within a few hours</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-8">
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
                <MessageCircle className="h-7 w-7 text-primary" />
              </div>
              <p className="font-semibold text-gray-700 mb-1">Start a conversation</p>
              <p className="text-sm text-muted-foreground max-w-xs">
                Send a message to Dormi admin. We're here to help with any questions or concerns.
              </p>
            </div>
          ) : (
            messages.map(msg => {
              const isVendor = msg.senderRole === 'vendor';
              return (
                <div key={msg.id} className={`flex ${isVendor ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                    isVendor
                      ? 'bg-primary text-white rounded-tr-sm'
                      : 'bg-gray-100 text-foreground rounded-tl-sm'
                  }`}>
                    {!isVendor && (
                      <p className="text-[10px] font-semibold text-primary mb-0.5">{msg.senderName ?? 'Dormi Support'}</p>
                    )}
                    <p className="text-sm leading-snug">{msg.content}</p>
                    <p className={`text-[10px] mt-1 text-right ${isVendor ? 'text-white/60' : 'text-muted-foreground'}`}>
                      {format(new Date(msg.createdAt), 'dd MMM · HH:mm')}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        <div className="px-4 pb-4 pt-2 border-t border-border">
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Type your message…"
                rows={2}
                className="w-full resize-none rounded-xl border border-border bg-gray-50 pl-3 pr-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-colors"
              />
              <EmojiPickerButton
                onEmojiSelect={handleEmojiSelect}
                className="absolute right-2 bottom-2"
              />
            </div>
            <Button
              onClick={handleSend}
              disabled={!message.trim() || sendMutation.isPending}
              className="h-11 w-11 p-0 rounded-xl bg-primary hover:bg-primary/90"
            >
              <Send size={15} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sales Overview ───────────────────────────────────────────────────────────

type RangePreset = 'today' | 'week' | 'month' | 'custom';

interface VendorOverview {
  vendorId: number;
  commissionPercent: number;
  from: string;
  to: string;
  orderCount: number;
  totalSales: number;
  totalCommission: number;
  daily: { date: string; sales: number; commission: number; orders: number }[];
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function resolveRange(preset: RangePreset, custom: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') {
    return { from: ymd(today), to: ymd(today) };
  }
  if (preset === 'week') {
    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay()); // Sunday
    return { from: ymd(start), to: ymd(today) };
  }
  if (preset === 'month') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: ymd(start), to: ymd(today) };
  }
  return { from: custom.from || ymd(today), to: custom.to || ymd(today) };
}

const CEDI = (n: number) => `GH₵${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function SalesOverview({ vendorId }: { vendorId: number }) {
  const [preset, setPreset] = useState<RangePreset>('month');
  const todayKey = ymd(new Date());
  const [customFrom, setCustomFrom] = useState<string>(todayKey);
  const [customTo, setCustomTo] = useState<string>(todayKey);

  const range = useMemo(
    () => resolveRange(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );

  const { data, isLoading, isError } = useQuery<VendorOverview>({
    queryKey: ['vendor-overview', vendorId, range.from, range.to],
    queryFn: () =>
      fetch(`${BASE}/api/vendor/overview?vendorId=${vendorId}&from=${range.from}&to=${range.to}`)
        .then(r => {
          if (!r.ok) throw new Error('Failed to load overview');
          return r.json();
        }),
    enabled: !!vendorId && !!range.from && !!range.to,
    refetchInterval: 60000,
  });

  const chartData = useMemo(
    () =>
      (data?.daily ?? []).map(d => ({
        ...d,
        // Short x-axis label: "15 Apr"
        label: format(new Date(`${d.date}T00:00:00`), 'dd MMM'),
      })),
    [data?.daily],
  );

  const presets: { id: RangePreset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week',  label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Sales Overview</p>
        {data?.commissionPercent !== undefined && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-purple-700 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded-full">
            <Percent className="h-3 w-3" /> {data.commissionPercent}% commission rate
          </span>
        )}
      </div>

      {/* Period toggle */}
      <div className="grid grid-cols-4 gap-1 p-1 bg-gray-100 rounded-xl">
        {presets.map(p => (
          <button
            key={p.id}
            onClick={() => setPreset(p.id)}
            className={`py-2 rounded-lg text-xs font-bold transition-all ${
              preset === p.id
                ? 'bg-white shadow-sm text-gray-900'
                : 'text-muted-foreground hover:text-gray-700'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === 'custom' && (
        <div className="grid grid-cols-2 gap-3 bg-white border border-border rounded-xl p-3">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Calendar className="h-3 w-3" /> From
            </label>
            <Input
              type="date"
              value={customFrom}
              max={customTo || todayKey}
              onChange={e => setCustomFrom(e.target.value)}
              className="h-10 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Calendar className="h-3 w-3" /> To
            </label>
            <Input
              type="date"
              value={customTo}
              min={customFrom}
              max={todayKey}
              onChange={e => setCustomTo(e.target.value)}
              className="h-10 rounded-lg text-sm"
            />
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
          <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center mb-3">
            <ShoppingBag className="h-5 w-5 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-700 leading-tight">
            {isLoading ? '…' : CEDI(data?.totalSales ?? 0)}
          </p>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Total Sales</p>
          <p className="text-[11px] text-gray-400 mt-1">{data?.orderCount ?? 0} orders</p>
        </div>

        <div className="rounded-2xl border border-purple-100 bg-purple-50 p-4">
          <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center mb-3">
            <Wallet className="h-5 w-5 text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-700 leading-tight">
            {isLoading ? '…' : CEDI(data?.totalCommission ?? 0)}
          </p>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Commission Paid</p>
          <p className="text-[11px] text-gray-400 mt-1">
            to platform · {data?.commissionPercent ?? 0}% of sales
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-border bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-800">Daily Sales</p>
          <p className="text-[11px] text-muted-foreground">
            {range.from === range.to
              ? format(new Date(`${range.from}T00:00:00`), 'dd MMM yyyy')
              : `${format(new Date(`${range.from}T00:00:00`), 'dd MMM')} – ${format(new Date(`${range.to}T00:00:00`), 'dd MMM yyyy')}`}
          </p>
        </div>
        {isError ? (
          <p className="text-sm text-red-600 py-6 text-center">Couldn't load overview. Try again.</p>
        ) : isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
        ) : chartData.length === 0 || (data?.orderCount ?? 0) === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center gap-2">
            <Inbox className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No sales in this range</p>
          </div>
        ) : (
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  interval="preserveStartEnd"
                  tickLine={false}
                  axisLine={{ stroke: '#e5e7eb' }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={v => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
                  width={38}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(16, 185, 129, 0.06)' }}
                  contentStyle={{
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    fontSize: 12,
                    padding: '8px 12px',
                  }}
                  formatter={(value: number, name: string) =>
                    [CEDI(value), name === 'sales' ? 'Sales' : 'Commission']
                  }
                  labelFormatter={label => `${label}`}
                />
                <Bar dataKey="sales" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

interface PayoutBreakdownData {
  vendorId: number;
  commissionPercent: number;
  totalEarnings: number;
  paystackPortion: number;
  cashPortion: number;
  unpaid: { total: number; paystack: number; cash: number; orderCount: number };
  inFlight: { total: number; paystack: number; cash: number; requestCount: number };
}

function PayoutBreakdown({ vendorId }: { vendorId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data, isLoading, isError } = useQuery<PayoutBreakdownData>({
    queryKey: ['vendor-payout-breakdown', vendorId],
    queryFn: () =>
      fetch(`${BASE}/api/payouts/breakdown?vendorId=${vendorId}`).then(r => {
        if (!r.ok) throw new Error('Failed to load payout breakdown');
        return r.json();
      }),
    enabled: !!vendorId,
    refetchInterval: 30000,
  });

  const requestPayout = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE}/api/payouts/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? 'Failed to request payout');
      return body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-payout-breakdown', vendorId] });
      queryClient.invalidateQueries({ queryKey: ['vendor-payout-history', vendorId] });
      toast({
        title: 'Payout Requested',
        description: 'Your request has been sent to admin for processing.',
      });
      setConfirmOpen(false);
    },
    onError: (err: any) => {
      toast({
        title: 'Could Not Request Payout',
        description: err.message ?? 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  const unpaidTotal = data?.unpaid.total ?? 0;
  const canRequest = unpaidTotal > 0 && !requestPayout.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Payout Breakdown</p>
        {(data?.inFlight.requestCount ?? 0) > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
            <Hourglass className="h-3 w-3" /> {data!.inFlight.requestCount} pending
          </span>
        )}
      </div>

      {isError ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          Couldn't load payout breakdown. Pull down to retry.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3">
            {/* Total Earnings */}
            <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
              <div className="flex items-start justify-between">
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center">
                  <Banknote className="h-5 w-5 text-green-600" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-green-700 bg-white/60 px-2 py-0.5 rounded-full">
                  Net · after {data?.commissionPercent ?? 0}% commission
                </span>
              </div>
              <p className="text-2xl font-bold text-green-700 leading-tight mt-3">
                {isLoading ? '…' : CEDI(data?.totalEarnings ?? 0)}
              </p>
              <p className="text-xs font-medium text-gray-500 mt-0.5">Total Earnings</p>
              <p className="text-[11px] text-gray-400 mt-1">lifetime from delivered orders</p>
            </div>

            {/* Paystack + Cash — two columns */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center mb-3">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                </div>
                <p className="text-xl font-bold text-blue-700 leading-tight">
                  {isLoading ? '…' : CEDI(data?.paystackPortion ?? 0)}
                </p>
                <p className="text-xs font-medium text-gray-500 mt-0.5">Paid via Paystack</p>
                <p className="text-[11px] text-gray-400 mt-1">cleared online</p>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center mb-3">
                  <HandCoins className="h-5 w-5 text-amber-600" />
                </div>
                <p className="text-xl font-bold text-amber-700 leading-tight">
                  {isLoading ? '…' : CEDI(data?.cashPortion ?? 0)}
                </p>
                <p className="text-xs font-medium text-gray-500 mt-0.5">Cash on Delivery</p>
                <p className="text-[11px] text-gray-400 mt-1">collected at doorstep</p>
              </div>
            </div>
          </div>

          {/* Unpaid + Request Button */}
          <div className="rounded-2xl border border-border bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unpaid Balance</p>
                <p className="text-xl font-bold text-gray-900 mt-0.5">
                  {isLoading ? '…' : CEDI(unpaidTotal)}
                </p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {data?.unpaid.orderCount ?? 0} delivered order{(data?.unpaid.orderCount ?? 0) === 1 ? '' : 's'} · waiting to be requested
                </p>
              </div>
              <Wallet className="h-8 w-8 text-gray-300" />
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={!canRequest}
              className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4 mr-2" />
              Request Payout
            </Button>
            {unpaidTotal === 0 && !isLoading && (
              <p className="text-[11px] text-center text-muted-foreground mt-2">
                No unpaid earnings yet. New delivered orders will show here.
              </p>
            )}
          </div>
        </>
      )}

      {/* Confirmation modal */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-green-600" />
              Confirm Payout Request
            </DialogTitle>
            <DialogDescription>
              Admin will review and transfer your earnings. This snapshots your current unpaid balance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 bg-gray-50 rounded-xl p-4 border border-border">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paystack portion</span>
              <span className="font-semibold text-blue-700">{CEDI(data?.unpaid.paystack ?? 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Cash portion</span>
              <span className="font-semibold text-amber-700">{CEDI(data?.unpaid.cash ?? 0)}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between">
              <span className="font-semibold text-gray-800">Total</span>
              <span className="font-bold text-green-700 text-lg">{CEDI(unpaidTotal)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              Across {data?.unpaid.orderCount ?? 0} delivered order{(data?.unpaid.orderCount ?? 0) === 1 ? '' : 's'}.
            </p>
          </div>

          <DialogFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setConfirmOpen(false)}
              disabled={requestPayout.isPending}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 rounded-xl bg-green-600 hover:bg-green-700 text-white"
              onClick={() => requestPayout.mutate()}
              disabled={requestPayout.isPending || unpaidTotal === 0}
            >
              {requestPayout.isPending ? 'Requesting…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Tab = 'overview' | 'orders' | 'chat';

export default function VendorDashboard() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [orderType, setOrderType] = useState<'app' | 'call'>('app');

  const { data: appOrders = [], isLoading: isLoadingApp } = useListOrders({ vendorId: user?.id, callOnly: false });
  const { data: callOrders = [], isLoading: isLoadingCall } = useListOrders({ vendorId: user?.id, callOnly: true });

  const { data: stats } = useQuery<VendorStats>({
    queryKey: ['vendor-stats', user?.id],
    queryFn: () => fetch(`${BASE}/api/vendor/stats?vendorId=${user?.id}`).then(r => r.json()),
    enabled: !!user?.id,
    refetchInterval: 30000,
  });

  const { data: unreadData } = useQuery<{ total: number }>({
    queryKey: ['vendor-messages-unread', user?.id],
    queryFn: () => fetch(`${BASE}/api/vendor-messages/unread-count`).then(r => r.json()),
    enabled: !!user?.id,
    refetchInterval: 15000,
    select: (data) => {
      const byVendor = (data as any).byVendor ?? {};
      return { total: byVendor[user?.id!] ?? 0 };
    },
  });
  const chatUnread = unreadData?.total ?? 0;

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        queryClient.invalidateQueries({ queryKey: ['vendor-stats', user?.id] });
        toast({ title: 'Order Updated', description: 'Status changed successfully.' });
      },
    },
  });

  const handleUpdate = (orderId: number, status: OrderStatus) => {
    updateStatus.mutate({ id: orderId, data: { status } });
  };

  const activeOrders = appOrders.filter(o => ['pending', 'accepted', 'ready'].includes(o.status));
  const totalActive = activeOrders.length + callOrders.filter(o => ['pending', 'accepted', 'ready'].includes(o.status)).length;

  const tabs: { id: Tab; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'orders',   label: 'Orders',   icon: Package, badge: totalActive },
    { id: 'chat',     label: 'Support',  icon: MessageCircle, badge: chatUnread },
  ];

  return (
    <div className="min-h-screen bg-gray-50/60">
      <div className="bg-primary px-5 pt-12 pb-5 text-white">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-white/70 font-medium uppercase tracking-wide">Vendor Hub</p>
              <h1 className="text-lg font-bold leading-tight">{user?.name ?? 'Vendor'}</h1>
            </div>
          </div>
          <button
            onClick={logout}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <LogOut className="h-4 w-4 text-white" />
          </button>
        </div>
      </div>

      <div className="sticky top-0 z-10 bg-white border-b border-border shadow-sm">
        <div className="flex px-4 gap-1 pt-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
              {(tab.badge ?? 0) > 0 && (
                <span className="absolute top-1.5 right-2 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-5 max-w-lg mx-auto">
        {activeTab === 'overview' && (
          <div className="space-y-5">
            {user?.id && <SalesOverview vendorId={user.id} />}

            {user?.id && <PayoutBreakdown vendorId={user.id} />}

            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Today's Activity</p>
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={ShoppingBag} label="Orders Today" value={stats?.ordersToday ?? 0} color="green" />
                <StatCard icon={Clock} label="Active Now" value={(stats?.pendingCount ?? 0) + (stats?.acceptedCount ?? 0)} sub="Pending + Accepted" color="amber" />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">This Month</p>
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={TrendingUp} label="Orders" value={stats?.ordersThisMonth ?? 0} color="blue" />
                <StatCard icon={CheckCircle} label="Completed" value={stats?.completedThisMonth ?? 0} color="green" />
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">All Time</p>
              <div className="grid grid-cols-2 gap-3">
                <StatCard icon={Store} label="Total Completed" value={stats?.totalCompleted ?? 0} color="purple" />
                <StatCard
                  icon={Star}
                  label="Acceptance Rate"
                  value={`${stats?.acceptanceRate ?? 100}%`}
                  sub="Orders processed"
                  color={((stats?.acceptanceRate ?? 100) >= 90) ? 'green' : 'amber'}
                />
              </div>
            </div>

            {(stats?.ordersToday ?? 0) === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-white p-6 text-center">
                <Inbox className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="font-semibold text-gray-700">No orders yet today</p>
                <p className="text-sm text-muted-foreground mt-1">New orders will appear in the Orders tab</p>
                <Button
                  variant="outline"
                  className="mt-4 rounded-xl"
                  onClick={() => setActiveTab('orders')}
                >
                  View Orders <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex bg-gray-200/50 rounded-xl p-1 gap-1">
              {(['app', 'call'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setOrderType(type)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    orderType === type ? 'bg-white shadow-sm text-gray-900' : 'text-muted-foreground'
                  }`}
                >
                  {type === 'app' ? 'App Orders' : 'Call Orders'}
                </button>
              ))}
            </div>

            {orderType === 'app' ? (
              isLoadingApp ? (
                <p className="text-center py-10 text-muted-foreground text-sm">Loading…</p>
              ) : appOrders.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground font-medium">No app orders</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {appOrders.map(order => (
                    <OrderCard key={order.id} order={order} onUpdate={handleUpdate} isPending={updateStatus.isPending} />
                  ))}
                </div>
              )
            ) : (
              isLoadingCall ? (
                <p className="text-center py-10 text-muted-foreground text-sm">Loading…</p>
              ) : callOrders.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground font-medium">No call orders</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {callOrders.map(order => (
                    <OrderCard key={order.id} order={order} onUpdate={handleUpdate} isPending={updateStatus.isPending} />
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {activeTab === 'chat' && user?.id && (
          <ChatView vendorId={user.id} vendorName={user.name ?? 'Vendor'} />
        )}
      </div>
    </div>
  );
}
