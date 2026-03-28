import { Link, useLocation } from 'wouter';
import { Home, ShoppingBag, ListOrdered, PhoneCall, Truck, LogOut, MessageCircle } from 'lucide-react';
import { useAuth } from '@/store';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function BottomNav() {
  const [location] = useLocation();
  const { role, logout, user } = useAuth();

  const { data: convs = [] } = useQuery<any[]>({
    queryKey: ['res-conversations', user?.id],
    queryFn: () => fetch(`${BASE}/api/agent-messages/conversations?residentId=${user?.id}`).then(r => r.json()),
    refetchInterval: 15000,
    enabled: role === 'resident' && !!user?.id,
  });
  const residentUnread = (convs as any[]).reduce((sum, c) => sum + (c.unread ?? 0), 0);

  const residentNav = [
    { icon: Home,           label: 'Home',     path: '/' },
    { icon: ShoppingBag,    label: 'Order',    path: '/order' },
    { icon: ListOrdered,    label: 'History',  path: '/history' },
    { icon: MessageCircle,  label: 'Messages', path: '/messages', badge: residentUnread },
  ];

  const vendorNav = [
    { icon: ListOrdered, label: 'App Orders', path: '/' },
    { icon: PhoneCall, label: 'Call Orders', path: '/call-orders' },
  ];

  const riderNav = [
    { icon: Truck, label: 'My Jobs', path: '/' },
  ];

  let links: { icon: any; label: string; path: string; badge?: number }[] = [];
  if (role === 'resident') links = residentNav;
  if (role === 'vendor') links = vendorNav;
  if (role === 'rider') links = riderNav;

  if (role === 'admin') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-safe">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-between">
        {links.map((link) => {
          const isActive = location === link.path;
          const Icon = link.icon;
          return (
            <Link key={link.path} href={link.path} className={cn(
              "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors duration-200",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
              <div className={cn("p-1.5 rounded-xl transition-all duration-300 relative", isActive && "bg-primary/10 scale-110")}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                {(link.badge ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {link.badge}
                  </span>
                )}
              </div>
              <span className={cn("text-[10px] font-medium tracking-wide", isActive ? "font-bold" : "font-medium")}>
                {link.label}
              </span>
            </Link>
          );
        })}
        
        <button 
          onClick={() => logout()}
          className="flex flex-col items-center justify-center w-16 h-full gap-1 text-muted-foreground hover:text-destructive transition-colors duration-200"
        >
          <div className="p-1.5 rounded-xl">
            <LogOut size={22} strokeWidth={2} />
          </div>
          <span className="text-[10px] font-medium tracking-wide">Logout</span>
        </button>
      </div>
    </div>
  );
}
