import { Link, useLocation } from 'wouter';
import {
  Home, ShoppingBag, ListOrdered, PhoneCall, Truck, LogOut,
  MessageCircle, LayoutDashboard, PackagePlus, MessageSquareWarning,
} from 'lucide-react';
import { useAuth } from '@/store';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function BottomNav() {
  const [location] = useLocation();
  const { role, logout, user } = useAuth();

  // Resident unread messages
  const { data: resConvs = [] } = useQuery<any[]>({
    queryKey: ['res-conversations', user?.id],
    queryFn: () =>
      fetch(`${BASE}/api/agent-messages/conversations?residentId=${user?.id}`).then(r => r.json()),
    refetchInterval: 15000,
    enabled: role === 'resident' && !!user?.id,
  });
  const residentUnread = (resConvs as any[]).reduce((sum, c) => sum + (c.unread ?? 0), 0);

  // Agent unread messages
  const { data: agentConvs = [] } = useQuery<any[]>({
    queryKey: ['agent-conversations', user?.id],
    queryFn: () =>
      fetch(`${BASE}/api/agent-messages/conversations?agentId=${user?.id}`).then(r => r.json()),
    refetchInterval: 15000,
    enabled: role === 'agent' && !!user?.id,
  });
  const agentUnread = (agentConvs as any[]).reduce((sum, c) => sum + (c.unread ?? 0), 0);

  const residentNav = [
    { icon: Home,          label: 'Home',     path: '/' },
    { icon: ShoppingBag,   label: 'Order',    path: '/order' },
    { icon: ListOrdered,   label: 'History',  path: '/history' },
    { icon: MessageCircle, label: 'Messages', path: '/messages', badge: residentUnread },
  ];

  const agentNav = [
    { icon: LayoutDashboard,      label: 'Dashboard', path: '/' },
    { icon: PhoneCall,            label: 'Call Log',  path: '/call-log' },
    { icon: MessageCircle,        label: 'Messages',  path: '/messages', badge: agentUnread },
    { icon: PackagePlus,          label: 'Order',     path: '/create-order' },
    { icon: MessageSquareWarning, label: 'Issues',    path: '/complaints' },
  ];

  const vendorNav = [
    { icon: ListOrdered, label: 'App Orders',  path: '/app-orders' },
    { icon: PhoneCall,   label: 'Call Orders', path: '/call-orders' },
  ];

  const riderNav = [
    { icon: Truck, label: 'My Jobs', path: '/' },
  ];

  let links: { icon: any; label: string; path: string; badge?: number }[] = [];
  if (role === 'resident') links = residentNav;
  if (role === 'agent')    links = agentNav;
  if (role === 'vendor')   links = vendorNav;
  if (role === 'rider')    links = riderNav;

  if (role === 'admin') return null;

  return (
    <div className={cn(
      "fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-safe",
      role === 'agent' && "md:hidden",
    )}>
      <div className="max-w-lg mx-auto px-2 h-16 flex items-center justify-around">
        {links.map((link) => {
          const isActive = location === link.path;
          const Icon = link.icon;
          const isAgent = role === 'agent';
          return (
            <Link
              key={link.path}
              href={link.path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full gap-0.5 transition-colors duration-200',
                isActive
                  ? isAgent ? 'text-blue-600' : 'text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <div className={cn(
                'p-1.5 rounded-xl transition-all duration-300 relative',
                isActive && (isAgent ? 'bg-blue-50 scale-110' : 'bg-primary/10 scale-110'),
              )}>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                {(link.badge ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {(link.badge ?? 0) > 9 ? '9+' : link.badge}
                  </span>
                )}
              </div>
              <span className={cn('text-[9px] font-medium tracking-wide leading-none', isActive && 'font-bold')}>
                {link.label}
              </span>
            </Link>
          );
        })}

        <button
          onClick={() => logout()}
          className="flex flex-col items-center justify-center flex-1 h-full gap-0.5 text-muted-foreground hover:text-destructive transition-colors duration-200"
        >
          <div className="p-1.5 rounded-xl">
            <LogOut size={20} strokeWidth={2} />
          </div>
          <span className="text-[9px] font-medium tracking-wide leading-none">Logout</span>
        </button>
      </div>
    </div>
  );
}
