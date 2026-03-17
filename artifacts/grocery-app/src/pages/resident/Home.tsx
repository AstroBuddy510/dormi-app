import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/store';
import { useGetResident, useUpdateSubscription } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ShoppingBag, CalendarClock, ChevronRight, UserCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';

export default function ResidentHome() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: resident } = useGetResident(user?.id || 0, {
    query: { enabled: !!user?.id }
  });

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

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header Profile Area */}
      <div className="bg-white px-6 pt-12 pb-6 rounded-b-3xl shadow-sm border-b border-border mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground font-medium text-sm">Welcome back,</p>
            <h1 className="text-2xl font-display font-bold text-foreground">
              {user?.name?.split(' ')[0] || 'Resident'} 👋
            </h1>
          </div>
          <div className="h-12 w-12 rounded-full bg-secondary text-primary flex items-center justify-center border-2 border-white shadow-md">
            <UserCircle size={28} />
          </div>
        </div>
      </div>

      <div className="px-4 space-y-6 max-w-md mx-auto">
        {/* Hero Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="relative overflow-hidden rounded-3xl shadow-xl shadow-black/5 aspect-[4/3] group cursor-pointer" onClick={() => setLocation('/order')}>
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
          <Card className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer bg-white" onClick={() => setLocation('/history')}>
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
          <Card className="rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all cursor-pointer bg-white">
            <CardContent className="p-4 flex flex-col gap-3">
              <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center text-accent-foreground">
                <UserCircle size={20} />
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
