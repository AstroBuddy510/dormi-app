import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Bell, Send, Trash2, Info, Megaphone, ShoppingCart, Tag, Users, User,
} from 'lucide-react';
import { useListResidents } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

type Notification = {
  id: number;
  residentId: number | null;
  title: string;
  body: string;
  type: string;
  readAt: string | null;
  createdAt: string;
};

const TYPE_OPTS = [
  { value: 'info', label: 'Info', Icon: Info, color: 'bg-blue-100 text-blue-600' },
  { value: 'alert', label: 'Alert', Icon: Megaphone, color: 'bg-red-100 text-red-600' },
  { value: 'order', label: 'Order', Icon: ShoppingCart, color: 'bg-green-100 text-green-600' },
  { value: 'promo', label: 'Promo', Icon: Tag, color: 'bg-yellow-100 text-yellow-600' },
];

function formatDate(d: string) {
  return new Date(d).toLocaleString('en-GH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('info');
  const [target, setTarget] = useState('all');
  const [residentId, setResidentId] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: residents = [] } = useListResidents();
  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['admin-notifications-all'],
    queryFn: () => fetch(`${BASE}/api/notifications/all`).then(r => r.json()),
    refetchInterval: 20000,
  });

  const sendMutation = useMutation({
    mutationFn: (payload: { title: string; body: string; type: string; residentId?: number | null }) =>
      fetch(`${BASE}/api/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications-all'] });
      toast({ title: 'Notification sent', description: 'Residents will see it on their home screen.' });
      setTitle('');
      setBody('');
      setType('info');
      setTarget('all');
      setResidentId('');
    },
    onError: () => toast({ title: 'Error', description: 'Failed to send notification.', variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/notifications/${id}`, { method: 'DELETE' }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notifications-all'] });
      toast({ title: 'Notification deleted' });
      setDeleteId(null);
    },
  });

  const handleSend = () => {
    if (!title.trim() || !body.trim()) {
      toast({ title: 'Missing fields', description: 'Title and message are required.', variant: 'destructive' });
      return;
    }
    const rid = target === 'specific' ? parseInt(residentId) : null;
    if (target === 'specific' && isNaN(rid as number)) {
      toast({ title: 'Select a resident', variant: 'destructive' });
      return;
    }
    sendMutation.mutate({ title: title.trim(), body: body.trim(), type, residentId: rid });
  };

  const getTypeOpt = (t: string) => TYPE_OPTS.find(o => o.value === t) ?? TYPE_OPTS[0];

  const residentsArr = Array.isArray(residents) ? residents : (residents as any)?.residents ?? [];

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bell size={20} className="text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display text-foreground">Push Notifications</h1>
              <p className="text-sm text-muted-foreground">Send alerts to residents on their home screen</p>
            </div>
          </div>

          {/* Compose form */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold">Compose Notification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTS.map(o => (
                        <SelectItem key={o.value} value={o.value}>
                          <div className="flex items-center gap-2">
                            <o.Icon size={14} />
                            {o.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Send to</Label>
                  <Select value={target} onValueChange={v => { setTarget(v); setResidentId(''); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <div className="flex items-center gap-2"><Users size={14} /> All Residents</div>
                      </SelectItem>
                      <SelectItem value="specific">
                        <div className="flex items-center gap-2"><User size={14} /> Specific Resident</div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {target === 'specific' && (
                <div className="space-y-1.5">
                  <Label>Resident</Label>
                  <Select value={residentId} onValueChange={setResidentId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select resident…" />
                    </SelectTrigger>
                    <SelectContent>
                      {residentsArr.map((r: any) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name} — {r.phone}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  placeholder="e.g. New delivery window available"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Message</Label>
                <Textarea
                  placeholder="Write your notification message here…"
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSend}
                  disabled={sendMutation.isPending}
                  className="bg-primary hover:bg-primary/90 text-white font-semibold"
                >
                  <Send size={15} className="mr-2" />
                  {sendMutation.isPending ? 'Sending…' : 'Send Notification'}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Sent notifications list */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center justify-between">
                <span>Sent Notifications</span>
                <span className="text-xs font-normal text-muted-foreground">{notifications.length} total</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Bell size={28} className="animate-pulse" />
                </div>
              )}
              {!isLoading && notifications.length === 0 && (
                <div className="text-center py-10 text-muted-foreground">
                  <Bell size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No notifications sent yet</p>
                </div>
              )}
              <div className="space-y-2">
                {notifications.map(n => {
                  const opt = getTypeOpt(n.type);
                  const Icon = opt.Icon;
                  const targetLabel = n.residentId
                    ? residentsArr.find((r: any) => r.id === n.residentId)?.name ?? `Resident #${n.residentId}`
                    : 'All Residents';
                  return (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                    >
                      <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0 mt-0.5', opt.color)}>
                        <Icon size={16} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-sm text-foreground">{n.title}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-muted-foreground">{formatDate(n.createdAt)}</span>
                            <button
                              onClick={() => setDeleteId(n.id)}
                              className="p-1 rounded-md hover:bg-red-100 transition-colors text-muted-foreground hover:text-red-600"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                            {opt.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            {n.residentId ? <User size={10} /> : <Users size={10} />}
                            {targetLabel}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <AlertDialog open={deleteId !== null} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete notification?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the notification for all residents. This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
