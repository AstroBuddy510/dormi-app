import { Link, useLocation } from 'wouter';
import { useAuth } from '@/store';
import {
  LayoutDashboard, PhoneCall, Truck, DollarSign, Users, LogOut, Settings,
  UsersRound, PackagePlus, Building2, MessageSquareWarning, TrendingUp,
  Briefcase, ShoppingBasket, Bell, BarChart3, Tag, MessageCircle,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/components/ui/StatusBadge';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
};

type NavGroup = {
  heading: string;
  items: NavItem[];
};

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

  const { data: unreadData } = useQuery<{ total: number }>({
    queryKey: ['rider-messages-unread-admin'],
    queryFn: () => fetch(`${BASE}/api/rider-messages/unread-count?role=admin`).then(r => r.json()),
    refetchInterval: 15000,
  });
  const riderMsgUnread = unreadData?.total ?? 0;

  const groups: NavGroup[] = [
    {
      heading: 'Operations',
      items: [
        { icon: LayoutDashboard, label: 'Live Orders',       path: '/' },
        { icon: PackagePlus,     label: 'Create Order',      path: '/create-order' },
        { icon: PhoneCall,       label: 'Call Log',          path: '/call-log' },
        { icon: Truck,           label: 'Assign Riders',     path: '/riders' },
        { icon: Building2,       label: 'Delivery Partners', path: '/delivery-partners' },
        { icon: MessageCircle,   label: 'Rider Messages',    path: '/rider-messages', badge: riderMsgUnread || undefined },
        { icon: MessageSquareWarning, label: 'Complaints',   path: '/complaints' },
      ],
    },
    {
      heading: 'Catalogue & Pricing',
      items: [
        { icon: ShoppingBasket, label: 'Catalogue', path: '/catalogue', badge: pendingCount },
        { icon: Tag,            label: 'Pricing',   path: '/pricing' },
      ],
    },
    {
      heading: 'People',
      items: [
        { icon: Briefcase,  label: 'Employees',   path: '/employees' },
        { icon: Users,      label: 'Subscribers', path: '/subscribers' },
        { icon: UsersRound, label: 'Users',        path: '/users' },
      ],
    },
    {
      heading: 'Finance & Reports',
      items: [
        { icon: TrendingUp, label: 'Finance', path: '/finance' },
        { icon: BarChart3,  label: 'Reports', path: '/reports' },
      ],
    },
    {
      heading: 'System',
      items: [
        { icon: Settings, label: 'Settings', path: '/settings' },
      ],
    },
  ];

  return (
    <div className="hidden md:flex flex-col w-64 bg-white border-r border-border min-h-screen">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-border shrink-0">
        <div className="flex items-center gap-2 text-primary">
          <img src={`${import.meta.env.BASE_URL}images/dormi-logo.png`} alt="Dormi Logo" className="w-8 h-8 rounded-lg shadow-sm" />
          <span className="font-display font-bold text-xl tracking-tight">Dormi</span>
        </div>
      </div>

      {/* Nav groups */}
      <div className="flex-1 py-4 px-3 flex flex-col gap-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.heading}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 px-3 mb-1.5">
              {group.heading}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map((link) => {
                const isActive = location === link.path;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.path}
                    href={link.path}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group text-sm",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Icon size={17} className={cn("shrink-0 transition-transform duration-200", !isActive && "group-hover:scale-110")} />
                    <span className="flex-1">{link.label}</span>
                    {(link.badge ?? 0) > 0 && (
                      <span className={cn(
                        "text-xs font-bold rounded-full px-1.5 py-0.5 leading-none min-w-[18px] text-center",
                        isActive ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                      )}>
                        {link.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Sign out */}
      <div className="p-3 border-t border-border shrink-0">
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 font-medium"
        >
          <LogOut size={17} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
