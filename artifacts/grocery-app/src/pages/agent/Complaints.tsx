import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AgentLayout } from "@/components/layout/AgentLayout";
import { useAuth } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, MessageSquareWarning, Clock, CheckCircle, AlertTriangle, ChevronDown } from "lucide-react";

import { authFetchArray } from "@/lib/authFetch";

const API = "/api";

const fetchResidents = () => authFetchArray(`${API}/residents`);
const fetchComplaints = (agentId: number) => authFetchArray(`${API}/complaints?agentId=${agentId}`);

const PRIORITY_STYLES: Record<string, string> = {
  low: "bg-gray-100 text-gray-600",
  normal: "bg-blue-100 text-blue-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};
const STATUS_STYLES: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-700",
  in_review: "bg-blue-100 text-blue-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-gray-100 text-gray-600",
};

export default function AgentComplaints() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);

  const [form, setForm] = useState({
    residentId: "",
    residentName: "",
    residentPhone: "",
    subject: "",
    description: "",
    priority: "normal",
  });

  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ["my-complaints", user?.id],
    queryFn: () => fetchComplaints(user!.id),
    enabled: !!user,
  });

  const set = (k: keyof typeof form) => (v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const onResidentChange = (id: string) => {
    if (id === "none") {
      setForm(prev => ({ ...prev, residentId: "", residentName: "", residentPhone: "" }));
      return;
    }
    const r = (residents as any[]).find((r: any) => String(r.id) === id);
    setForm(prev => ({ ...prev, residentId: id, residentName: r?.fullName ?? "", residentPhone: r?.phone ?? "" }));
  };

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/complaints`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: user?.id,
          residentId: form.residentId ? parseInt(form.residentId) : null,
          residentName: form.residentName || null,
          residentPhone: form.residentPhone || null,
          subject: form.subject,
          description: form.description,
          priority: form.priority,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Complaint forwarded to admin!" });
      qc.invalidateQueries({ queryKey: ["my-complaints"] });
      setShowForm(false);
      setForm({ residentId: "", residentName: "", residentPhone: "", subject: "", description: "", priority: "normal" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const openCount = (complaints as any[]).filter((c: any) => c.status === "open").length;

  return (
    <AgentLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Complaints</h1>
            <p className="text-gray-500 mt-1">Log resident issues and forward them to the admin team.</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700 gap-2" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Log Complaint
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Filed", value: (complaints as any[]).length, icon: MessageSquareWarning, color: "blue" },
            { label: "Open", value: openCount, icon: Clock, color: openCount > 0 ? "orange" : "gray" },
            { label: "Resolved", value: (complaints as any[]).filter((c: any) => c.status === "resolved").length, icon: CheckCircle, color: "green" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-3 flex items-center gap-2">
                <div className={`p-1.5 rounded-lg bg-${s.color}-100`}>
                  <s.icon className={`w-4 h-4 text-${s.color}-600`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading complaints...</div>
        ) : (complaints as any[]).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <MessageSquareWarning className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No complaints logged yet.</p>
              <p className="text-sm text-gray-400 mt-1">Use "Log Complaint" when a resident reports an issue.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(complaints as any[]).map((c: any) => (
              <Card key={c.id} className="overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">{c.subject}</span>
                        <Badge className={`text-xs ${PRIORITY_STYLES[c.priority] ?? "bg-gray-100"}`}>{c.priority}</Badge>
                        <Badge className={`text-xs ${STATUS_STYLES[c.status] ?? "bg-gray-100"}`}>{c.status.replace("_", " ")}</Badge>
                      </div>
                      {c.residentName && <p className="text-xs text-gray-500 mt-0.5">Resident: {c.residentName} · {c.residentPhone}</p>}
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(c.createdAt).toLocaleString()}</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform shrink-0 ${expanded === c.id ? "rotate-180" : ""}`} />
                  </div>
                </div>
                {expanded === c.id && (
                  <div className="px-4 pb-4 space-y-3 border-t bg-gray-50">
                    <div className="pt-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Description</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.description}</p>
                    </div>
                    {c.adminNotes && (
                      <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                        <p className="text-xs font-medium text-green-700 mb-1">Admin Response</p>
                        <p className="text-sm text-green-800">{c.adminNotes}</p>
                      </div>
                    )}
                    {c.status === "open" && !c.adminNotes && (
                      <p className="text-xs text-gray-400 italic">Awaiting admin review...</p>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
              Log New Complaint
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Resident (optional)</Label>
              <Select value={form.residentId} onValueChange={onResidentChange}>
                <SelectTrigger><SelectValue placeholder="Select if complaint is about a resident" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific resident</SelectItem>
                  {(residents as any[]).map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>{r.fullName} — {r.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input placeholder="e.g. Wrong items delivered" value={form.subject} onChange={e => set("subject")(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={set("priority")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description *</Label>
              <Textarea
                placeholder="Describe the issue in detail. What happened? What did the resident say?"
                rows={4}
                value={form.description}
                onChange={e => set("description")(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700"
                disabled={!form.subject || !form.description || submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                {submitMutation.isPending ? "Forwarding..." : "Forward to Admin"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AgentLayout>
  );
}
