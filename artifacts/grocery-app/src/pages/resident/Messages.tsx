import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Send, MessageCircle, ChevronLeft, Headphones } from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import EmojiPickerButton from '@/components/EmojiPickerButton';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}/api${path}`, opts);
  if (!r.ok) throw new Error((await r.json()).error || 'Request failed');
  return r.json();
}

function formatTime(dateStr: string) {
  const d = parseISO(dateStr);
  if (isToday(d)) return format(d, 'h:mm a');
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMM d');
}

// ─── Chat Thread ──────────────────────────────────────────────────────────────
function ChatThread({ conv, residentId, residentName, onBack }: {
  conv: any; residentId: number; residentName: string; onBack: () => void;
}) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ['res-agent-messages', conv.residentId, conv.agentId],
    queryFn: () => apiFetch(`/agent-messages?residentId=${conv.residentId}&agentId=${conv.agentId}`),
    refetchInterval: 5000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => apiFetch('/agent-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residentId, agentId: conv.agentId, senderRole: 'resident', senderName: residentName, content }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['res-agent-messages', conv.residentId, conv.agentId] });
      qc.invalidateQueries({ queryKey: ['res-conversations', residentId] });
      setText('');
    },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  useEffect(() => {
    const unread = (messages as any[]).filter(m => m.senderRole === 'agent' && !m.readAt);
    unread.forEach(m => fetch(`${BASE}/api/agent-messages/${m.id}/read`, { method: 'PUT' }));
    if (unread.length > 0) setTimeout(() => qc.invalidateQueries({ queryKey: ['res-conversations', residentId] }), 500);
  }, [messages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || sendMutation.isPending) return;
    sendMutation.mutate(text.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (el) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newText = text.slice(0, start) + emoji + text.slice(end);
      setText(newText);
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + emoji.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      setText(prev => prev + emoji);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Headphones size={16} className="text-primary" />
        </div>
        <div>
          <p className="font-semibold text-sm">{conv.agentName ?? 'Dormi Support'}</p>
          <p className="text-xs text-muted-foreground">Call Agent · online</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3 bg-gray-50">
        <div className="flex justify-center">
          <div className="bg-white border border-border rounded-xl px-4 py-3 max-w-[260px] text-center shadow-sm">
            <Headphones size={18} className="text-primary mx-auto mb-1.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              You're messaging a <strong className="text-foreground">Dormi Call Agent</strong>. They can help you with orders, questions, and more.
            </p>
          </div>
        </div>

        {(messages as any[]).map((msg: any) => {
          const isResident = msg.senderRole === 'resident';
          return (
            <div key={msg.id} className={cn('flex', isResident ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                isResident
                  ? 'bg-primary text-white rounded-br-sm'
                  : 'bg-white text-gray-800 border border-border rounded-bl-sm',
              )}>
                <p className="leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={cn('text-[10px] mt-1 text-right', isResident ? 'text-white/70' : 'text-muted-foreground')}>
                  {formatTime(msg.createdAt)}
                  {isResident && msg.readAt && <span className="ml-1">· seen</span>}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 py-3 border-t border-border bg-white shrink-0">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message…"
              rows={1}
              disabled={sendMutation.isPending}
              className="w-full resize-none rounded-xl border border-input bg-background pl-3 pr-10 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 leading-relaxed"
              style={{ overflow: 'hidden', minHeight: '40px', maxHeight: '100px' }}
            />
            <EmojiPickerButton
              onEmojiSelect={insertEmoji}
              className="absolute right-2 bottom-2"
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="rounded-xl h-10 w-10 p-0 bg-primary hover:bg-primary/90 shrink-0 active:scale-95 transition-transform"
          >
            <Send size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ResidentMessages() {
  const { user } = useAuth();
  const residentId = user?.id!;
  const residentName = user?.name ?? 'Resident';

  const [selected, setSelected] = useState<any>(null);

  const { data: convs = [] } = useQuery<any[]>({
    queryKey: ['res-conversations', residentId],
    queryFn: () => apiFetch(`/agent-messages/conversations?residentId=${residentId}`),
    refetchInterval: 8000,
    enabled: !!residentId,
  });

  const totalUnread = (convs as any[]).reduce((sum, c) => sum + (c.unread ?? 0), 0);

  if (selected) {
    return (
      <div className="fixed inset-0 bg-white z-[60] flex flex-col" style={{ paddingBottom: '0' }}>
        <div className="flex-1 min-h-0 flex flex-col">
          <ChatThread
            conv={selected}
            residentId={residentId}
            residentName={residentName}
            onBack={() => setSelected(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white px-6 pt-12 pb-5 rounded-b-3xl shadow-sm border-b border-border mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Messages</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {totalUnread > 0 ? `${totalUnread} unread message${totalUnread > 1 ? 's' : ''}` : 'Chat with your call agent'}
            </p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Headphones size={18} className="text-primary" />
          </div>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-3">
        {(convs as any[]).length === 0 ? (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
              <MessageCircle size={28} className="text-primary/50" />
            </div>
            <p className="font-semibold text-gray-700">No messages yet</p>
            <p className="text-sm text-muted-foreground max-w-[200px] text-center">
              Your call agent will reach out here if they need to get in touch.
            </p>
          </div>
        ) : (
          (convs as any[]).map((conv: any) => {
            const latest = conv.latestMessage;
            return (
              <button
                key={`${conv.residentId}:${conv.agentId}`}
                onClick={() => setSelected(conv)}
                className="w-full bg-white rounded-2xl shadow-sm border border-border/60 p-4 flex items-center gap-3 hover:shadow-md active:scale-[0.99] transition-all text-left"
              >
                <div className="relative shrink-0">
                  <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center">
                    <Headphones size={18} className="text-primary" />
                  </div>
                  {conv.unread > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow-sm">
                      {conv.unread > 9 ? '9+' : conv.unread}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={cn('text-sm', conv.unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700')}>
                      {conv.agentName ?? 'Dormi Support'}
                    </p>
                    {latest && <p className="text-[10px] text-muted-foreground shrink-0 ml-1">{formatTime(latest.createdAt)}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Call Agent</p>
                  {latest && (
                    <p className={cn('text-xs mt-1 truncate', conv.unread > 0 ? 'font-medium text-gray-600' : 'text-muted-foreground')}>
                      {latest.senderRole === 'resident' ? 'You: ' : ''}{latest.content}
                    </p>
                  )}
                </div>
                <ChevronLeft size={16} className="text-muted-foreground/50 rotate-180 shrink-0" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
