import { Link, useLocation } from 'wouter';
import { useAuth } from '@/store';
import { LayoutDashboard, PhoneCall, Truck, DollarSign, Users, LogOut, Settings, UsersRound, PackagePlus, Building2, MessageSquareWarning, TrendingUp, Briefcase, ShoppingBasket, Bell } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/components/ui/StatusBadge';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function AdminSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ['item-requests'],
    queryFn: () => fetch(`${BASE}/api/items/requests`).then(r => r.json()),
    refetchInterval: 30000,
    select: (data) => data.filter((r: any) => r.status === 'pending'),
  });
  const pendingCount = (requests as any[]).length;

  const links = [
    { icon: LayoutDashboard, label: 'Live Orders', path: '/' },
    { icon: PackagePlus, label: 'Create Order', path: '/create-order' },
    { icon: PhoneCall, label: 'Call Log', path: '/call-log' },
    { icon: Truck, label: 'Assign Riders', path: '/riders' },
    { icon: Building2, label: 'Delivery Partners', path: '/delivery-partners' },
    { icon: MessageSquareWarning, label: 'Complaints', path: '/complaints' },
    { icon: DollarSign, label: 'Pricing', path: '/pricing' },
    { icon: TrendingUp, label: 'Finance', path: '/finance' },
    { icon: Briefcase, label: 'Employees', path: '/employees' },
    { icon: Users, label: 'Subscribers', path: '/subscribers' },
    { icon: UsersRound, label: 'Users', path: '/users' },
    { icon: ShoppingBasket, label: 'Catalogue', path: '/catalogue', badge: pendingCount },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  return (
    <div className="hidden md:flex flex-col w-64 bg-white border-r border-border min-h-screen">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-2 text-primary">
          <img src={`${import.meta.env.BASE_URL}images/logo-icon.png`} alt="Logo" className="w-8 h-8 rounded-lg shadow-sm" />
          <span className="font-display font-bold text-xl tracking-tight">Admin<span className="text-foreground">Ease</span></span>
        </div>
      </div>
      
      <div className="flex-1 py-6 px-4 flex flex-col gap-2 overflow-y-auto">
        {links.map((link) => {
          const isActive = location === link.path;
          const Icon = link.icon;
          const badge = (link as any).badge;
          return (
            <Link 
              key={link.path} 
              href={link.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                isActive 
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium" 
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon size={20} className={cn("transition-transform duration-200", !isActive && "group-hover:scale-110")} />
              <span className="flex-1">{link.label}</span>
              {badge > 0 && (
                <span className={cn(
                  "text-xs font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center",
                  isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                )}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      <div className="p-4 border-t border-border">
        <button 
          onClick={logout}
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 font-medium"
        >
          <LogOut size={20} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
