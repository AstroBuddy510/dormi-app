import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  format, isToday, isThisWeek, subDays, isSameDay, parseISO,
} from 'date-fns';
import { CheckCircle2, Clock, Zap, Trophy } from 'lucide-react';

const BADGES = [
  { id: 'first',    icon: '⚡', name: 'First Drop',    desc: 'Completed first delivery',    threshold: (t: number) => t >= 1 },
  { id: 'fire',     icon: '🔥', name: 'On Fire',        desc: '3+ deliveries today',         threshold: (_: number, today: number) => today >= 3 },
  { id: 'speed',    icon: '🚀', name: 'Speed Demon',    desc: 'Avg delivery under 25 min',   threshold: (_: number, __: number, avg: number) => avg > 0 && avg < 25 },
  { id: 'tenx',     icon: '🌟', name: 'Star Rider',     desc: '10+ total deliveries',        threshold: (t: number) => t >= 10 },
  { id: 'warrior',  icon: '💪', name: 'Road Warrior',   desc: '25+ total deliveries',        threshold: (t: number) => t >= 25 },
  { id: 'elite',    icon: '🏆', name: 'Elite Rider',    desc: '50+ total deliveries',        threshold: (t: number) => t >= 50 },
  { id: 'century',  icon: '🎖️', name: 'Century Mark',   desc: '100+ total deliveries',      threshold: (t: number) => t >= 100 },
  { id: 'quick',    icon: '🎯', name: 'Quick Hands',    desc: 'Avg delivery under 20 min',   threshold: (_: number, __: number, avg: number) => avg > 0 && avg < 20 },
];

interface RiderStatsProps {
  allJobs: any[];
}

export function RiderStats({ allJobs }: RiderStatsProps) {
  const delivered = useMemo(
    () => allJobs.filter(j => j.status === 'delivered'),
    [allJobs],
  );

  const todayDeliveries  = useMemo(() => delivered.filter(j => j.deliveredAt && isToday(parseISO(j.deliveredAt))), [delivered]);
  const weekDeliveries   = useMemo(() => delivered.filter(j => j.deliveredAt && isThisWeek(parseISO(j.deliveredAt), { weekStartsOn: 1 })), [delivered]);

  const avgDeliveryMins = useMemo(() => {
    const timed = delivered.filter(j => j.pickedUpAt && j.deliveredAt);
    if (!timed.length) return 0;
    const total = timed.reduce((sum, j) => {
      return sum + (new Date(j.deliveredAt).getTime() - new Date(j.pickedUpAt).getTime()) / 60000;
    }, 0);
    return Math.round(total / timed.length);
  }, [delivered]);

  const last7 = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = subDays(new Date(), 6 - i);
      const count = delivered.filter(j => j.deliveredAt && isSameDay(parseISO(j.deliveredAt), day)).length;
      return { label: format(day, 'EEE'), date: day, count };
    });
  }, [delivered]);

  const maxCount = Math.max(...last7.map(d => d.count), 1);

  const earnedBadges = BADGES.filter(b => b.threshold(delivered.length, todayDeliveries.length, avgDeliveryMins));
  const lockedBadges = BADGES.filter(b => !b.threshold(delivered.length, todayDeliveries.length, avgDeliveryMins));

  const statCards = [
    { label: 'Today',     value: todayDeliveries.length,  icon: Zap,          color: 'text-amber-600 bg-amber-50' },
    { label: 'This Week', value: weekDeliveries.length,   icon: CheckCircle2, color: 'text-blue-600 bg-blue-50' },
    { label: 'All Time',  value: delivered.length,        icon: Trophy,       color: 'text-green-600 bg-green-50' },
    { label: 'Avg Time',  value: avgDeliveryMins > 0 ? `${avgDeliveryMins}m` : '—', icon: Clock, color: 'text-purple-600 bg-purple-50' },
  ];

  return (
    <div className="space-y-6 pb-6">

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3">
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-xl ${color}`}>
                <Icon size={18} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 7-Day Chart */}
      <Card className="rounded-2xl border-0 shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-sm font-bold text-foreground mb-4">Deliveries — Last 7 Days</h3>
          {delivered.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-muted-foreground text-xs">
              No deliveries yet — your chart will appear here.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={130}>
              <BarChart data={last7} barSize={28}>
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide allowDecimals={false} domain={[0, maxCount + 1]} />
                <Tooltip
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div className="bg-white border border-border rounded-xl px-3 py-1.5 text-xs shadow-md">
                        <p className="font-semibold">{payload[0].value} delivery{payload[0].value !== 1 ? 'ies' : 'y'}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {last7.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={isToday(entry.date) ? '#16a34a' : entry.count > 0 ? '#4ade80' : '#e5e7eb'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Earned Badges */}
      <div>
        <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <span>🏅</span> Your Badges {earnedBadges.length > 0 && <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">{earnedBadges.length} earned</span>}
        </h3>
        {earnedBadges.length === 0 ? (
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-6 text-center text-muted-foreground text-sm">
              <p className="text-3xl mb-2">🎯</p>
              <p>Complete your first delivery to start earning badges!</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {earnedBadges.map(badge => (
              <Card key={badge.id} className="rounded-2xl border-0 shadow-sm bg-gradient-to-br from-green-50 to-emerald-50 border border-green-100">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-3xl">{badge.icon}</span>
                  <div>
                    <p className="font-bold text-sm text-green-800">{badge.name}</p>
                    <p className="text-[11px] text-green-600 leading-tight">{badge.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Locked Badges */}
      {lockedBadges.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
            🔒 Badges to Unlock
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {lockedBadges.map(badge => (
              <Card key={badge.id} className="rounded-2xl border-0 shadow-sm opacity-50">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="text-3xl grayscale">{badge.icon}</span>
                  <div>
                    <p className="font-semibold text-sm text-muted-foreground">{badge.name}</p>
                    <p className="text-[11px] text-muted-foreground/70 leading-tight">{badge.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
