import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/store';
import { useGetResident, useUpdateSubscription } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag, CalendarClock, ListOrdered, MessageCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQueryClient, useQuery } from '@tanstack/react-query';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function ResidentHome() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      <div className="bg-white px-6 pt-12 pb-6 rounded-b-3xl shadow-sm border-b border-border mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground font-medium text-sm">Welcome back,</p>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {firstName} 👋
            </h1>
          </div>

          {/* Messages icon — replaces profile picture */}
          <button
            onClick={() => setLocation('/messages')}
            className="relative h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center border-2 border-white shadow-md hover:bg-primary/20 transition-colors active:scale-95"
          >
            <MessageCircle size={22} className="text-primary" />
            {unreadMessages > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                {unreadMessages > 9 ? '9+' : unreadMessages}
              </span>
            )}
          </button>
        </div>
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

          {/* Profile card — now functional */}
          <Card
            className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer bg-white active:scale-[0.98]"
            onClick={() => setLocation('/profile')}
          >
            <CardContent className="p-4 flex flex-col gap-3">
              {/* Avatar: photo if available, else coloured initial */}
              <div className="h-10 w-10 rounded-full overflow-hidden shrink-0">
                {(resident as any)?.photoUrl
                  ? <img src={(resident as any).photoUrl} alt={firstName} className="w-full h-full object-cover" />
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
