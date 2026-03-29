import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery } from '@tanstack/react-query';
import {
  PhoneCall, MessageCircle, ShoppingBag, Clock, CheckCircle,
  XCircle, PhoneMissed, PhoneForwarded, User, Users, RotateCcw,
  ArrowLeft, TrendingUp, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type RecentLog = {
  id: number;
  residentName: string;
  residentPhone: string;
  outcome: string;
  notes: string | null;
  createdAt: string;
};

type RecentOrder = {
  id: number;
  total: string;
  status: string;
  createdAt: string;
};

type AgentStats = {
  id: number;
  name: string;
  phone: string;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  lastActive: string | null;
  stats: { ordersCreated: number; callLogs: number; messagesSent: number };
  recentLogs: RecentLog[];
  recentOrders: RecentOrder[];
};

const OUTCOME: Record<string, { label: string; Icon: React.ElementType; pill: string; dot: string }> = {
  completed:          { label: 'Completed',  Icon: CheckCircle,    pill: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  no_answer:          { label: 'No Answer',  Icon: PhoneMissed,    pill: 'bg-amber-50 text-amber-700 border-amber-200',       dot: 'bg-amber-400' },
  callback_requested: { label: 'Callback',   Icon: PhoneForwarded, pill: 'bg-blue-50 text-blue-700 border-blue-200',          dot: 'bg-blue-500' },
  cancelled:          { label: 'Cancelled',  Icon: XCircle,        pill: 'bg-red-50 text-red-700 border-red-200',             dot: 'bg-red-500' },
};

const ORDER_STATUS: Record<string, string> = {
  pending:   'bg-amber-50 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

function fmt(date: string) {
  return new Date(date).toLocaleString('en-GH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AgentAvatar({ agent, size = 'md' }: { agent: AgentStats; size?: 'sm' | 'md' | 'lg' }) {
  const [err, setErr] = useState(false);
  const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const cls = size === 'lg' ? 'h-16 w-16 text-xl' : size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  return (
    <div className={cn('rounded-full overflow-hidden shrink-0 relative', cls)}>
      {agent.photoUrl && !err
        ? <img src={agent.photoUrl} alt={agent.name} className="w-full h-full object-cover" onError={() => setErr(true)} />
        : <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center text-white font-bold">{initials}</div>
      }
      <span className={cn(
        'absolute bottom-0 right-0 rounded-full border-2 border-white',
        size === 'lg' ? 'h-4 w-4' : 'h-2.5 w-2.5',
        agent.isActive ? 'bg-emerald-500' : 'bg-gray-300'
      )} />
    </div>
  );
}

function KpiCard({ Icon, value, label, sub, color }: { Icon: React.ElementType; value: number | string; label: string; sub?: string; color: string }) {
  return (
    <div className={cn('rounded-2xl border p-5 flex flex-col gap-2', color)}>
      <div className="flex items-center justify-between">
        <Icon size={18} className="opacity-60" />
        {sub && <span className="text-[11px] font-medium opacity-60">{sub}</span>}
      </div>
      <div>
        <p className="text-3xl font-bold leading-none">{value}</p>
        <p className="text-xs font-medium opacity-70 mt-1">{label}</p>
      </div>
    </div>
  );
}

function OutcomeDot({ outcome }: { outcome: string }) {
  const cfg = OUTCOME[outcome];
  return <span className={cn('inline-block h-2 w-2 rounded-full', cfg?.dot ?? 'bg-gray-400')} />;
}

function OutcomePill({ outcome }: { outcome: string }) {
  const cfg = OUTCOME[outcome] ?? OUTCOME.completed;
  const Icon = cfg.Icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border', cfg.pill)}>
      <Icon size={10} /> {cfg.label}
    </span>
  );
}

function AgentDetail({ agent }: { agent: AgentStats }) {
  const outcomeCounts = agent.recentLogs.reduce<Record<string, number>>((acc, l) => {
    acc[l.outcome] = (acc[l.outcome] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Agent hero */}
      <div className="px-7 py-6 border-b border-border bg-white shrink-0">
        <div className="flex items-start gap-5">
          <AgentAvatar agent={agent} size="lg" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-bold text-foreground">{agent.name}</h2>
              <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border',
                agent.isActive
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-100 text-gray-500 border-gray-200')}>
                {agent.isActive ? '● Active' : '○ Inactive'}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{agent.phone}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              {agent.lastActive && (
                <span className="flex items-center gap-1"><Clock size={11} /> Last active {timeAgo(agent.lastActive)}</span>
              )}
              <span className="flex items-center gap-1">
                <Activity size={11} /> Joined {new Date(agent.createdAt).toLocaleDateString('en-GH', { month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-100">
            <p className="text-2xl font-bold text-emerald-700">{agent.stats.ordersCreated}</p>
            <p className="text-xs text-emerald-600/70 font-medium mt-0.5 flex items-center gap-1"><ShoppingBag size={10} /> Orders Created</p>
          </div>
          <div className="bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
            <p className="text-2xl font-bold text-blue-700">{agent.stats.callLogs}</p>
            <p className="text-xs text-blue-600/70 font-medium mt-0.5 flex items-center gap-1"><PhoneCall size={10} /> Calls Logged</p>
          </div>
          <div className="bg-purple-50 rounded-xl px-4 py-3 border border-purple-100">
            <p className="text-2xl font-bold text-purple-700">{agent.stats.messagesSent}</p>
            <p className="text-xs text-purple-600/70 font-medium mt-0.5 flex items-center gap-1"><MessageCircle size={10} /> Messages Sent</p>
          </div>
        </div>

        {/* Outcome breakdown */}
        {agent.recentLogs.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {Object.entries(outcomeCounts).map(([outcome, count]) => {
              const cfg = OUTCOME[outcome];
              if (!cfg) return null;
              const Icon = cfg.Icon;
              return (
                <span key={outcome} className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border', cfg.pill)}>
                  <Icon size={12} /> {cfg.label}: {count}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity tables */}
      <div className="flex-1 overflow-y-auto px-7 py-5 space-y-7 bg-gray-50/50">

        {/* Call logs table */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <PhoneCall size={14} className="text-blue-600" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Recent Call Logs</h3>
            <span className="ml-auto text-xs text-muted-foreground">{agent.recentLogs.length} shown</span>
          </div>
          {agent.recentLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-white rounded-2xl border border-border/50">
              <PhoneMissed size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No call logs recorded yet</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 overflow-hidden bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-gray-50/80">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Resident</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outcome</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Notes</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {agent.recentLogs.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <OutcomeDot outcome={log.outcome} />
                          <span className="font-medium text-foreground">{log.residentName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs hidden sm:table-cell">{log.residentPhone}</td>
                      <td className="px-4 py-3"><OutcomePill outcome={log.outcome} /></td>
                      <td className="px-4 py-3 text-xs text-muted-foreground italic hidden md:table-cell max-w-[180px] truncate">
                        {log.notes || <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right whitespace-nowrap">{fmt(log.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Orders table */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingBag size={14} className="text-emerald-600" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Recent Orders Created</h3>
            <span className="ml-auto text-xs text-muted-foreground">{agent.recentOrders.length} shown</span>
          </div>
          {agent.recentOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground bg-white rounded-2xl border border-border/50">
              <ShoppingBag size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No orders created yet</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border/60 overflow-hidden bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-gray-50/80">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Order ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {agent.recentOrders.map(order => (
                    <tr key={order.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-foreground">#{String(order.id).padStart(4, '0')}</td>
                      <td className="px-4 py-3 font-semibold text-foreground">GH₵ {parseFloat(order.total).toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border capitalize',
                          ORDER_STATUS[order.status] ?? 'bg-gray-50 text-gray-600 border-gray-200')}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground text-right whitespace-nowrap">{fmt(order.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyDetail() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <div className="h-16 w-16 rounded-full bg-gray-100 flex items-center justify-center">
        <User size={28} className="opacity-30" />
      </div>
      <div className="text-center">
        <p className="font-semibold text-foreground/60">Select an agent</p>
        <p className="text-sm mt-0.5">Choose an agent from the list to view their activity</p>
      </div>
    </div>
  );
}

export default function AdminCallLog() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);

  const { data: agents = [], isLoading, refetch, isFetching } = useQuery<AgentStats[]>({
    queryKey: ['agents-overview'],
    queryFn: () => fetch(`${BASE}/api/agents/overview`).then(r => r.json()),
    refetchInterval: 60000,
  });

  const selected = agents.find(a => a.id === selectedId) ?? null;
  const totalOrders   = agents.reduce((s, a) => s + a.stats.ordersCreated, 0);
  const totalCalls    = agents.reduce((s, a) => s + a.stats.callLogs, 0);
  const totalMessages = agents.reduce((s, a) => s + a.stats.messagesSent, 0);
  const activeCount   = agents.filter(a => a.isActive).length;

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setMobileDetail(true);
  };

  return (
    <div className="flex min-h-screen bg-[#f8f9fb]">
      <AdminSidebar />

      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">

        {/* ─── Top header bar ─── */}
        <div className="shrink-0 bg-white border-b border-border px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-sm">
              <PhoneCall size={17} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground leading-none">Agent Activities</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Call agent performance & activity log</p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            <RotateCcw size={12} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>

        {/* ─── KPI summary bar ─── */}
        {!isLoading && agents.length > 0 && (
          <div className="shrink-0 bg-white border-b border-border px-6 lg:px-8 py-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard Icon={Users}         value={`${activeCount}/${agents.length}`} label="Active Agents"  color="bg-indigo-50 text-indigo-700 border-indigo-100" />
              <KpiCard Icon={ShoppingBag}   value={totalOrders}                       label="Total Orders"   color="bg-emerald-50 text-emerald-700 border-emerald-100" />
              <KpiCard Icon={PhoneCall}     value={totalCalls}                        label="Total Calls"    color="bg-blue-50 text-blue-700 border-blue-100" />
              <KpiCard Icon={MessageCircle} value={totalMessages}                     label="Total Messages"  color="bg-purple-50 text-purple-700 border-purple-100" />
            </div>
          </div>
        )}

        {/* ─── Main body: agent list + detail ─── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Agent list (always visible on lg+, hidden on mobile when detail is open) */}
          <aside className={cn(
            'flex flex-col bg-white border-r border-border shrink-0 overflow-hidden',
            'w-full lg:w-80 xl:w-96',
            mobileDetail && selected ? 'hidden lg:flex' : 'flex',
          )}>
            <div className="px-4 py-3 border-b border-border shrink-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70">
                Agents — {agents.length}
              </p>
            </div>

            {isLoading && (
              <div className="flex-1 flex items-center justify-center">
                <PhoneCall size={24} className="animate-pulse text-muted-foreground" />
              </div>
            )}

            {!isLoading && agents.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                <User size={32} className="mb-2 opacity-30" />
                <p className="text-sm font-medium">No agents registered</p>
                <p className="text-xs mt-0.5">Add call agents from the Users page</p>
              </div>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-border/50">
              {agents.map(agent => {
                const isSelected = selectedId === agent.id;
                return (
                  <button
                    key={agent.id}
                    onClick={() => handleSelect(agent.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-blue-50/40',
                      isSelected ? 'bg-blue-50 border-r-2 border-r-blue-600' : '',
                    )}
                  >
                    <AgentAvatar agent={agent} size="sm" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={cn('text-sm font-semibold truncate', isSelected ? 'text-blue-700' : 'text-foreground')}>
                          {agent.name}
                        </p>
                        <span className={cn('text-[10px] font-bold shrink-0', agent.isActive ? 'text-emerald-600' : 'text-gray-400')}>
                          {agent.isActive ? 'Active' : 'Off'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{agent.phone}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-blue-600 font-semibold flex items-center gap-0.5">
                          <PhoneCall size={9} /> {agent.stats.callLogs}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-0.5">
                          <ShoppingBag size={9} /> {agent.stats.ordersCreated}
                        </span>
                        <span className="text-[10px] text-purple-600 font-semibold flex items-center gap-0.5">
                          <MessageCircle size={9} /> {agent.stats.messagesSent}
                        </span>
                        {agent.lastActive && (
                          <span className="text-[10px] text-muted-foreground/60 ml-auto">
                            {timeAgo(agent.lastActive)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Detail panel */}
          <main className={cn(
            'flex-1 min-w-0 overflow-hidden',
            mobileDetail && selected ? 'flex flex-col' : 'hidden lg:flex lg:flex-col',
          )}>
            {/* Mobile back button */}
            {mobileDetail && selected && (
              <div className="lg:hidden shrink-0 px-4 py-2 border-b border-border bg-white">
                <button
                  onClick={() => setMobileDetail(false)}
                  className="flex items-center gap-1.5 text-sm font-semibold text-blue-600"
                >
                  <ArrowLeft size={15} /> Back to agents
                </button>
              </div>
            )}

            {selected ? <AgentDetail agent={selected} /> : <EmptyDetail />}
          </main>
        </div>
      </div>
    </div>
  );
}
