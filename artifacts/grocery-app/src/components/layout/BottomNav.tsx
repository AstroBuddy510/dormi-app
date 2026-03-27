import { Link, useLocation } from 'wouter';
import { Home, ShoppingBag, User, ListOrdered, PhoneCall, Truck, LogOut } from 'lucide-react';
import { useAuth } from '@/store';
import { cn } from '@/lib/utils';

export function BottomNav() {
  const [location] = useLocation();
  const { role, logout } = useAuth();

  const residentNav = [
    { icon: Home, label: 'Home', path: '/' },
    { icon: ShoppingBag, label: 'Order', path: '/order' },
    { icon: ListOrdered, label: 'History', path: '/history' },
  ];

  const vendorNav = [
    { icon: ListOrdered, label: 'App Orders', path: '/' },
    { icon: PhoneCall, label: 'Call Orders', path: '/call-orders' },
  ];

  const riderNav = [
    { icon: Truck, label: 'My Jobs', path: '/' },
  ];

  let links = [];
  if (role === 'resident') links = residentNav;
  if (role === 'vendor') links = vendorNav;
  if (role === 'rider') links = riderNav;

  // Admin doesn't use bottom nav, uses sidebar

  if (role === 'admin') return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-border shadow-[0_-4px_20px_rgba(0,0,0,0.05)] pb-safe">
      <div className="max-w-md mx-auto px-6 h-16 flex items-center justify-between">
        {links.map((link) => {
          const isActive = location === link.path;
          const Icon = link.icon;
          return (
            <Link key={link.path} href={link.path} className={cn(
              "flex flex-col items-center justify-center w-16 h-full gap-1 transition-colors duration-200",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}>
              <div className={cn("p-1.5 rounded-xl transition-all duration-300", isActive && "bg-primary/10 scale-110")}>
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
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
