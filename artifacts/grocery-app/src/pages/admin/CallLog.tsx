import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import {
  PhoneCall, MessageCircle, ShoppingBag, ChevronDown, ChevronUp,
  Clock, CheckCircle, XCircle, PhoneMissed, PhoneForwarded, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type AgentStats = {
  id: number;
  name: string;
  phone: string;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  lastActive: string | null;
  stats: {
    ordersCreated: number;
    callLogs: number;
    messagesSent: number;
  };
  recentLogs: {
    id: number;
    residentName: string;
    residentPhone: string;
    outcome: string;
    notes: string | null;
    createdAt: string;
  }[];
  recentOrders: {
    id: number;
    residentName?: string;
    total: string;
    status: string;
    createdAt: string;
  }[];
};

const OUTCOME_CONFIG: Record<string, { label: string; Icon: React.ElementType; color: string }> = {
  completed:          { label: 'Completed',        Icon: CheckCircle,    color: 'text-green-600 bg-green-50' },
  no_answer:          { label: 'No Answer',         Icon: PhoneMissed,    color: 'text-amber-600 bg-amber-50' },
  callback_requested: { label: 'Callback',          Icon: PhoneForwarded, color: 'text-blue-600 bg-blue-50' },
  cancelled:          { label: 'Cancelled',         Icon: XCircle,        color: 'text-red-600 bg-red-50' },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString('en-GH', { month: 'short', day: 'numeric' });
}

function StatPill({ icon: Icon, value, label, color }: { icon: React.ElementType; value: number; label: string; color: string }) {
  return (
    <div className={cn('flex flex-col items-center px-4 py-2.5 rounded-xl', color)}>
      <Icon size={15} className="mb-0.5 opacity-70" />
      <span className="text-lg font-bold leading-none">{value}</span>
      <span className="text-[10px] font-medium opacity-70 mt-0.5">{label}</span>
    </div>
  );
}

function AgentCard({ agent }: { agent: AgentStats }) {
  const [expanded, setExpanded] = useState(false);
  const initials = agent.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [imgErr, setImgErr] = useState(false);

  return (
    <Card className="border-0 shadow-md overflow-hidden">
      <CardContent className="p-0">
        {/* Agent header */}
        <div className="p-4 flex items-center gap-4">
          {/* Avatar */}
          <div className="h-14 w-14 rounded-full overflow-hidden shrink-0 border-2 border-border shadow-sm">
            {agent.photoUrl && !imgErr
              ? <img src={agent.photoUrl} alt={agent.name} className="w-full h-full object-cover" onError={() => setImgErr(true)} />
              : <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">{initials}</div>
            }
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-foreground text-base truncate">{agent.name}</h3>
              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full', agent.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>
                {agent.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{agent.phone}</p>
            {agent.lastActive && (
              <p className="text-[10px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                <Clock size={9} /> Last active {timeAgo(agent.lastActive)}
              </p>
            )}
          </div>

          <button
            onClick={() => setExpanded(v => !v)}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground shrink-0"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>

        {/* Stats row */}
        <div className="px-4 pb-4 flex gap-2">
          <StatPill icon={ShoppingBag}   value={agent.stats.ordersCreated} label="Orders"   color="bg-green-50 text-green-700" />
          <StatPill icon={PhoneCall}     value={agent.stats.callLogs}      label="Calls"    color="bg-blue-50 text-blue-700" />
          <StatPill icon={MessageCircle} value={agent.stats.messagesSent}  label="Messages" color="bg-purple-50 text-purple-700" />
        </div>

        {/* Expanded: recent activity */}
        {expanded && (
          <div className="border-t border-border/60 bg-muted/20 px-4 py-4 space-y-4">
            {/* Recent call logs */}
            {agent.recentLogs.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Recent Calls</p>
                <div className="space-y-2">
                  {agent.recentLogs.map(log => {
                    const cfg = OUTCOME_CONFIG[log.outcome] ?? OUTCOME_CONFIG.completed;
                    const Icon = cfg.Icon;
                    return (
                      <div key={log.id} className="flex items-start gap-3 bg-white rounded-xl p-3 border border-border/50">
                        <div className={cn('h-7 w-7 rounded-full flex items-center justify-center shrink-0', cfg.color)}>
                          <Icon size={13} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-sm font-semibold text-foreground truncate">{log.residentName}</span>
                            <span className="text-[10px] text-muted-foreground/60 shrink-0">{timeAgo(log.createdAt)}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{log.residentPhone}</p>
                          {log.notes && <p className="text-xs text-muted-foreground mt-0.5 italic line-clamp-1">"{log.notes}"</p>}
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded-md mt-1 inline-block', cfg.color)}>{cfg.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent orders */}
            {agent.recentOrders.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Recent Orders Created</p>
                <div className="space-y-2">
                  {agent.recentOrders.map(order => (
                    <div key={order.id} className="flex items-center gap-3 bg-white rounded-xl p-3 border border-border/50">
                      <div className="h-7 w-7 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0">
                        <ShoppingBag size={13} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-semibold text-foreground">Order #{order.id}</span>
                          <span className="text-[10px] text-muted-foreground/60">{timeAgo(order.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground">GH₵ {parseFloat(order.total).toFixed(2)}</span>
                          <span className="text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded-md capitalize">{order.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {agent.recentLogs.length === 0 && agent.recentOrders.length === 0 && (
              <div className="text-center py-4 text-muted-foreground">
                <User size={24} className="mx-auto mb-1 opacity-30" />
                <p className="text-xs">No activity recorded yet</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminCallLog() {
  const { data: agents = [], isLoading } = useQuery<AgentStats[]>({
    queryKey: ['agents-overview'],
    queryFn: () => fetch(`${BASE}/api/agents/overview`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const totalOrders   = agents.reduce((s, a) => s + a.stats.ordersCreated, 0);
  const totalCalls    = agents.reduce((s, a) => s + a.stats.callLogs, 0);
  const totalMessages = agents.reduce((s, a) => s + a.stats.messagesSent, 0);
  const activeCount   = agents.filter(a => a.isActive).length;

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">

          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <PhoneCall size={20} className="text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-foreground">Agent Activities</h1>
              <p className="text-sm text-muted-foreground">Overview of all call agents and their performance</p>
            </div>
          </div>

          {/* Summary banner */}
          {!isLoading && agents.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Active Agents',  value: activeCount,   Icon: User,          color: 'bg-indigo-50 text-indigo-700' },
                { label: 'Total Orders',   value: totalOrders,   Icon: ShoppingBag,   color: 'bg-green-50 text-green-700' },
                { label: 'Total Calls',    value: totalCalls,    Icon: PhoneCall,     color: 'bg-blue-50 text-blue-700' },
                { label: 'Total Messages', value: totalMessages, Icon: MessageCircle, color: 'bg-purple-50 text-purple-700' },
              ].map(({ label, value, Icon, color }) => (
                <div key={label} className={cn('rounded-2xl p-4 flex flex-col gap-1', color)}>
                  <Icon size={18} className="opacity-70" />
                  <span className="text-2xl font-bold leading-none">{value}</span>
                  <span className="text-xs font-medium opacity-70">{label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Agent cards */}
          {isLoading && (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <PhoneCall size={28} className="animate-pulse mr-2" /> Loading agents…
            </div>
          )}

          {!isLoading && agents.length === 0 && (
            <div className="text-center py-20 text-muted-foreground">
              <User size={40} className="mx-auto mb-2 opacity-30" />
              <p>No call agents registered yet.</p>
              <p className="text-sm mt-1">Add agents from the Users page.</p>
            </div>
          )}

          <div className="space-y-4">
            {agents.map(agent => <AgentCard key={agent.id} agent={agent} />)}
          </div>
        </div>
      </main>
    </div>
  );
}
