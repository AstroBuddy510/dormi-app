import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AgentLayout } from "@/components/layout/AgentLayout";
import { useAuth } from "@/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  Search, Phone, MapPin, Home, PackagePlus, MessageSquareWarning,
  Users, PhoneCall, CalendarClock, Plus, ListChecks,
} from "lucide-react";

const API = "/api";

async function fetchResidents() {
  const r = await fetch(`${API}/residents`);
  return r.json();
}
async function fetchAgentStats(agentId: number) {
  const r = await fetch(`${API}/agents/${agentId}/orders`);
  return r.json();
}
async function fetchComplaints(agentId: number) {
  const r = await fetch(`${API}/complaints?agentId=${agentId}`);
  return r.json();
}
async function fetchScheduledCalls(agentId: number) {
  const r = await fetch(`${API}/agents/${agentId}/scheduled-calls`);
  return r.json();
}
async function fetchTempList(agentId: number) {
  const r = await fetch(`${API}/agents/${agentId}/temp-list`);
  return r.json();
}

// ─── Inline Quick Log Dialog ──────────────────────────────────────────────────
function QuickLogDialog({
  resident,
  agentId,
  onClose,
}: {
  resident: any;
  agentId: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState("completed");
  const [notes, setNotes] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

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
      toast({
        title: "Call logged",
        description: outcome === "callback_requested"
          ? "Added to your scheduled calls automatically."
          : "Call saved to log.",
      });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    mutation.mutate({
      residentId: resident.id,
      residentName: resident.fullName,
      residentPhone: resident.phone,
      outcome,
      notes: notes.trim() || null,
      scheduledFor: outcome === "callback_requested" && scheduledFor ? scheduledFor : null,
    });
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <PhoneCall className="w-4 h-4 text-blue-600" />
            Log call — {resident.fullName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
            <Phone className="w-3 h-3 text-blue-500" />
            <span className="font-mono">{resident.phone}</span>
            <span className="mx-1">·</span>
            <Home className="w-3 h-3 text-blue-500" />
            <span>{resident.estate}</span>
          </div>

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
                Callback time (optional)
              </Label>
              <Input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="h-9 text-sm"
              />
              <p className="text-xs text-blue-600 mt-1">Will be added to Scheduled Calls automatically.</p>
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

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl h-9" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button className="flex-1 rounded-xl h-9 bg-blue-600 hover:bg-blue-700" onClick={handleSubmit} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save Log"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add to Temp List Dialog ──────────────────────────────────────────────────
function AddTempDialog({
  resident,
  agentId,
  onClose,
}: {
  resident: any;
  agentId: number;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");

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
      toast({ title: "Added to temp list", description: `${resident.fullName} added to your call list.` });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ListChecks className="w-4 h-4 text-blue-600" />
            Add to Temp List — {resident.fullName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-blue-50 rounded-lg px-3 py-2">
            <Phone className="w-3 h-3 text-blue-500" />
            <span className="font-mono">{resident.phone}</span>
          </div>
          <div>
            <Label className="text-sm font-medium mb-1 block">Note (optional)</Label>
            <Input
              placeholder="e.g. call after 5pm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 rounded-xl h-9" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
            <Button className="flex-1 rounded-xl h-9 bg-blue-600 hover:bg-blue-700"
              onClick={() => mutation.mutate({ residentId: resident.id, residentName: resident.fullName, residentPhone: resident.phone, notes: notes.trim() || null })}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Adding…" : "Add to List"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function AgentDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [quickLogResident, setQuickLogResident] = useState<any | null>(null);
  const [addTempResident, setAddTempResident] = useState<any | null>(null);
  const agentId = user?.id!;

  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const { data: stats } = useQuery({ queryKey: ["agent-stats", agentId], queryFn: () => fetchAgentStats(agentId), enabled: !!agentId });
  const { data: complaints = [] } = useQuery({ queryKey: ["my-complaints", agentId], queryFn: () => fetchComplaints(agentId), enabled: !!agentId });
  const { data: scheduledCalls = [] } = useQuery({
    queryKey: ["agent-scheduled-calls", agentId],
    queryFn: () => fetchScheduledCalls(agentId),
    enabled: !!agentId,
    refetchInterval: 30000,
  });
  const { data: tempList = [] } = useQuery({
    queryKey: ["agent-temp-list", agentId],
    queryFn: () => fetchTempList(agentId),
    enabled: !!agentId,
    refetchInterval: 30000,
  });

  const filtered = (residents as any[]).filter((r: any) =>
    !search || r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    r.phone.includes(search) || r.estate?.toLowerCase().includes(search.toLowerCase())
  );

  const openComplaints = (complaints as any[]).filter((c: any) => c.status === "open").length;
  const pendingCallbacks = (scheduledCalls as any[]).length;
  const tempListCount = (tempList as any[]).length;

  return (
    <AgentLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Good day, {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-gray-500 mt-1">Call Center Dashboard — Dormi</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="border-blue-100 bg-blue-50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <PackagePlus className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Orders Created</p>
                <p className="text-xl font-bold text-blue-700">{stats?.count ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-100 bg-green-50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Users className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Residents</p>
                <p className="text-xl font-bold text-green-700">{(residents as any[]).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={pendingCallbacks > 0 ? "border-amber-100 bg-amber-50" : "border-gray-100"}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${pendingCallbacks > 0 ? "bg-amber-100" : "bg-gray-100"}`}>
                <CalendarClock className={`w-4 h-4 ${pendingCallbacks > 0 ? "text-amber-600" : "text-gray-400"}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Callbacks</p>
                <p className={`text-xl font-bold ${pendingCallbacks > 0 ? "text-amber-700" : "text-gray-700"}`}>{pendingCallbacks}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={openComplaints > 0 ? "border-red-100 bg-red-50" : "border-gray-100"}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${openComplaints > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                <MessageSquareWarning className={`w-4 h-4 ${openComplaints > 0 ? "text-red-600" : "text-gray-400"}`} />
              </div>
              <div>
                <p className="text-xs text-gray-500">Open Issues</p>
                <p className={`text-xl font-bold ${openComplaints > 0 ? "text-red-700" : "text-gray-700"}`}>{openComplaints}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick-action banners */}
        {(pendingCallbacks > 0 || tempListCount > 0) && (
          <div className="flex flex-wrap gap-2">
            {pendingCallbacks > 0 && (
              <button
                onClick={() => setLocation("/call-log?tab=scheduled")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors"
              >
                <CalendarClock className="w-4 h-4" />
                {pendingCallbacks} pending callback{pendingCallbacks > 1 ? "s" : ""} waiting
              </button>
            )}
            {tempListCount > 0 && (
              <button
                onClick={() => setLocation("/call-log?tab=temp")}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-100 transition-colors"
              >
                <ListChecks className="w-4 h-4" />
                {tempListCount} resident{tempListCount > 1 ? "s" : ""} on your temp list
              </button>
            )}
          </div>
        )}

        {/* Resident Call List */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Resident Call List</CardTitle>
              <span className="text-sm text-gray-400">{filtered.length} residents</span>
            </div>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name, phone, or estate..."
                className="pl-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {filtered.length === 0 ? (
              <p className="text-center py-8 text-gray-400">No residents match your search.</p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-0.5">
                {(filtered as any[]).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                      {r.fullName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate">{r.fullName}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>
                        <span className="flex items-center gap-1"><Home className="w-3 h-3" />{r.estate}</span>
                        {r.subscribeWeekly && <Badge className="bg-green-100 text-green-700 text-xs px-1.5 py-0 border-0">Weekly</Badge>}
                      </div>
                      {r.ghanaGpsAddress && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{r.ghanaGpsAddress}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0 flex-wrap justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                        onClick={() => setLocation(`/create-order?residentId=${r.id}`)}
                      >
                        <PackagePlus className="w-3 h-3" /> Order
                      </Button>
                      <a href={`tel:${r.phone}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1 text-green-600 border-green-200 hover:bg-green-50">
                          <Phone className="w-3 h-3" /> Call
                        </Button>
                      </a>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 text-violet-600 border-violet-200 hover:bg-violet-50"
                        onClick={() => setQuickLogResident(r)}
                        title="Log this call"
                      >
                        <PhoneCall className="w-3 h-3" /> Log
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1 text-gray-500 border-gray-200 hover:bg-gray-50"
                        onClick={() => setAddTempResident(r)}
                        title="Add to temp call list"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {quickLogResident && (
        <QuickLogDialog
          resident={quickLogResident}
          agentId={agentId}
          onClose={() => setQuickLogResident(null)}
        />
      )}
      {addTempResident && (
        <AddTempDialog
          resident={addTempResident}
          agentId={agentId}
          onClose={() => setAddTempResident(null)}
        />
      )}
    </AgentLayout>
  );
}
