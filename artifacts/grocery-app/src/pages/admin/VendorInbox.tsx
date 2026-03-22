import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Store, Send, ChevronLeft, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface VendorMessage {
  id: number;
  vendorId: number;
  senderRole: string;
  senderName: string | null;
  content: string;
  createdAt: string;
  readAt: string | null;
}

interface Thread {
  vendorId: number;
  vendorName: string;
  messages: VendorMessage[];
  unread: number;
}

export default function VendorInbox() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);
  const [reply, setReply] = useState('');

  const { data: allMessages = [] } = useQuery<VendorMessage[]>({
    queryKey: ['vendor-messages-all'],
    queryFn: () => fetch(`${BASE}/api/vendor-messages`).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const threads: Thread[] = Object.values(
    allMessages.reduce((acc: Record<number, Thread>, msg) => {
      if (!acc[msg.vendorId]) {
        acc[msg.vendorId] = {
          vendorId: msg.vendorId,
          vendorName: msg.senderRole === 'vendor' ? (msg.senderName ?? `Vendor #${msg.vendorId}`) : `Vendor #${msg.vendorId}`,
          messages: [],
          unread: 0,
        };
      }
      if (msg.senderRole === 'vendor' && acc[msg.vendorId].vendorName === `Vendor #${msg.vendorId}` && msg.senderName) {
        acc[msg.vendorId].vendorName = msg.senderName;
      }
      acc[msg.vendorId].messages.push(msg);
      if (msg.senderRole === 'vendor' && !msg.readAt) acc[msg.vendorId].unread++;
      return acc;
    }, {})
  ).sort((a, b) => {
    const aLast = a.messages[a.messages.length - 1]?.createdAt ?? '';
    const bLast = b.messages[b.messages.length - 1]?.createdAt ?? '';
    return bLast.localeCompare(aLast);
  });

  const selectedThread = threads.find(t => t.vendorId === selectedVendorId);
  const sortedMsgs = selectedThread
    ? [...selectedThread.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/vendor-messages/${id}/read`, { method: 'PUT' }).then(r => r.json()),
  });

  const replyMutation = useMutation({
    mutationFn: ({ msgId, content }: { msgId: number; content: string }) =>
      fetch(`${BASE}/api/vendor-messages/${msgId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor-messages-all'] });
      setReply('');
    },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  const openThread = (vendorId: number) => {
    setSelectedVendorId(vendorId);
    const thread = threads.find(t => t.vendorId === vendorId);
    thread?.messages
      .filter(m => m.senderRole === 'vendor' && !m.readAt)
      .forEach(m => markReadMutation.mutate(m.id));
    queryClient.invalidateQueries({ queryKey: ['vendor-messages-unread-admin'] });
  };

  const handleReply = () => {
    const trimmed = reply.trim();
    if (!trimmed || !sortedMsgs.length) return;
    const lastMsg = sortedMsgs[sortedMsgs.length - 1];
    replyMutation.mutate({ msgId: lastMsg.id, content: trimmed });
  };

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          {selectedVendorId && (
            <button
              onClick={() => setSelectedVendorId(null)}
              className="p-2 rounded-xl hover:bg-gray-100 text-muted-foreground"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Vendor Inbox</h1>
            <p className="text-sm text-muted-foreground">
              {totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? 's' : ''}` : 'All messages read'}
            </p>
          </div>
        </div>

        {!selectedVendorId ? (
          threads.length === 0 ? (
            <Card className="rounded-2xl border shadow-sm">
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
                  <MessageCircle className="h-7 w-7 text-primary" />
                </div>
                <p className="font-semibold text-gray-700 mb-1">No vendor messages yet</p>
                <p className="text-sm text-muted-foreground">When vendors send messages, they'll appear here.</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border shadow-sm overflow-hidden">
              <div className="divide-y divide-border">
                {threads.map(thread => {
                  const lastMsg = thread.messages[thread.messages.length - 1];
                  return (
                    <button
                      key={thread.vendorId}
                      onClick={() => openThread(thread.vendorId)}
                      className="w-full text-left px-5 py-4 hover:bg-gray-50 transition-colors flex items-center gap-4"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Store size={18} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <p className={`font-semibold text-sm ${thread.unread > 0 ? 'text-gray-900' : 'text-gray-700'}`}>
                            {thread.vendorName}
                          </p>
                          <span className="text-[11px] text-muted-foreground flex-shrink-0">
                            {lastMsg ? format(new Date(lastMsg.createdAt), 'dd MMM') : ''}
                          </span>
                        </div>
                        <p className={`text-xs truncate ${thread.unread > 0 ? 'text-gray-700 font-medium' : 'text-muted-foreground'}`}>
                          {lastMsg ? (lastMsg.senderRole === 'admin' ? `You: ${lastMsg.content}` : lastMsg.content) : 'No messages'}
                        </p>
                      </div>
                      {thread.unread > 0 && (
                        <span className="min-w-[20px] h-5 rounded-full bg-primary text-white text-[11px] font-bold flex items-center justify-center px-1 flex-shrink-0">
                          {thread.unread}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>
          )
        ) : (
          <Card className="rounded-2xl border shadow-sm flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
            <CardContent className="p-0 flex flex-col h-full">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-gray-50/50">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Store size={16} className="text-primary" />
                </div>
                <div>
                  <p className="font-semibold text-sm">{selectedThread?.vendorName}</p>
                  <p className="text-xs text-muted-foreground">Vendor #{selectedVendorId}</p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {sortedMsgs.map(msg => {
                  const isAdmin = msg.senderRole === 'admin';
                  return (
                    <div key={msg.id} className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                        isAdmin
                          ? 'bg-primary text-white rounded-tr-sm'
                          : 'bg-gray-100 text-foreground rounded-tl-sm'
                      }`}>
                        <p className="text-sm leading-snug">{msg.content}</p>
                        <p className={`text-[10px] mt-1 text-right ${isAdmin ? 'text-white/70' : 'text-muted-foreground'}`}>
                          {format(new Date(msg.createdAt), 'dd MMM · HH:mm')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-2 border-t border-border px-5 py-4">
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                  placeholder="Type a reply to the vendor…"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <Button
                  onClick={handleReply}
                  disabled={!reply.trim() || replyMutation.isPending}
                  className="self-end h-10 w-10 p-0 rounded-xl"
                >
                  <Send size={15} />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
