import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/store';
import { useGetResident, useUpdateSubscription } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  ShoppingBag, CalendarClock, ListOrdered, Bell, X, CheckCheck,
  Info, Megaphone, ShoppingCart, Tag, MessageCircle, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type Notification = {
  id: number;
  residentId: number | null;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
};

const TYPE_ICON: Record<string, React.ElementType> = {
  info: Info,
  order: ShoppingCart,
  promo: Tag,
  alert: Megaphone,
};

const TYPE_COLOR: Record<string, string> = {
  info: 'bg-blue-100 text-blue-600',
  order: 'bg-green-100 text-green-600',
  promo: 'bg-yellow-100 text-yellow-600',
  alert: 'bg-red-100 text-red-600',
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ResidentHome() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [avatarImgError, setAvatarImgError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: resident } = useGetResident(user?.id || 0, {
    query: { enabled: !!user?.id }
  });

  const { data: convs = [] } = useQuery<any[]>({
    queryKey: ['res-conversations', user?.id],
    queryFn: () =>
      fetch(`${BASE}/api/agent-messages/conversations?residentId=${user?.id}`).then(r => r.json()),
    refetchInterval: 15000,
    enabled: !!user?.id,
  });
  const unreadMessages = (convs as any[]).reduce((sum, c) => sum + (c.unread ?? 0), 0);

  const { data: notifData, refetch: refetchNotifs } = useQuery<{ notifications: Notification[]; unread: number }>({
    queryKey: ['res-notifications', user?.id],
    queryFn: () =>
      fetch(`${BASE}/api/notifications?residentId=${user?.id}`).then(r => r.json()),
    refetchInterval: 30000,
    enabled: !!user?.id,
  });
  const notifications = notifData?.notifications ?? [];
  const unreadNotifs = notifData?.unread ?? 0;
  const totalUnread = unreadMessages + unreadNotifs;

  const markAllRead = useMutation({
    mutationFn: () =>
      fetch(`${BASE}/api/notifications/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residentId: user?.id }),
      }).then(r => r.json()),
    onSuccess: () => refetchNotifs(),
  });

  const markOneRead = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/notifications/${id}/read`, { method: 'PUT' }).then(r => r.json()),
    onSuccess: () => refetchNotifs(),
  });

  useEffect(() => {
    if (!panelOpen) return;
    function handler(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [panelOpen]);

  const updateSubMutation = useUpdateSubscription({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/residents', user?.id] });
        toast({ title: "Subscription updated", description: "Your weekly preference has been saved." });
      }
    }
  });

  const handleToggleSub = (checked: boolean) => {
    if (!user) return;
    updateSubMutation.mutate({
      id: user.id,
      data: { subscribeWeekly: checked, subscriptionDay: checked ? 'Friday' : undefined }
    });
  };

  const firstName = user?.name?.split(' ')[0] || 'Resident';
  const avatarLetter = firstName.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-6 rounded-b-3xl shadow-sm border-b border-border mb-6 relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground font-medium text-sm">Welcome back,</p>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {firstName} 👋
            </h1>
          </div>

          {/* Bell notification button */}
          <button
            onClick={() => setPanelOpen(v => !v)}
            className="relative h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border-2 border-white shadow-md hover:bg-primary/20 transition-colors active:scale-95"
          >
            <Bell
              size={22}
              className={cn('text-primary transition-transform', totalUnread > 0 && 'animate-[wiggle_0.5s_ease-in-out]')}
            />
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
        </div>

        {/* Notification panel */}
        <AnimatePresence>
          {panelOpen && (
            <motion.div
              ref={panelRef}
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="absolute top-full right-4 left-4 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[75vh] flex flex-col"
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <h2 className="font-bold text-base text-foreground">Notifications</h2>
                <div className="flex items-center gap-2">
                  {unreadNotifs > 0 && (
                    <button
                      onClick={() => markAllRead.mutate()}
                      className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
                    >
                      <CheckCheck size={13} /> Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setPanelOpen(false)}
                    className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto flex-1">
                {/* Messages section */}
                {unreadMessages > 0 && (
                  <button
                    onClick={() => { setPanelOpen(false); setLocation('/messages'); }}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-primary/5 border-b border-border hover:bg-primary/10 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <MessageCircle size={17} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {unreadMessages} unread message{unreadMessages > 1 ? 's' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">From your support agent</p>
                    </div>
                    <ChevronRight size={15} className="text-muted-foreground shrink-0" />
                  </button>
                )}

                {/* Admin notifications */}
                {notifications.length === 0 && unreadMessages === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                    <Bell size={32} className="mb-2 opacity-30" />
                    <p className="text-sm">No notifications yet</p>
                  </div>
                )}

                {notifications.map(n => {
                  const Icon = TYPE_ICON[n.type] ?? Info;
                  const isUnread = !n.readAt;
                  return (
                    <button
                      key={n.id}
                      onClick={() => { if (isUnread) markOneRead.mutate(n.id); }}
                      className={cn(
                        'w-full flex items-start gap-3 px-4 py-3 border-b border-border/60 text-left hover:bg-muted/40 transition-colors',
                        isUnread && 'bg-blue-50/60'
                      )}
                    >
                      <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', TYPE_COLOR[n.type] ?? 'bg-gray-100 text-gray-500')}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn('text-sm leading-snug', isUnread ? 'font-bold text-foreground' : 'font-medium text-foreground/80')}>
                            {n.title}
                          </p>
                          {isUnread && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 space-y-6 max-w-md mx-auto">
        {/* Hero Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div
            className="relative overflow-hidden rounded-3xl shadow-xl shadow-black/5 aspect-[4/3] group cursor-pointer"
            onClick={() => setLocation('/order')}
          >
            <img
              src={`${import.meta.env.BASE_URL}images/hero-groceries.png`}
              alt="Fresh Groceries"
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6">
              <h2 className="text-3xl font-display font-bold text-white mb-2 leading-tight">Fresh to your door.</h2>
              <Button
                size="lg"
                className="w-full bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg font-bold text-lg h-14"
                onClick={(e) => { e.stopPropagation(); setLocation('/order'); }}
              >
                Order Now <ShoppingBag className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Subscription Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="rounded-3xl border-0 shadow-lg shadow-black/5 bg-gradient-to-br from-green-50 to-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <CalendarClock size={100} />
            </div>
            <CardContent className="p-6 relative z-10">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold font-display text-foreground flex items-center gap-2">
                    Weekly Box <span className="text-primary text-sm bg-primary/10 px-2 py-0.5 rounded-full font-bold">New</span>
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1 pr-6">Get your essentials delivered every Friday automatically.</p>
                </div>
                <Switch
                  checked={resident?.subscribeWeekly || false}
                  onCheckedChange={handleToggleSub}
                  disabled={updateSubMutation.isPending}
                  className="data-[state=checked]:bg-primary"
                />
              </div>

              {resident?.subscribeWeekly && (
                <div className="bg-primary/10 text-primary-foreground p-3 rounded-xl flex items-center justify-between mt-4">
                  <span className="font-medium text-primary text-sm flex items-center gap-2">
                    <CalendarClock size={16} /> Next delivery: <span className="font-bold">This Friday</span>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Links */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="grid grid-cols-2 gap-4">
          <Card
            className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer bg-white active:scale-[0.98]"
            onClick={() => setLocation('/history')}
          >
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-primary">
                <ListOrdered size={20} />
              </div>
              <div>
                <p className="font-bold text-foreground">My Orders</p>
                <p className="text-xs text-muted-foreground">Track & reorder</p>
              </div>
            </CardContent>
          </Card>

          <Card
            className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer bg-white active:scale-[0.98]"
            onClick={() => setLocation('/profile')}
          >
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-full overflow-hidden shrink-0">
                {(resident as any)?.photoUrl && !avatarImgError
                  ? (
                    <img
                      src={(resident as any).photoUrl}
                      alt={firstName}
                      className="w-full h-full object-cover"
                      onError={() => setAvatarImgError(true)}
                    />
                  )
                  : (
                    <div className="w-full h-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white font-bold text-lg">
                      {avatarLetter}
                    </div>
                  )
                }
              </div>
              <div>
                <p className="font-bold text-foreground">Profile</p>
                <p className="text-xs text-muted-foreground">Manage address</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
