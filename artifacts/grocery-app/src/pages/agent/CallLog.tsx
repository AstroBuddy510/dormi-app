import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AgentLayout } from "@/components/layout/AgentLayout";
import { useAuth } from "@/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Phone, Plus, PhoneCall, CalendarClock, ListChecks,
  CheckCircle2, XCircle, Clock, PackagePlus, Trash2,
  Search, CheckCheck, PhoneOff, PhoneMissed, CalendarX,
} from "lucide-react";
import { format } from "date-fns";

import { authFetchArray } from "@/lib/authFetch";

const API = "/api";

const fetchResidents = () => authFetchArray(`${API}/residents`);
const fetchCallLogs = (agentId: number) => authFetchArray(`${API}/agents/${agentId}/call-logs`);
const fetchScheduledCalls = (agentId: number) => authFetchArray(`${API}/agents/${agentId}/scheduled-calls`);
const fetchTempList = (agentId: number) => authFetchArray(`${API}/agents/${agentId}/temp-list`);

const OUTCOME_META: Record<string, { label: string; color: string; Icon: any }> = {
  order_created:      { label: "Order Created",       color: "bg-green-100 text-green-700 border-green-200",  Icon: PackagePlus },
  callback_requested: { label: "Callback Requested",  color: "bg-blue-100 text-blue-700 border-blue-200",     Icon: CalendarClock },
  no_answer:          { label: "No Answer",            color: "bg-amber-100 text-amber-700 border-amber-200",  Icon: PhoneMissed },
  completed:          { label: "Completed",            color: "bg-gray-100 text-gray-600 border-gray-200",     Icon: CheckCircle2 },
  other:              { label: "Other",                color: "bg-purple-100 text-purple-700 border-purple-200", Icon: Phone },
};

type Tab = "log" | "scheduled" | "temp";

// ─── Resident Combobox ────────────────────────────────────────────────────────
function ResidentPicker({
  residents,
  value,
  onChange,
}: {
  residents: any[];
  value: any | null;
  onChange: (r: any | null) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = residents.filter(
    (r) =>
      r.fullName.toLowerCase().includes(q.toLowerCase()) ||
      r.phone.includes(q)
  );

  return (
    <div className="relative">
      <div
        className="flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer hover:bg-gray-50 text-sm"
        onClick={() => setOpen(true)}
      >
        <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        {value ? (
          <span className="font-medium text-gray-800 truncate">{value.fullName} · {value.phone}</span>
        ) : (
          <span className="text-gray-400">Search resident…</span>
        )}
      </div>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border rounded-xl shadow-xl">
          <div className="p-2 border-b">
            <Input
              autoFocus
              placeholder="Name or phone…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.slice(0, 20).map((r) => (
              <button
                key={r.id}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
                onClick={() => { onChange(r); setOpen(false); setQ(""); }}
              >
                <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                  {r.fullName.charAt(0)}
                </div>
                <div>
                  <p className="font-medium text-gray-800">{r.fullName}</p>
                  <p className="text-xs text-gray-400">{r.phone} · {r.estate}</p>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-center py-4 text-sm text-gray-400">No residents found</p>
            )}
          </div>
          <div className="p-2 border-t">
            <button
              type="button"
              className="w-full text-xs text-gray-400 hover:text-red-500 text-center"
              onClick={() => { onChange(null); setOpen(false); setQ(""); }}
            >
              Clear selection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Log Call Dialog ──────────────────────────────────────────────────────────
function LogCallDialog({
  open,
  onClose,
  residents,
  agentId,
  prefillResident,
}: {
  open: boolean;
  onClose: () => void;
  residents: any[];
  agentId: number;
  prefillResident?: any;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [resident, setResident] = useState<any | null>(prefillResident ?? null);
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [outcome, setOutcome] = useState("completed");
  const [notes, setNotes] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  useEffect(() => {
    if (open) {
      setResident(prefillResident ?? null);
      setManualName("");
      setManualPhone("");
      setUseManual(false);
      setOutcome("completed");
      setNotes("");
      setScheduledFor("");
    }
  }, [open, prefillResident]);

  const mutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`${API}/agents/${agentId}/call-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-call-logs", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agent-scheduled-calls", agentId] });
      toast({ title: "Call logged", description: outcome === "callback_requested" ? "Added to scheduled calls automatically." : "Call saved to log." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const residentName = useManual ? manualName.trim() : resident?.fullName ?? "";
    const residentPhone = useManual ? manualPhone.trim() : resident?.phone ?? "";
    if (!residentName || !residentPhone) {
      toast({ title: "Missing fields", description: "Please select or enter a resident.", variant: "destructive" });
      return;
    }
    if (!outcome) {
      toast({ title: "Missing outcome", description: "Please select call outcome.", variant: "destructive" });
      return;
    }
    mutation.mutate({
      residentId: !useManual && resident ? resident.id : null,
      residentName,
      residentPhone,
      outcome,
      notes: notes.trim() || null,
      scheduledFor: outcome === "callback_requested" && scheduledFor ? scheduledFor : null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-5 h-5 text-blue-600" /> Log a Call
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Resident</Label>
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline"
              onClick={() => setUseManual((p) => !p)}
            >
              {useManual ? "← Pick from list" : "Enter manually"}
            </button>
          </div>

          {useManual ? (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Input placeholder="Full name" value={manualName} onChange={(e) => setManualName(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <Input placeholder="Phone" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
          ) : (
            <ResidentPicker residents={residents} value={resident} onChange={setResident} />
          )}

          <div>
            <Label className="text-sm font-medium mb-1 block">Call Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="rounded-lg h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="completed">✅ Completed</SelectItem>
                <SelectItem value="order_created">🛒 Order Created</SelectItem>
                <SelectItem value="callback_requested">📅 Resident asked to call later</SelectItem>
                <SelectItem value="no_answer">📵 No Answer</SelectItem>
                <SelectItem value="other">💬 Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {outcome === "callback_requested" && (
            <div>
              <Label className="text-sm font-medium mb-1 block">
                <CalendarClock className="inline w-3.5 h-3.5 mr-1" />
                Preferred callback time (optional)
              </Label>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="h-9 text-sm"
              />
              <p className="text-xs text-blue-600 mt-1">This call will be added to Scheduled Calls automatically.</p>
            </div>
          )}

          <div>
            <Label className="text-sm font-medium mb-1 block">Notes (optional)</Label>
            <Textarea
              placeholder="What was discussed…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none text-sm"
              rows={2}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Log Call"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add to Temp List Dialog ──────────────────────────────────────────────────
function AddTempDialog({
  open,
  onClose,
  residents,
  agentId,
}: {
  open: boolean;
  onClose: () => void;
  residents: any[];
  agentId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resident, setResident] = useState<any | null>(null);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) { setResident(null); setNotes(""); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`${API}/agents/${agentId}/temp-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-temp-list", agentId] });
      toast({ title: "Added to list", description: `${resident?.fullName} added to your temp call list.` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!resident) {
      toast({ title: "Select a resident", variant: "destructive" });
      return;
    }
    mutation.mutate({
      residentId: resident.id,
      residentName: resident.fullName,
      residentPhone: resident.phone,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-blue-600" /> Add to Temp Call List
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-sm font-medium mb-1 block">Resident</Label>
            <ResidentPicker residents={residents} value={resident} onChange={setResident} />
          </div>
          <div>
            <Label className="text-sm font-medium mb-1 block">Note (optional)</Label>
            <Input
              placeholder="e.g. wants to order after 5pm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? "Adding…" : "Add to List"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Scheduled Call Dialog ────────────────────────────────────────────────
function AddScheduledDialog({
  open,
  onClose,
  residents,
  agentId,
}: {
  open: boolean;
  onClose: () => void;
  residents: any[];
  agentId: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [resident, setResident] = useState<any | null>(null);
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (open) { setResident(null); setScheduledFor(""); setNotes(""); }
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await fetch(`${API}/agents/${agentId}/scheduled-calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-scheduled-calls", agentId] });
      toast({ title: "Scheduled", description: "Call has been added to your schedule." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!resident) {
      toast({ title: "Select a resident", variant: "destructive" });
      return;
    }
    mutation.mutate({
      residentId: resident.id,
      residentName: resident.fullName,
      residentPhone: resident.phone,
      scheduledFor: scheduledFor || null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-blue-600" /> Schedule a Call
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label className="text-sm font-medium mb-1 block">Resident</Label>
            <ResidentPicker residents={residents} value={resident} onChange={setResident} />
          </div>
          <div>
            <Label className="text-sm font-medium mb-1 block">Callback time (optional)</Label>
            <Input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <Label className="text-sm font-medium mb-1 block">Notes (optional)</Label>
            <Input placeholder="What to discuss…" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 text-sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Schedule Call"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AgentCallLog() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const agentId = user?.id!;

  const [tab, setTab] = useState<Tab>("log");
  const [logSearch, setLogSearch] = useState("");
  const [showLogCall, setShowLogCall] = useState(false);
  const [showAddTemp, setShowAddTemp] = useState(false);
  const [showAddScheduled, setShowAddScheduled] = useState(false);

  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const { data: callLogs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["agent-call-logs", agentId],
    queryFn: () => fetchCallLogs(agentId),
    enabled: !!agentId,
    refetchInterval: 30000,
  });
  const { data: scheduledCalls = [], isLoading: loadingScheduled } = useQuery({
    queryKey: ["agent-scheduled-calls", agentId],
    queryFn: () => fetchScheduledCalls(agentId),
    enabled: !!agentId,
    refetchInterval: 30000,
  });
  const { data: tempList = [], isLoading: loadingTemp } = useQuery({
    queryKey: ["agent-temp-list", agentId],
    queryFn: () => fetchTempList(agentId),
    enabled: !!agentId,
    refetchInterval: 10000,
  });

  const markScheduledDone = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/agents/scheduled-calls/${id}/done`, { method: "PUT" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-scheduled-calls", agentId] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteScheduled = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/agents/scheduled-calls/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-scheduled-calls", agentId] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const markTempDone = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/agents/temp-list/${id}/done`, { method: "PUT" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-temp-list", agentId] });
      toast({ title: "Marked done", description: "Removed from your temp list." });
    },
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteTempItem = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/agents/temp-list/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-temp-list", agentId] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const deleteLog = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${API}/agents/${agentId}/call-logs/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-call-logs", agentId] }),
    onError: () => toast({ title: "Error", variant: "destructive" }),
  });

  const filteredLogs = (callLogs as any[]).filter(
    (l) =>
      !logSearch ||
      l.residentName.toLowerCase().includes(logSearch.toLowerCase()) ||
      l.residentPhone.includes(logSearch)
  );

  const pendingScheduled = (scheduledCalls as any[]).length;
  const activeTempItems = (tempList as any[]).length;

  const tabs = [
    { key: "log" as Tab,       label: "Call Log",         Icon: PhoneCall,    count: (callLogs as any[]).length },
    { key: "scheduled" as Tab, label: "Scheduled Calls",  Icon: CalendarClock, count: pendingScheduled },
    { key: "temp" as Tab,      label: "Temp List",         Icon: ListChecks,   count: activeTempItems },
  ];

  return (
    <AgentLayout>
      <div className="w-full space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Smart Call Centre</h1>
            <p className="text-gray-500 mt-0.5 text-sm">Track calls, schedule callbacks, and manage your call list</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              className="h-9 rounded-xl gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => setShowLogCall(true)}
            >
              <PhoneCall className="w-4 h-4" /> Log a Call
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => setShowAddScheduled(true)}
            >
              <CalendarClock className="w-4 h-4" /> Schedule Call
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 rounded-xl gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => setShowAddTemp(true)}
            >
              <Plus className="w-4 h-4" /> Add to Temp List
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-blue-100">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{(callLogs as any[]).length}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total Calls Logged</p>
            </CardContent>
          </Card>
          <Card className="border-amber-100">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{pendingScheduled}</p>
              <p className="text-xs text-gray-500 mt-0.5">Pending Callbacks</p>
            </CardContent>
          </Card>
          <Card className="border-green-100">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-green-700">
                {(callLogs as any[]).filter((l: any) => l.outcome === "order_created").length}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Orders from Calls</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <div className="bg-blue-50 rounded-xl p-1 flex gap-1">
          {tabs.map(({ key, label, Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === key
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-500 hover:text-blue-600"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{label}</span>
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                  tab === key ? "bg-blue-100 text-blue-700" : "bg-gray-200 text-gray-600"
                }`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Call Log ── */}
        {tab === "log" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Call History</CardTitle>
                <div className="relative w-60">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    placeholder="Search by name or phone…"
                    className="pl-9 h-8 text-sm"
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingLogs ? (
                <p className="py-10 text-center text-gray-400 text-sm">Loading…</p>
              ) : filteredLogs.length === 0 ? (
                <div className="py-12 text-center">
                  <PhoneOff className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">No calls logged yet. Use <strong>Log a Call</strong> above.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredLogs.map((log: any) => {
                    const meta = OUTCOME_META[log.outcome] ?? OUTCOME_META.other;
                    const OutcomeIcon = meta.Icon;
                    return (
                      <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl border border-border/50 hover:bg-gray-50 transition-colors">
                        <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                          {log.residentName.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-sm text-gray-800">{log.residentName}</p>
                              <p className="text-xs text-gray-400 font-mono">{log.residentPhone}</p>
                            </div>
                            <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${meta.color}`}>
                              <OutcomeIcon className="w-3 h-3" />
                              {meta.label}
                            </span>
                          </div>
                          {log.notes && <p className="text-xs text-gray-500 mt-1 italic">"{log.notes}"</p>}
                          {log.orderId && (
                            <p className="text-xs text-green-600 mt-0.5 flex items-center gap-1">
                              <PackagePlus className="w-3 h-3" /> Order #{log.orderId} created
                            </p>
                          )}
                          <p className="text-xs text-gray-300 mt-1">
                            {format(new Date(log.createdAt), "dd MMM yyyy, hh:mm a")}
                          </p>
                        </div>
                        <button
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors shrink-0"
                          onClick={() => deleteLog.mutate(log.id)}
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Tab: Scheduled Calls ── */}
        {tab === "scheduled" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Pending Callbacks</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => setShowAddScheduled(true)}
                >
                  <Plus className="w-3 h-3" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingScheduled ? (
                <p className="py-10 text-center text-gray-400 text-sm">Loading…</p>
              ) : (scheduledCalls as any[]).length === 0 ? (
                <div className="py-12 text-center">
                  <CalendarX className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">No pending callbacks. Great work!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(scheduledCalls as any[]).map((sc: any) => (
                    <div key={sc.id} className="flex items-start gap-3 p-3 rounded-xl border border-amber-100 bg-amber-50/40 hover:bg-amber-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center text-sm font-bold shrink-0 mt-0.5">
                        {sc.residentName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800">{sc.residentName}</p>
                        <a href={`tel:${sc.residentPhone}`} className="text-xs font-mono text-blue-600 hover:underline flex items-center gap-1">
                          <Phone className="w-3 h-3" />{sc.residentPhone}
                        </a>
                        {sc.scheduledFor && (
                          <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Callback: {format(new Date(sc.scheduledFor), "dd MMM yyyy, hh:mm a")}
                          </p>
                        )}
                        {sc.notes && <p className="text-xs text-gray-500 mt-0.5 italic">"{sc.notes}"</p>}
                        <p className="text-xs text-gray-300 mt-1">Added {format(new Date(sc.createdAt), "dd MMM, hh:mm a")}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                          onClick={() => markScheduledDone.mutate(sc.id)}
                          disabled={markScheduledDone.isPending}
                          title="Mark as called"
                        >
                          <CheckCheck className="w-3 h-3" /> Done
                        </Button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                          onClick={() => deleteScheduled.mutate(sc.id)}
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Tab: Temp Call List ── */}
        {tab === "temp" && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Temp Call List</CardTitle>
                  <p className="text-xs text-gray-400 mt-0.5">Items auto-drop when you mark them done</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                  onClick={() => setShowAddTemp(true)}
                >
                  <Plus className="w-3 h-3" /> Add Resident
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loadingTemp ? (
                <p className="py-10 text-center text-gray-400 text-sm">Loading…</p>
              ) : (tempList as any[]).length === 0 ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Your temp list is clear! Add residents you need to call.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(tempList as any[]).map((item: any) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-border/50 hover:bg-gray-50 transition-colors">
                      <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold shrink-0">
                        {item.residentName.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-800">{item.residentName}</p>
                        <a href={`tel:${item.residentPhone}`} className="text-xs font-mono text-blue-600 hover:underline flex items-center gap-1">
                          <Phone className="w-3 h-3" />{item.residentPhone}
                        </a>
                        {item.notes && <p className="text-xs text-gray-500 mt-0.5 italic">"{item.notes}"</p>}
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white rounded-xl px-3"
                          onClick={() => markTempDone.mutate(item.id)}
                          disabled={markTempDone.isPending}
                        >
                          <CheckCheck className="w-3.5 h-3.5" /> Call Made
                        </Button>
                        <button
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                          onClick={() => deleteTempItem.mutate(item.id)}
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <LogCallDialog
        open={showLogCall}
        onClose={() => setShowLogCall(false)}
        residents={residents as any[]}
        agentId={agentId}
      />
      <AddTempDialog
        open={showAddTemp}
        onClose={() => setShowAddTemp(false)}
        residents={residents as any[]}
        agentId={agentId}
      />
      <AddScheduledDialog
        open={showAddScheduled}
        onClose={() => setShowAddScheduled(false)}
        residents={residents as any[]}
        agentId={agentId}
      />
    </AgentLayout>
  );
}
