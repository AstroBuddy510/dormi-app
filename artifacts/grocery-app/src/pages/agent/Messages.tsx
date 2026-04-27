import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AgentLayout } from '@/components/layout/AgentLayout';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Send, MessageCircle, ChevronLeft, Phone, Users, ShieldAlert,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import EmojiPickerButton from '@/components/EmojiPickerButton';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function authHeader(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem('grocerease-auth');
    if (!raw) return {};
    const t = JSON.parse(raw)?.state?.token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${BASE}/api${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...authHeader(), ...(opts?.headers ?? {}) },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body?.message ?? body?.error ?? 'Request failed');
  }
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
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-white shrink-0">
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-muted-foreground transition-colors">
          <ChevronLeft size={18} />
        </button>
        <p className="font-semibold text-sm">New Message</p>
      </div>
      <div className="px-3 py-2 border-b border-border shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resident by name or phone…"
            className="pl-8 h-9 text-sm rounded-xl"
            autoFocus
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No residents found</p>
        )}
        {filtered.map((r: any) => (
          <button
            key={r.id}
            onClick={() => onStart(r)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition-colors text-left border-b border-border/30"
          >
            <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
              {r.fullName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{r.fullName}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone size={10} /> {r.phone}
                {r.estate && <span className="ml-1 text-blue-500">· {r.estate}</span>}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Escalate-to-Complaint Dialog ─────────────────────────────────────────────
function EscalateDialog({
  open, onOpenChange, conv, agentId, messages,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conv: any;
  agentId: number;
  messages: any[];
}) {
  const { toast } = useToast();
  const lastResidentMsg = [...(messages ?? [])].reverse().find((m: any) => m.senderRole === 'resident');
  const defaultSubject = lastResidentMsg
    ? lastResidentMsg.content.slice(0, 80).replace(/\n+/g, ' ')
    : `Escalated chat with ${conv?.residentName ?? 'resident'}`;
  const [subject, setSubject] = useState(defaultSubject);
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [extra, setExtra] = useState('');

  // Reset whenever a different conversation is opened
  useEffect(() => {
    setSubject(defaultSubject);
    setPriority('normal');
    setExtra('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.residentId, open]);

  const escalate = useMutation({
    mutationFn: async () => {
      // Build a transcript so the admin sees the full context inside the
      // complaint description.
      const transcript = (messages ?? []).map((m: any) => {
        const who = m.senderRole === 'resident' ? (conv.residentName ?? 'Resident') : (m.senderName ?? 'Agent');
        const ts = format(parseISO(m.createdAt), 'dd MMM yyyy, HH:mm');
        return `[${ts}] ${who}: ${m.content}`;
      }).join('\n');
      const description = (extra ? `${extra}\n\n— Conversation transcript —\n` : '— Conversation transcript —\n') + transcript;

      const res = await fetch(`${BASE}/api/complaints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          residentId: conv.residentId,
          residentName: conv.residentName,
          residentPhone: conv.residentPhone,
          subject,
          description,
          priority,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message ?? 'Failed to escalate');
      return body;
    },
    onSuccess: () => {
      toast({ title: 'Escalated to admin', description: 'Admin will see this in their Complaints tab.' });
      onOpenChange(false);
    },
    onError: (err: any) => toast({ title: 'Escalation failed', description: err.message, variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Escalate to Complaints
          </DialogTitle>
          <DialogDescription>
            Pushes this chat to the admin Complaints tab with the full transcript attached.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Subject</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} className="rounded-xl" />
          </div>
          <div>
            <Label className="text-xs">Priority</Label>
            <Select value={priority} onValueChange={v => setPriority(v as any)}>
              <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Note for admin (optional)</Label>
            <textarea
              value={extra}
              onChange={e => setExtra(e.target.value)}
              rows={3}
              placeholder="Anything the transcript doesn't capture…"
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            The full chat transcript ({(messages ?? []).length} messages) will be appended to the complaint.
          </p>
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={() => onOpenChange(false)} disabled={escalate.isPending}>Cancel</Button>
          <Button
            className="flex-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white"
            disabled={!subject.trim() || escalate.isPending}
            onClick={() => escalate.mutate()}
          >
            {escalate.isPending ? 'Escalating…' : 'Escalate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Chat Thread ──────────────────────────────────────────────────────────────
function ChatThread({ conv, agentId, agentName, onBack }: { conv: any; agentId: number; agentName: string; onBack: () => void }) {
  const [text, setText] = useState('');
  const [escalateOpen, setEscalateOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: messages = [] } = useQuery<any[]>({
    queryKey: ['agent-messages', conv.residentId, agentId],
    queryFn: () => apiFetch(`/agent-messages?residentId=${conv.residentId}&agentId=${agentId}`),
    refetchInterval: 5000,
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
    unread.forEach(m => fetch(`${BASE}/api/agent-messages/${m.id}/read`, { method: 'PUT' }));
    if (unread.length > 0) setTimeout(() => qc.invalidateQueries({ queryKey: ['agent-conversations', agentId] }), 500);
  }, [messages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // Auto-grow textarea — clamp to 40px floor so it matches Send button (h-10).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(40, Math.min(el.scrollHeight, 120)) + 'px';
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
      {/* Thread header */}
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-border bg-white shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-muted-foreground transition-colors lg:hidden"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-sm">
          {conv.residentName?.charAt(0) ?? '?'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">{conv.residentName}</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone size={10} /> {conv.residentPhone}
          </p>
        </div>
        <a href={`tel:${conv.residentPhone}`} className="hidden sm:flex">
          <Button size="sm" variant="outline" className="h-8 rounded-xl text-xs gap-1.5 text-green-600 border-green-200 hover:bg-green-50">
            <Phone size={12} /> Call
          </Button>
        </a>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setEscalateOpen(true)}
          className="h-8 rounded-xl text-xs gap-1.5 text-amber-700 border-amber-200 hover:bg-amber-50"
          title="Escalate this conversation to the admin Complaints tab"
        >
          <ShieldAlert size={12} /> Escalate
        </Button>
      </div>
      <EscalateDialog
        open={escalateOpen}
        onOpenChange={setEscalateOpen}
        conv={conv}
        agentId={agentId}
        messages={messages as any[]}
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-6 py-4 space-y-2.5 bg-gray-50/60">
        {(messages as any[]).length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 py-16">
            <MessageCircle size={36} className="opacity-20" />
            <p className="text-sm">No messages yet. Say hello! 👋</p>
          </div>
        )}
        {(messages as any[]).map((msg: any) => {
          const isAgent = msg.senderRole === 'agent';
          return (
            <div key={msg.id} className={cn('flex', isAgent ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm',
                isAgent
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-white text-gray-800 border border-border rounded-bl-sm',
              )}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={cn('text-[10px] mt-1 text-right', isAgent ? 'text-blue-200' : 'text-muted-foreground')}>
                  {formatTime(msg.createdAt)}
                  {isAgent && msg.readAt && <span className="ml-1">· seen</span>}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="px-4 md:px-5 py-3 border-t border-border bg-white shrink-0">
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message… (Shift+Enter for new line)"
              rows={1}
              disabled={sendMutation.isPending}
              className="block w-full resize-none rounded-xl border border-input bg-background pl-3 pr-10 py-2 text-sm leading-5 ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
              style={{ overflow: 'hidden', height: '40px', minHeight: '40px', maxHeight: '120px' }}
            />
            <EmojiPickerButton
              onEmojiSelect={insertEmoji}
              className="absolute right-2 bottom-2"
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={!text.trim() || sendMutation.isPending}
            className="rounded-xl h-10 w-10 p-0 bg-blue-600 hover:bg-blue-700 shrink-0 shadow-sm transition-all active:scale-95"
          >
            <Send size={15} />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">Enter to send · Shift+Enter for new line</p>
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
    refetchInterval: 6000,
  });

  const filtered = (convs as any[]).filter(c =>
    !search || c.residentName?.toLowerCase().includes(search.toLowerCase()) || c.residentPhone?.includes(search)
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <p className="font-bold text-base text-gray-900">Messages</p>
          <Button
            size="sm"
            onClick={onNew}
            className="h-8 rounded-xl bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs px-3 shadow-sm"
          >
            <Users size={12} /> New
          </Button>
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations…"
            className="pl-8 h-9 text-sm rounded-xl"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <MessageCircle size={36} className="opacity-20" />
            <p className="text-sm">No conversations yet</p>
            <button
              onClick={onNew}
              className="text-xs text-blue-600 font-medium hover:underline mt-1"
            >
              Start one →
            </button>
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
                'w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-blue-50/60 transition-colors border-b border-border/40',
                isSelected && 'bg-blue-50 border-l-[3px] border-l-blue-500',
              )}
            >
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                  {conv.residentName?.charAt(0) ?? '?'}
                </div>
                {conv.unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center shadow-sm">
                    {conv.unread > 9 ? '9+' : conv.unread}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('text-sm truncate', conv.unread > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800')}>
                    {conv.residentName}
                  </p>
                  {latest && <p className="text-[10px] text-muted-foreground shrink-0">{formatTime(latest.createdAt)}</p>}
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
    <AgentLayout fullHeight>
      <div className="flex-1 min-h-0 flex overflow-hidden rounded-2xl border border-border shadow-sm bg-white">
        {/* Left panel — conversations list */}
        <div className={cn(
          'w-full md:w-72 lg:w-80 xl:w-96 shrink-0 flex flex-col border-r border-border',
          (selected || pickingNew) && 'hidden md:flex',
        )}>
          {pickingNew
            ? <NewConvPicker agentId={agentId} onStart={handleStartNew} onClose={() => setPickingNew(false)} />
            : <ConvList agentId={agentId} selected={selected} onSelect={setSelected} onNew={() => setPickingNew(true)} />
          }
        </div>

        {/* Right panel — thread or empty state */}
        <div className={cn(
          'flex-1 min-w-0 flex flex-col',
          !selected && !pickingNew && 'hidden md:flex',
        )}>
          {selected
            ? <ChatThread conv={selected} agentId={agentId} agentName={agentName} onBack={() => setSelected(null)} />
            : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3 bg-gray-50/40">
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center">
                  <MessageCircle size={32} className="text-blue-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">Select a conversation</p>
                <p className="text-xs text-muted-foreground">or start a new one with a resident</p>
                <Button
                  size="sm"
                  onClick={() => setPickingNew(true)}
                  className="mt-2 rounded-xl bg-blue-600 hover:bg-blue-700 gap-1.5 text-xs px-4"
                >
                  <Users size={13} /> New Message
                </Button>
              </div>
            )
          }
        </div>
      </div>
    </AgentLayout>
  );
}
