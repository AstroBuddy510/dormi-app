import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AgentLayout } from '@/components/layout/AgentLayout';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Send, MessageCircle, ChevronLeft, Phone, Users,
} from 'lucide-react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

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

// ─── New Conversation Picker ──────────────────────────────────────────────────
function NewConvPicker({ agentId, onStart, onClose }: { agentId: number; onStart: (r: any) => void; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const { data: residents = [] } = useQuery<any[]>({
    queryKey: ['residents'],
    queryFn: () => apiFetch('/residents'),
  });
  const filtered = (residents as any[]).filter(r =>
    !search || r.fullName.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search)
  );
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft size={18} />
        </button>
        <p className="font-semibold text-sm">New Message</p>
      </div>
      <div className="px-3 py-2 border-b border-border">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resident…"
            className="pl-8 h-8 text-sm rounded-xl"
            autoFocus
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((r: any) => (
          <button
            key={r.id}
            onClick={() => onStart(r)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
              {r.fullName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{r.fullName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone size={10} /> {r.phone}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Chat Thread ──────────────────────────────────────────────────────────────
function ChatThread({ conv, agentId, agentName, onBack }: { conv: any; agentId: number; agentName: string; onBack: () => void }) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ['agent-messages', conv.residentId, agentId],
    queryFn: () => apiFetch(`/agent-messages?residentId=${conv.residentId}&agentId=${agentId}`),
    refetchInterval: 6000,
  });

  const sendMutation = useMutation({
    mutationFn: (content: string) => apiFetch('/agent-messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ residentId: conv.residentId, agentId, senderRole: 'agent', senderName: agentName, content }),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-messages', conv.residentId, agentId] });
      qc.invalidateQueries({ queryKey: ['agent-conversations', agentId] });
      setText('');
    },
    onError: () => toast({ title: 'Failed to send', variant: 'destructive' }),
  });

  // Mark resident messages as read when opening thread
  useEffect(() => {
    const unread = (messages as any[]).filter(m => m.senderRole === 'resident' && !m.readAt);
    unread.forEach(m => {
      fetch(`${BASE}/api/agent-messages/${m.id}/read`, { method: 'PUT' });
    });
    if (unread.length > 0) {
      setTimeout(() => qc.invalidateQueries({ queryKey: ['agent-conversations', agentId] }), 500);
    }
  }, [messages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMutation.mutate(text.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Thread header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white shrink-0">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors lg:hidden">
          <ChevronLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
          {conv.residentName?.charAt(0) ?? '?'}
        </div>
        <div>
          <p className="font-semibold text-sm">{conv.residentName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone size={10} /> {conv.residentPhone}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {(messages as any[]).length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet. Start the conversation!</p>
        )}
        {(messages as any[]).map((msg: any) => {
          const isAgent = msg.senderRole === 'agent';
          return (
            <div key={msg.id} className={cn('flex', isAgent ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                isAgent
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white text-gray-800 border border-border rounded-bl-sm',
              )}>
                <p className="leading-snug whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={cn('text-[10px] mt-1', isAgent ? 'text-blue-200' : 'text-muted-foreground')}>
                  {formatTime(msg.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border bg-white shrink-0">
        <div className="flex gap-2 items-end">
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="rounded-xl flex-1 text-sm resize-none"
            disabled={sendMutation.isPending}
          />
          <Button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="rounded-xl h-10 w-10 p-0 bg-blue-600 hover:bg-blue-700 shrink-0"
          >
            <Send size={15} />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Conversations List ───────────────────────────────────────────────────────
function ConvList({ agentId, selected, onSelect, onNew }: { agentId: number; selected: any | null; onSelect: (c: any) => void; onNew: () => void }) {
  const [search, setSearch] = useState('');
  const { data: convs = [] } = useQuery<any[]>({
    queryKey: ['agent-conversations', agentId],
    queryFn: () => apiFetch(`/agent-messages/conversations?agentId=${agentId}`),
    refetchInterval: 8000,
  });

  const filtered = (convs as any[]).filter(c =>
    !search || c.residentName?.toLowerCase().includes(search.toLowerCase()) || c.residentPhone?.includes(search)
  );

  return (
    <div className="flex flex-col h-full border-r border-border">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <p className="font-bold text-base">Messages</p>
          <Button size="sm" onClick={onNew} className="h-8 rounded-xl bg-blue-600 hover:bg-blue-700 gap-1 text-xs px-3">
            <Users size={13} /> New
          </Button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="pl-8 h-8 text-sm rounded-xl" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
            <MessageCircle size={32} className="opacity-30" />
            <p className="text-sm">No conversations yet</p>
          </div>
        )}
        {filtered.map((conv: any) => {
          const isSelected = selected?.residentId === conv.residentId && selected?.agentId === conv.agentId;
          const latest = conv.latestMessage;
          return (
            <button
              key={`${conv.residentId}:${conv.agentId}`}
              onClick={() => onSelect(conv)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-border/50',
                isSelected && 'bg-blue-50 border-l-2 border-l-blue-500',
              )}
            >
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                  {conv.residentName?.charAt(0) ?? '?'}
                </div>
                {conv.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                    {conv.unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={cn('text-sm truncate', conv.unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800')}>
                    {conv.residentName}
                  </p>
                  {latest && <p className="text-[10px] text-muted-foreground shrink-0 ml-1">{formatTime(latest.createdAt)}</p>}
                </div>
                {latest && (
                  <p className={cn('text-xs truncate mt-0.5', conv.unread > 0 ? 'font-medium text-gray-600' : 'text-muted-foreground')}>
                    {latest.senderRole === 'agent' ? 'You: ' : ''}{latest.content}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AgentMessages() {
  const { user } = useAuth();
  const agentId = user?.id!;
  const agentName = user?.name ?? 'Agent';

  const [selected, setSelected] = useState<any>(null);
  const [pickingNew, setPickingNew] = useState(false);

  const handleStartNew = (resident: any) => {
    setPickingNew(false);
    setSelected({ residentId: resident.id, residentName: resident.fullName, residentPhone: resident.phone, agentId });
  };

  return (
    <AgentLayout>
      <div className="h-[calc(100vh-8rem)] md:h-[calc(100vh-4rem)] flex rounded-2xl overflow-hidden border border-border shadow-sm bg-white">
        {/* Left panel — conversations list (always visible on desktop, hidden on mobile when thread open) */}
        <div className={cn('w-full lg:w-80 xl:w-96 shrink-0 flex flex-col', (selected || pickingNew) && 'hidden lg:flex')}>
          {pickingNew
            ? <NewConvPicker agentId={agentId} onStart={handleStartNew} onClose={() => setPickingNew(false)} />
            : <ConvList agentId={agentId} selected={selected} onSelect={setSelected} onNew={() => setPickingNew(true)} />
          }
        </div>

        {/* Right panel — thread */}
        <div className={cn('flex-1 flex flex-col', !selected && !pickingNew && 'hidden lg:flex')}>
          {selected
            ? <ChatThread conv={selected} agentId={agentId} agentName={agentName} onBack={() => setSelected(null)} />
            : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <MessageCircle size={48} className="opacity-20" />
                <p className="text-sm font-medium">Select a conversation or start a new one</p>
              </div>
            )
          }
        </div>
      </div>
    </AgentLayout>
  );
}
