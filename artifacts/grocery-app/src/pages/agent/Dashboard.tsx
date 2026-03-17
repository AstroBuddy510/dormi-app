import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AgentLayout } from "@/components/layout/AgentLayout";
import { useAuth } from "@/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { Search, Phone, MapPin, Home, PackagePlus, MessageSquareWarning, Users } from "lucide-react";

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

export default function AgentDashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");

  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const { data: stats } = useQuery({ queryKey: ["agent-stats", user?.id], queryFn: () => fetchAgentStats(user!.id), enabled: !!user });
  const { data: complaints = [] } = useQuery({ queryKey: ["my-complaints", user?.id], queryFn: () => fetchComplaints(user!.id), enabled: !!user });

  const filtered = (residents as any[]).filter((r: any) =>
    !search || r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    r.phone.includes(search) || r.estate?.toLowerCase().includes(search.toLowerCase())
  );

  const openComplaints = (complaints as any[]).filter((c: any) => c.status === "open").length;

  return (
    <AgentLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Good day, {user?.name?.split(" ")[0]} 👋</h1>
          <p className="text-gray-500 mt-1">Call Center Dashboard — GrocerEase Accra</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-blue-100 bg-blue-50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <PackagePlus className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Orders Created</p>
                <p className="text-2xl font-bold text-blue-700">{stats?.count ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-100 bg-green-50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <Users className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Residents on File</p>
                <p className="text-2xl font-bold text-green-700">{(residents as any[]).length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={openComplaints > 0 ? "border-red-100 bg-red-50" : "border-gray-100"}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${openComplaints > 0 ? "bg-red-100" : "bg-gray-100"}`}>
                <MessageSquareWarning className={`w-5 h-5 ${openComplaints > 0 ? "text-red-600" : "text-gray-400"}`} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Open Complaints</p>
                <p className={`text-2xl font-bold ${openComplaints > 0 ? "text-red-700" : "text-gray-700"}`}>{openComplaints}</p>
              </div>
            </CardContent>
          </Card>
        </div>

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
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {(filtered as any[]).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-gray-50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                      {r.fullName.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-gray-800 truncate">{r.fullName}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</span>
                        <span className="flex items-center gap-1"><Home className="w-3 h-3" />{r.estate}</span>
                        {r.subscribeWeekly && <Badge className="bg-green-100 text-green-700 text-xs px-1.5 py-0">Weekly</Badge>}
                      </div>
                      {r.ghanaGpsAddress && (
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{r.ghanaGpsAddress}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 shrink-0">
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
  );
}
