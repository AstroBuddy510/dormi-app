import { Link, useLocation } from 'wouter';
import { useAuth } from '@/store';
import { LayoutDashboard, PackagePlus, MessageSquareWarning, LogOut, Headphones, PhoneCall, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export function AgentSidebar() {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  const { data: convs = [] } = useQuery<any[]>({
    queryKey: ['agent-conversations', user?.id],
    queryFn: () => fetch(`${BASE}/api/agent-messages/conversations?agentId=${user?.id}`).then(r => r.json()),
    refetchInterval: 15000,
    enabled: !!user?.id,
  });
  const unreadCount = (convs as any[]).reduce((sum, c) => sum + (c.unread ?? 0), 0);

  const links = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: PhoneCall,        label: 'Call Log',    path: '/call-log' },
    { icon: PackagePlus,      label: 'Create Order', path: '/create-order' },
    { icon: MessageCircle,    label: 'Messages',     path: '/messages', badge: unreadCount },
    { icon: MessageSquareWarning, label: 'Complaints', path: '/complaints' },
  ];

  return (
    <div className="hidden md:flex flex-col w-64 bg-white border-r border-border min-h-screen">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-2 text-blue-600">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Headphones className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight text-gray-800">Call<span className="text-blue-600">Center</span></span>
        </div>
      </div>

      <div className="px-4 py-3 border-b bg-blue-50">
        <p className="text-xs text-gray-500">Logged in as</p>
        <p className="text-sm font-semibold text-gray-800 truncate">{user?.name}</p>
        <p className="text-xs text-blue-600">{user?.phone}</p>
      </div>

      <div className="flex-1 py-4 px-4 flex flex-col gap-2 overflow-y-auto">
        {links.map((link) => {
          const isActive = location === link.path;
          const Icon = link.icon;
          return (
            <Link
              key={link.path}
              href={link.path}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                isActive
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200 font-medium"
                  : "text-muted-foreground hover:bg-blue-50 hover:text-blue-700"
              )}
            >
              <div className="relative shrink-0">
                <Icon size={20} className={cn("transition-transform duration-200", !isActive && "group-hover:scale-110")} />
                {(link as any).badge > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {(link as any).badge}
                  </span>
                )}
              </div>
              {link.label}
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
