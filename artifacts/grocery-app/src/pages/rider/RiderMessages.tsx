import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Send, MessageCircle, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

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

interface RiderMessagesProps {
  riderId: number;
  riderName: string;
}

export function RiderMessages({ riderId, riderName }: RiderMessagesProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: messages = [], isLoading } = useQuery<Message[]>({
    queryKey: ['rider-messages', riderId],
    queryFn: () => fetch(`${BASE}/api/rider-messages?riderId=${riderId}`).then(r => r.json()),
    refetchInterval: 8000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) =>
      fetch(`${BASE}/api/rider-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ riderId, senderRole: 'rider', senderName: riderName, content }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rider-messages', riderId] });
      setText('');
    },
    onError: () => {
      toast({ title: 'Failed to send message', variant: 'destructive' });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/rider-messages/${id}/read`, { method: 'PUT' }).then(r => r.json()),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    messages
      .filter(m => m.senderRole === 'admin' && !m.readAt)
      .forEach(m => markReadMutation.mutate(m.id));
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 bg-zinc-900 px-4 py-3 rounded-2xl mb-4">
        <div className="p-2 bg-zinc-800 rounded-full">
          <MessageCircle size={16} className="text-primary" />
        </div>
        <div>
          <p className="text-white font-semibold text-sm">Message Admin</p>
          <p className="text-zinc-400 text-xs">Complaints, queries, or feedback</p>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ['rider-messages', riderId] })}
          className="ml-auto p-1.5 rounded-lg text-zinc-400 hover:text-white"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 min-h-[300px] max-h-[420px] px-1 pb-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            <MessageCircle size={36} className="opacity-20" />
            <p className="text-sm text-center">No messages yet. Say hi to the admin or report an issue below.</p>
          </div>
        ) : (
          messages.map(msg => {
            const isRider = msg.senderRole === 'rider';
            return (
              <div key={msg.id} className={`flex ${isRider ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 shadow-sm ${
                  isRider
                    ? 'bg-primary text-white rounded-tr-sm'
                    : 'bg-white border border-border text-foreground rounded-tl-sm'
                }`}>
                  {!isRider && (
                    <p className="text-[10px] font-semibold text-blue-600 mb-0.5">
                      {msg.senderName ?? 'Admin'}
                    </p>
                  )}
                  <p className="text-sm leading-snug">{msg.content}</p>
                  <p className={`text-[10px] mt-1 text-right ${isRider ? 'text-white/70' : 'text-muted-foreground'}`}>
                    {format(new Date(msg.createdAt), 'dd MMM · HH:mm')}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 pt-3 border-t border-border mt-auto">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to admin…"
          rows={2}
          className="flex-1 resize-none rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground"
        />
        <Button
          onClick={handleSend}
          disabled={!text.trim() || sendMutation.isPending}
          className="self-end h-10 w-10 p-0 rounded-xl bg-primary hover:bg-primary/90"
        >
          <Send size={16} />
        </Button>
      </div>
    </div>
  );
}
