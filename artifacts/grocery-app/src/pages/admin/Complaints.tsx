import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { MessageSquareWarning, Clock, CheckCircle, AlertTriangle, ChevronDown, Filter, Search } from "lucide-react";

const API = "/api";

async function fetchComplaints() {
  const r = await fetch(`${API}/complaints`);
  return r.json();
}

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

export default function AdminComplaints() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [resolveId, setResolveId] = useState<number | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [newStatus, setNewStatus] = useState("resolved");
  const [filterStatus, setFilterStatus] = useState("all");
  const [search, setSearch] = useState("");

  const { data: complaints = [], isLoading } = useQuery({ queryKey: ["complaints"], queryFn: fetchComplaints });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: number; status: string; notes: string }) => {
      const r = await fetch(`${API}/complaints/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, adminNotes: notes }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Complaint updated!" });
      qc.invalidateQueries({ queryKey: ["complaints"] });
      setResolveId(null);
      setAdminNotes("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = (complaints as any[]).filter(c => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchSearch = !search || c.subject.toLowerCase().includes(search.toLowerCase()) ||
      c.agentName?.toLowerCase().includes(search.toLowerCase()) ||
      c.residentName?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const counts = {
    open: (complaints as any[]).filter(c => c.status === "open").length,
    in_review: (complaints as any[]).filter(c => c.status === "in_review").length,
    resolved: (complaints as any[]).filter(c => c.status === "resolved").length,
    total: (complaints as any[]).length,
  };

  const resolveComplaint = (id: number) => {
    const c = (complaints as any[]).find(c => c.id === id);
    setAdminNotes(c?.adminNotes ?? "");
    setNewStatus("resolved");
    setResolveId(id);
  };

  return (
    <AdminLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Complaints</h1>
          <p className="text-gray-500 mt-1">Complaints forwarded by call center agents. Review, respond, and resolve.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total", value: counts.total, icon: MessageSquareWarning, color: "blue" },
            { label: "Open", value: counts.open, icon: Clock, color: counts.open > 0 ? "orange" : "gray" },
            { label: "In Review", value: counts.in_review, icon: AlertTriangle, color: "blue" },
            { label: "Resolved", value: counts.resolved, icon: CheckCircle, color: "green" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${s.color}-100`}>
                  <s.icon className={`w-5 h-5 text-${s.color}-600`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <Input placeholder="Search by subject, agent, or resident..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36 gap-1"><Filter className="w-4 h-4" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_review">In Review</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading complaints...</div>
        ) : filtered.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <MessageSquareWarning className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">{filterStatus === "all" ? "No complaints have been filed yet." : `No ${filterStatus} complaints.`}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {(filtered as any[]).map((c: any) => (
              <Card key={c.id} className={c.status === "open" ? "border-orange-200" : ""}>
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-800">#{c.id} — {c.subject}</span>
                        <Badge className={`text-xs ${PRIORITY_STYLES[c.priority] ?? ""}`}>{c.priority}</Badge>
                        <Badge className={`text-xs ${STATUS_STYLES[c.status] ?? ""}`}>{c.status.replace("_", " ")}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Agent: <span className="font-medium">{c.agentName}</span>
                        {c.residentName && <> · Resident: <span className="font-medium">{c.residentName}</span></>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(c.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.status === "open" && (
                        <Button
                          size="sm"
                          className="h-7 text-xs bg-green-600 hover:bg-green-700"
                          onClick={e => { e.stopPropagation(); resolveComplaint(c.id); }}
                        >
                          Respond
                        </Button>
                      )}
                      <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded === c.id ? "rotate-180" : ""}`} />
                    </div>
                  </div>
                </div>
                {expanded === c.id && (
                  <div className="px-4 pb-4 border-t bg-gray-50 space-y-3">
                    <div className="pt-3">
                      <p className="text-xs font-medium text-gray-500 mb-1">Description from agent</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.description}</p>
                    </div>
                    {c.adminNotes && (
                      <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                        <p className="text-xs font-medium text-green-700 mb-1">Your Response</p>
                        <p className="text-sm text-green-800">{c.adminNotes}</p>
                      </div>
                    )}
                    {c.status !== "resolved" && c.status !== "closed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => resolveComplaint(c.id)}
                      >
                        {c.adminNotes ? "Update Response" : "Add Response"}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {resolveId !== null && (
        <Dialog open onOpenChange={() => setResolveId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Respond to Complaint #{resolveId}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Update Status</Label>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Response / Admin Notes</Label>
                <Textarea
                  placeholder="Describe what action was taken or what the agent should know..."
                  rows={4}
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setResolveId(null)}>Cancel</Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ id: resolveId, status: newStatus, notes: adminNotes })}
              >
                {resolveMutation.isPending ? "Saving..." : "Save Response"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
