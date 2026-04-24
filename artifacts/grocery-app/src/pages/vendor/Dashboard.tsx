import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/store';
import { useListOrders, useUpdateOrderStatus, OrderStatus } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  Store, CheckCircle, PackageCheck, BarChart3, MessageCircle,
  ShoppingBag, TrendingUp, Clock, Send, Star, Package,
  ChevronRight, Inbox, LogOut,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import EmojiPickerButton from '@/components/EmojiPickerButton';

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
