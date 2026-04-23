import { useState, useRef } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, Send, User, ChevronLeft } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import EmojiPickerButton from '@/components/EmojiPickerButton';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface Message {
  id: number;
  riderId: number;
  senderRole: string;
  senderName: string | null;
  content: string;
  createdAt: string;
  readAt: string | null;
}

export default function RiderInbox() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectedRiderId, setSelectedRiderId] = useState<number | null>(null);
  const [reply, setReply] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleEmojiSelect = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setReply(prev => prev + emoji);
      return;
    }
    const start = el.selectionStart ?? reply.length;
    const end = el.selectionEnd ?? reply.length;
    const newReply = reply.slice(0, start) + emoji + reply.slice(end);
    setReply(newReply);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const { data: allMessages = [] } = useQuery<Message[]>({
    queryKey: ['rider-messages-all'],
    queryFn: () => fetch(`${BASE}/api/rider-messages`).then(r => r.json()),
    refetchInterval: 10_000,
  });

  const threads = Object.entries(
    allMessages.reduce((acc: Record<number, { riderId: number; riderName: string; messages: Message[]; unread: number }>, msg) => {
      if (!acc[msg.riderId]) {
        acc[msg.riderId] = {
          riderId: msg.riderId,
          riderName: msg.senderRole === 'rider' ? (msg.senderName ?? `Rider #${msg.riderId}`) : `Rider #${msg.riderId}`,
          messages: [],
          unread: 0,
        };
      }
      acc[msg.riderId].messages.push(msg);
      if (msg.senderRole === 'rider' && !msg.readAt) acc[msg.riderId].unread++;
      return acc;
    }, {})
  )
    .map(([, thread]) => thread)
    .sort((a, b) => {
      const aLast = a.messages[a.messages.length - 1]?.createdAt ?? '';
      const bLast = b.messages[b.messages.length - 1]?.createdAt ?? '';
      return bLast.localeCompare(aLast);
    });

  const selectedThread = threads.find(t => t.riderId === selectedRiderId);
  const sortedMsgs = selectedThread
    ? [...selectedThread.messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    : [];

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/rider-messages/${id}/read`, { method: 'PUT' }).then(r => r.json()),
  });

  const replyMutation = useMutation({
    mutationFn: ({ msgId, content }: { msgId: number; content: string }) =>
      fetch(`${BASE}/api/rider-messages/${msgId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rider-messages-all'] });
      setReply('');
    },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  const openThread = (riderId: number) => {
    setSelectedRiderId(riderId);
    const thread = threads.find(t => t.riderId === riderId);
    thread?.messages
      .filter(m => m.senderRole === 'rider' && !m.readAt)
      .forEach(m => markReadMutation.mutate(m.id));
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
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="flex items-center gap-3 mb-6">
          {selectedRiderId && (
            <button
              onClick={() => setSelectedRiderId(null)}
              className="p-2 rounded-xl hover:bg-gray-100 text-muted-foreground"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageCircle size={22} className="text-primary" />
              Rider Messages
              {totalUnread > 0 && (
                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{totalUnread}</span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">Messages and complaints from your riders</p>
          </div>
        </div>

        {!selectedRiderId ? (
          /* Thread list */
          <div className="space-y-3">
            {threads.length === 0 ? (
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="p-12 flex flex-col items-center gap-3 text-muted-foreground">
                  <MessageCircle size={40} className="opacity-20" />
                  <p className="text-sm">No rider messages yet. They'll appear here when a rider reaches out.</p>
                </CardContent>
              </Card>
            ) : (
              threads.map(thread => {
                const last = thread.messages[thread.messages.length - 1];
                return (
                  <Card
                    key={thread.riderId}
                    onClick={() => openThread(thread.riderId)}
                    className="rounded-2xl border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="p-2.5 bg-primary/10 rounded-full shrink-0">
                        <User size={18} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-foreground">{thread.riderName}</p>
                          {thread.unread > 0 && (
                            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{thread.unread}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">{last?.content ?? '—'}</p>
                      </div>
                      <p className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {last ? format(new Date(last.createdAt), 'dd MMM HH:mm') : ''}
                      </p>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        ) : (
          /* Thread detail */
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardContent className="p-4 flex flex-col h-[500px]">
              <div className="flex items-center gap-2 pb-3 border-b border-border mb-4">
                <User size={16} className="text-primary" />
                <p className="font-semibold">{selectedThread?.riderName}</p>
                <span className="text-xs text-muted-foreground">· Rider #{selectedRiderId}</span>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 mb-4">
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

              <div className="flex gap-2 border-t border-border pt-3 items-end">
                <textarea
                  ref={textareaRef}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(); } }}
                  placeholder="Type a reply…"
                  rows={2}
                  className="flex-1 resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <EmojiPickerButton
                  onEmojiSelect={handleEmojiSelect}
                  className="h-10 w-10 rounded-xl"
                />
                <Button
                  onClick={handleReply}
                  disabled={!reply.trim() || replyMutation.isPending}
                  className="h-10 w-10 p-0 rounded-xl"
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
