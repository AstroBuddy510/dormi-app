import { Link, useLocation } from 'wouter';
import { useAuth } from '@/store';
import { LayoutDashboard, Receipt, CreditCard, Wallet, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AccountantSidebar() {
  const [location] = useLocation();
  const { logout } = useAuth();

  const links = [
    { icon: LayoutDashboard, label: 'Overview', path: '/' },
    { icon: CreditCard, label: 'Payroll', path: '/payroll' },
    { icon: Receipt, label: 'Expenses', path: '/expenses' },
    { icon: Wallet, label: 'Float', path: '/float' },
  ];

  return (
    <div className="hidden md:flex flex-col w-64 bg-white border-r border-border min-h-screen">
      <div className="h-16 flex items-center px-6 border-b border-border">
        <div className="flex items-center gap-2 text-blue-600">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Receipt size={16} className="text-white" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">
            Finance<span className="text-foreground">Hub</span>
          </span>
        </div>
      </div>

      <div className="flex-1 py-6 px-4 flex flex-col gap-2 overflow-y-auto">
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
                  ? "bg-blue-600 text-white shadow-md shadow-blue-600/20 font-medium"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon size={20} className={cn("transition-transform duration-200", !isActive && "group-hover:scale-110")} />
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
