import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/store';
import {
  LayoutDashboard, PhoneCall, Truck, Users, LogOut, Settings,
  UsersRound, PackagePlus, Building2, MessageSquareWarning, TrendingUp,
  Briefcase, ShoppingBasket, BarChart3, Tag, MessageCircle, Store, Menu, Bell,
  ShieldAlert, ChevronDown, ChevronLeft, ChevronRight, Banknote,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// Static section→paths map used for auto-opening sections on navigation
const SECTION_PATHS: Record<string, string[]> = {
  operations:  ['/', '/create-order', '/call-log', '/riders', '/delivery-partners', '/rider-messages', '/vendor-inbox', '/complaints'],
  catalogue:   ['/catalogue', '/pricing'],
  people:      ['/employees', '/subscribers', '/users'],
  finance:     ['/finance', '/payouts', '/reports'],
  engagement:  ['/notifications'],
  system:      ['/settings'],
};

type NavItem = {
  icon: React.ElementType;
  label: string;
  path: string;
  badge?: number;
};

type NavSection = {
  id: string;
  heading: string;
  items: NavItem[];
};

// ─── Tooltip wrapper shown only in collapsed mode ───────────────────────────
interface TooltipProps {
  label: string;
  badge?: number;
  children: React.ReactNode;
}

function SidebarTooltip({ label, badge, children }: TooltipProps) {
  return (
    <div className="relative group/tip w-full flex justify-center">
      {children}
      <div className="absolute left-full top-1/2 -translate-y-1/2 ml-3 z-[300] pointer-events-none opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div className="relative flex items-center gap-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg px-2.5 py-1.5 whitespace-nowrap shadow-xl">
          {label}
          {(badge ?? 0) > 0 && (
            <span className="bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-px leading-none">
              {badge}
            </span>
          )}
          {/* Arrow */}
          <span className="absolute top-1/2 -translate-y-1/2 right-full border-[5px] border-transparent border-r-gray-900" />
        </div>
      </div>
    </div>
  );
}

// ─── Single nav link ─────────────────────────────────────────────────────────
interface NavLinkItemProps {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}

function NavLinkItem({ item, isActive, collapsed }: NavLinkItemProps) {
  const Icon = item.icon;
  const hasBadge = (item.badge ?? 0) > 0;

  const link = (
    <Link
      href={item.path}
      className={cn(
        'relative flex items-center gap-3 rounded-xl transition-all duration-200 group/link text-sm',
        collapsed
          ? 'justify-center w-10 h-10 mx-auto p-0'
          : 'px-3 py-2.5 w-full',
        isActive
          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/20 font-medium'
          : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      <div className="relative shrink-0">
        <Icon
          size={17}
          className={cn('transition-transform duration-200', !isActive && 'group-hover/link:scale-110')}
        />
        {collapsed && hasBadge && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 border-2 border-white" />
        )}
      </div>

      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          {hasBadge && (
            <span
              className={cn(
                'shrink-0 text-xs font-bold rounded-full px-1.5 py-px leading-none min-w-[18px] text-center',
                isActive ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700',
              )}
            >
              {item.badge}
            </span>
          )}
        </>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <SidebarTooltip label={item.label} badge={item.badge}>
        {link}
      </SidebarTooltip>
    );
  }

  return link;
}

// ─── Collapsible section group ────────────────────────────────────────────────
interface SectionGroupProps {
  section: NavSection;
  isOpen: boolean;
  onToggle: () => void;
  location: string;
  collapsed: boolean;
}

function SectionGroup({ section, isOpen, onToggle, location, collapsed }: SectionGroupProps) {
  const hasActive = section.items.some((item) => location === item.path);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-0.5 w-full">
        {section.items.map((item) => (
          <NavLinkItem
            key={item.path}
            item={item}
            isActive={location === item.path}
            collapsed
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center justify-between px-3 py-1.5 rounded-lg',
          'transition-colors duration-150 group/heading',
          hasActive
            ? 'text-primary'
            : 'text-muted-foreground/60 hover:text-muted-foreground',
        )}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest select-none">
          {section.heading}
        </span>
        <ChevronDown
          size={12}
          className={cn('opacity-60 transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-in-out',
          isOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <div className="flex flex-col gap-0.5 pt-0.5 pb-1.5 pl-1">
          {section.items.map((item) => (
            <NavLinkItem
              key={item.path}
              item={item}
              isActive={location === item.path}
              collapsed={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Full sidebar body (used for both desktop and mobile sheet) ───────────────
interface SidebarBodyProps {
  sections: NavSection[];
  location: string;
  collapsed: boolean;
  openSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  onToggleCollapse?: () => void;
  showCollapseButton?: boolean;
  logout: () => void;
}

function SidebarBody({
  sections,
  location,
  collapsed,
  openSections,
  onToggleSection,
  onToggleCollapse,
  showCollapseButton = false,
  logout,
}: SidebarBodyProps) {
  return (
    <>
      {/* Header */}
      <div
        className={cn(
          'h-16 flex items-center border-b border-border shrink-0 transition-all duration-300',
          collapsed ? 'justify-center px-2' : 'px-4 justify-between gap-2',
        )}
      >
        {collapsed ? (
          /* Collapsed: logo alone, perfectly centered over the icon column */
          <Link href="/" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <img
              src={`${BASE}/images/dormi-logo.png`}
              alt="Dormi Logo"
              className="w-8 h-8 rounded-lg shadow-sm hover:opacity-80 transition-opacity"
            />
          </Link>
        ) : (
          /* Expanded: logo + wordmark + collapse toggle */
          <>
            <Link href="/" className="flex items-center gap-2 text-primary min-w-0 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary hover:opacity-80 transition-opacity">
              <img
                src={`${BASE}/images/dormi-logo.png`}
                alt="Dormi Logo"
                className="w-8 h-8 rounded-lg shadow-sm shrink-0"
              />
              <span className="font-display font-bold text-xl tracking-tight whitespace-nowrap">Dormi</span>
            </Link>
            {showCollapseButton && (
              <button
                onClick={onToggleCollapse}
                title="Collapse sidebar"
                className="shrink-0 p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft size={15} />
              </button>
            )}
          </>
        )}
      </div>

      {/* Nav body */}
      <div
        className={cn(
          'flex-1 py-3 flex flex-col overflow-y-auto overflow-x-hidden',
          collapsed ? 'px-1.5 gap-0 items-center' : 'px-3 gap-1.5',
        )}
      >
        {collapsed
          ? <>
              {/* Expand button — first icon in the collapsed column */}
              {showCollapseButton && (
                <div className="w-full pb-1.5 border-b border-border/50 mb-1">
                  <SidebarTooltip label="Expand Sidebar">
                    <button
                      onClick={onToggleCollapse}
                      className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors mx-auto"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </SidebarTooltip>
                </div>
              )}
              {sections.map((section, i) => (
              <div
                key={section.id}
                className={cn(
                  'flex flex-col items-center gap-0.5 w-full py-1.5',
                  i > 0 && 'border-t border-border/50 mt-0.5 pt-2',
                )}
              >
                {section.items.map((item) => (
                  <NavLinkItem
                    key={item.path}
                    item={item}
                    isActive={location === item.path}
                    collapsed
                  />
                ))}
              </div>
            ))}
            </>
          : sections.map((section) => (
              <SectionGroup
                key={section.id}
                section={section}
                isOpen={openSections[section.id] ?? true}
                onToggle={() => onToggleSection(section.id)}
                location={location}
                collapsed={false}
              />
            ))}
      </div>

      {/* Footer / Sign out */}
      <div
        className={cn(
          'border-t border-border shrink-0',
          collapsed ? 'flex justify-center py-3' : 'p-3',
        )}
      >
        {collapsed ? (
          <SidebarTooltip label="Sign Out">
            <button
              onClick={logout}
              className="w-10 h-10 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <LogOut size={17} />
            </button>
          </SidebarTooltip>
        ) : (
          <button
            onClick={logout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 font-medium"
          >
            <LogOut size={17} />
            Sign Out
          </button>
        )}
      </div>
    </>
  );
}

// ─── Idle timeout constants ───────────────────────────────────────────────────
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const IDLE_WARNING_MS =  1 * 60 * 1000;

// ─── Main export ──────────────────────────────────────────────────────────────
export function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { logout } = useAuth();
  const [idleWarning, setIdleWarning] = useState(false);
  const [countdown, setCountdown] = useState(60);

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('dormi-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('dormi-sidebar-sections');
      if (stored) return JSON.parse(stored);
    } catch { /* ignore */ }
    return {
      operations: true,
      catalogue: true,
      people: true,
      finance: true,
      engagement: true,
      system: true,
    };
  });

  useEffect(() => { setMobileOpen(false); }, [location]);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem('dormi-sidebar-collapsed', String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !(prev[id] ?? true) };
      try { localStorage.setItem('dormi-sidebar-sections', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Auto-open the section containing the active route
  useEffect(() => {
    setOpenSections((prev) => {
      const updated = { ...prev };
      let changed = false;
      for (const [id, paths] of Object.entries(SECTION_PATHS)) {
        if (paths.includes(location) && !prev[id]) {
          updated[id] = true;
          changed = true;
        }
      }
      if (!changed) return prev;
      try { localStorage.setItem('dormi-sidebar-sections', JSON.stringify(updated)); } catch { /* ignore */ }
      return updated;
    });
  }, [location]);

  const handleLogout = useCallback(() => {
    setIdleWarning(false);
    logout();
    setLocation('/');
  }, [logout, setLocation]);

  const { reset: resetIdle } = useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onWarn: () => { setIdleWarning(true); setCountdown(60); },
    onTimeout: handleLogout,
    // While the warning dialog is open, freeze the activity listeners so that
    // the admin hovering or clicking the modal cannot silently reset the timer.
    // Only an explicit "Stay Signed In" click calls resetIdle() directly.
    paused: idleWarning,
  });

  const staySignedIn = useCallback(() => {
    setIdleWarning(false);
    resetIdle();
  }, [resetIdle]);

  useEffect(() => {
    if (!idleWarning) return;
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [idleWarning]);

  // ── Badge queries ──────────────────────────────────────────────────────────
  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ['item-requests'],
    queryFn: () => fetch(`${BASE}/api/items/requests`).then((r) => r.json()),
    refetchInterval: 30000,
    select: (data) => data.filter((r: any) => r.status === 'pending'),
  });
  const pendingCount = (requests as any[]).length;

  const { data: unreadData } = useQuery<{ total: number }>({
    queryKey: ['rider-messages-unread-admin'],
    queryFn: () => fetch(`${BASE}/api/rider-messages/unread-count?role=admin`).then((r) => r.json()),
    refetchInterval: 15000,
  });
  const riderMsgUnread = unreadData?.total ?? 0;

  const { data: vendorUnreadData } = useQuery<{ total: number }>({
    queryKey: ['vendor-messages-unread-admin'],
    queryFn: () => fetch(`${BASE}/api/vendor-messages/unread-count`).then((r) => r.json()),
    refetchInterval: 15000,
  });
  const vendorMsgUnread = vendorUnreadData?.total ?? 0;

  // ── Nav structure ──────────────────────────────────────────────────────────
  const sections: NavSection[] = [
    {
      id: 'operations',
      heading: 'Operations',
      items: [
        { icon: LayoutDashboard,       label: 'Live Orders',       path: '/' },
        { icon: PackagePlus,           label: 'Create Order',      path: '/create-order' },
        { icon: PhoneCall,             label: 'Call Log',          path: '/call-log' },
        { icon: Truck,                 label: 'Assign Riders',     path: '/riders' },
        { icon: Building2,             label: 'Delivery Partners', path: '/delivery-partners' },
        { icon: MessageCircle,         label: 'Rider Messages',    path: '/rider-messages', badge: riderMsgUnread || undefined },
        { icon: Store,                 label: 'Vendor Inbox',      path: '/vendor-inbox',   badge: vendorMsgUnread || undefined },
        { icon: MessageSquareWarning,  label: 'Complaints',        path: '/complaints' },
      ],
    },
    {
      id: 'catalogue',
      heading: 'Catalogue & Pricing',
      items: [
        { icon: ShoppingBasket, label: 'Catalogue', path: '/catalogue', badge: pendingCount },
        { icon: Tag,            label: 'Pricing',   path: '/pricing' },
      ],
    },
    {
      id: 'people',
      heading: 'People',
      items: [
        { icon: Briefcase,  label: 'Employees',   path: '/employees' },
        { icon: Users,      label: 'Subscribers', path: '/subscribers' },
        { icon: UsersRound, label: 'Users',        path: '/users' },
      ],
    },
    {
      id: 'finance',
      heading: 'Finance & Reports',
      items: [
        { icon: TrendingUp, label: 'Finance', path: '/finance' },
        { icon: Banknote,   label: 'Payouts', path: '/payouts' },
        { icon: BarChart3,  label: 'Reports', path: '/reports' },
      ],
    },
    {
      id: 'engagement',
      heading: 'Engagement',
      items: [
        { icon: Bell, label: 'Notifications', path: '/notifications' },
      ],
    },
    {
      id: 'system',
      heading: 'System',
      items: [
        { icon: Settings, label: 'Settings', path: '/settings' },
      ],
    },
  ];

  const sharedProps = {
    sections,
    location,
    openSections,
    onToggleSection: toggleSection,
    logout: handleLogout,
  };

  return (
    <>
      {/* ── Idle-timeout warning overlay ──────────────────────────────────── */}
      {idleWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-7 flex flex-col items-center text-center gap-5">
            <div className="h-16 w-16 rounded-full bg-amber-50 border-2 border-amber-200 flex items-center justify-center">
              <ShieldAlert size={28} className="text-amber-500" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Session Timeout</h2>
              <p className="text-sm text-muted-foreground mt-1.5">
                You've been idle for a while. For security, you'll be signed out automatically.
              </p>
            </div>
            <div className="h-16 w-16 rounded-full border-4 border-amber-200 flex items-center justify-center bg-amber-50">
              <span className="text-2xl font-bold text-amber-600 tabular-nums">{countdown}</span>
            </div>
            <div className="flex flex-col gap-2 w-full">
              {countdown > 0 ? (
                <button
                  onClick={staySignedIn}
                  className="w-full py-3 rounded-xl bg-primary text-white font-semibold hover:bg-primary/90 transition-colors"
                >
                  Stay Signed In
                </button>
              ) : (
                <div className="w-full py-3 rounded-xl bg-gray-100 text-gray-400 text-sm font-semibold text-center select-none">
                  Signing out…
                </div>
              )}
              <button
                onClick={handleLogout}
                className="w-full py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-gray-50 transition-colors"
              >
                Sign Out Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile sticky top bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 lg:hidden h-16 flex items-center justify-between px-4 bg-white border-b border-border shadow-sm shrink-0">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img
            src={`${BASE}/images/dormi-logo.png`}
            alt="Dormi"
            className="w-7 h-7 rounded-lg shadow-sm"
          />
          <span className="font-display font-bold text-lg tracking-tight text-primary">Dormi</span>
        </Link>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-muted-foreground"
          aria-label="Open navigation"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* ── Mobile Sheet drawer ───────────────────────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-72 flex flex-col">
          <SidebarBody
            {...sharedProps}
            collapsed={false}
            showCollapseButton={false}
          />
        </SheetContent>
      </Sheet>

      {/* ── Desktop sidebar ───────────────────────────────────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex flex-col bg-white border-r border-border min-h-screen shrink-0',
          'transition-[width] duration-300 ease-in-out overflow-hidden',
          collapsed ? 'w-[4.5rem]' : 'w-60',
        )}
      >
        <SidebarBody
          {...sharedProps}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
          showCollapseButton
        />
      </aside>
    </>
  );
}
