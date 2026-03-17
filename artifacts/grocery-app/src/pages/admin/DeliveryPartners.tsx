import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Truck, TrendingUp, Phone, Mail, MapPin, Edit, Trash2, BarChart3, CheckCircle, XCircle } from "lucide-react";

const BASE = "";

async function fetchPartners() {
  const r = await fetch(`${BASE}/api/delivery-partners`);
  return r.json();
}
async function fetchReport(id: number) {
  const r = await fetch(`${BASE}/api/delivery-partners/${id}/report`);
  return r.json();
}

const EMPTY_FORM = { name: "", contactPerson: "", phone: "", email: "", address: "", commissionPercent: "10" };

function PartnerForm({ initial = EMPTY_FORM, onSave, onCancel, saving }: { initial?: typeof EMPTY_FORM; onSave: (d: typeof EMPTY_FORM) => void; onCancel: () => void; saving: boolean }) {
  const [form, setForm] = useState(initial);
  const set = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(prev => ({ ...prev, [k]: e.target.value }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2">
          <Label>Company Name *</Label>
          <Input value={form.name} onChange={set("name")} placeholder="e.g. Swift Couriers Ghana" />
        </div>
        <div className="space-y-1">
          <Label>Contact Person *</Label>
          <Input value={form.contactPerson} onChange={set("contactPerson")} placeholder="Full name" />
        </div>
        <div className="space-y-1">
          <Label>Phone *</Label>
          <Input value={form.phone} onChange={set("phone")} placeholder="024XXXXXXX" />
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input value={form.email} onChange={set("email")} placeholder="partner@company.com" />
        </div>
        <div className="space-y-1">
          <Label>Commission Rate (%)</Label>
          <Input type="number" min="0" max="100" value={form.commissionPercent} onChange={set("commissionPercent")} placeholder="10" />
        </div>
        <div className="space-y-1 col-span-2">
          <Label>Address</Label>
          <Input value={form.address} onChange={set("address")} placeholder="Company address" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          className="bg-green-600 hover:bg-green-700"
          onClick={() => onSave(form)}
          disabled={!form.name || !form.contactPerson || !form.phone || saving}
        >
          {saving ? "Saving..." : "Save Partner"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ReportDialog({ partnerId, onClose }: { partnerId: number; onClose: () => void }) {
  const { data: report, isLoading } = useQuery({ queryKey: ["partner-report", partnerId], queryFn: () => fetchReport(partnerId) });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-purple-600" />
            Commission Report — {report?.partner?.name ?? "Loading..."}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center text-gray-400">Loading report...</div>
        ) : report ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Orders", value: report.totalOrders, color: "blue" },
                { label: "Delivered", value: report.deliveredOrders, color: "green" },
                { label: "Pending/In Progress", value: report.pendingOrders + report.inProgressOrders, color: "yellow" },
                { label: "Commission Rate", value: `${report.commissionRate}%`, color: "purple" },
              ].map(s => (
                <div key={s.label} className={`rounded-lg p-3 bg-${s.color}-50 border border-${s.color}-100`}>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-xl font-bold text-${s.color}-700`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-4 bg-gray-50 border">
                <p className="text-xs text-gray-500">Total Revenue (delivered orders)</p>
                <p className="text-2xl font-bold text-gray-800">₵{report.totalRevenue.toFixed(2)}</p>
              </div>
              <div className="rounded-lg p-4 bg-green-50 border border-green-200">
                <p className="text-xs text-gray-500">Commission Owed to GrocerEase</p>
                <p className="text-2xl font-bold text-green-700">₵{report.commissionOwed.toFixed(2)}</p>
                <p className="text-xs text-gray-400 mt-1">{report.commissionRate}% of ₵{report.totalRevenue.toFixed(2)}</p>
              </div>
            </div>

            {report.orders.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Order Breakdown</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-gray-500">#</th>
                        <th className="text-left px-3 py-2 text-gray-500">Status</th>
                        <th className="text-right px-3 py-2 text-gray-500">Order Total</th>
                        <th className="text-right px-3 py-2 text-gray-500">Commission</th>
                        <th className="text-left px-3 py-2 text-gray-500">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(report.orders as any[]).map((o: any) => (
                        <tr key={o.id} className="border-t hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500">#{o.id}</td>
                          <td className="px-3 py-2">
                            <Badge variant="outline" className={o.status === "delivered" ? "text-green-600 border-green-200" : "text-gray-500"}>
                              {o.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-right">₵{o.total.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-green-700 font-medium">₵{o.commissionAmount.toFixed(2)}</td>
                          <td className="px-3 py-2 text-gray-400 text-xs">{new Date(o.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function DeliveryPartners() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: partners = [], isLoading } = useQuery({ queryKey: ["delivery-partners"], queryFn: fetchPartners });
  const [showAdd, setShowAdd] = useState(false);
  const [editPartner, setEditPartner] = useState<any>(null);
  const [reportPartnerId, setReportPartnerId] = useState<number | null>(null);

  const createMutation = useMutation({
    mutationFn: async (data: typeof EMPTY_FORM) => {
      const r = await fetch(`${BASE}/api/delivery-partners`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { toast({ title: "Partner registered!" }); qc.invalidateQueries({ queryKey: ["delivery-partners"] }); setShowAdd(false); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof EMPTY_FORM }) => {
      const r = await fetch(`${BASE}/api/delivery-partners/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { toast({ title: "Partner updated!" }); qc.invalidateQueries({ queryKey: ["delivery-partners"] }); setEditPartner(null); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const r = await fetch(`${BASE}/api/delivery-partners/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delivery-partners"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/delivery-partners/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => { toast({ title: "Partner removed" }); qc.invalidateQueries({ queryKey: ["delivery-partners"] }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const activeCount = (partners as any[]).filter((p: any) => p.isActive).length;
  const totalDeliveries = (partners as any[]).reduce((s: number, p: any) => s + p.totalDeliveries, 0);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Delivery Partners</h1>
            <p className="text-gray-500 mt-1">Manage external delivery companies and view commission reports.</p>
          </div>
          <Button className="bg-green-600 hover:bg-green-700 gap-2" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4" /> Register Partner
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "Total Partners", value: (partners as any[]).length, icon: Truck, color: "blue" },
            { label: "Active Partners", value: activeCount, icon: CheckCircle, color: "green" },
            { label: "Total Deliveries", value: totalDeliveries, icon: TrendingUp, color: "purple" },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-${s.color}-100`}>
                  <s.icon className={`w-5 h-5 text-${s.color}-600`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{s.label}</p>
                  <p className="text-2xl font-bold text-gray-800">{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading partners...</div>
        ) : (partners as any[]).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <Truck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No delivery partners registered yet.</p>
              <p className="text-sm text-gray-400 mt-1">Click "Register Partner" to add your first external delivery company.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(partners as any[]).map((p: any) => (
              <Card key={p.id} className={!p.isActive ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {p.name}
                        {p.isActive
                          ? <Badge className="bg-green-100 text-green-700 text-xs">Active</Badge>
                          : <Badge variant="outline" className="text-gray-500 text-xs">Suspended</Badge>}
                      </CardTitle>
                      <CardDescription className="mt-0.5">{p.commissionPercent}% commission · {p.totalDeliveries} deliveries</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <div className="text-sm space-y-1">
                    <div className="flex items-center gap-2 text-gray-600"><Phone className="w-3.5 h-3.5" /> {p.contactPerson} · {p.phone}</div>
                    {p.email && <div className="flex items-center gap-2 text-gray-600"><Mail className="w-3.5 h-3.5" /> {p.email}</div>}
                    {p.address && <div className="flex items-center gap-2 text-gray-600"><MapPin className="w-3.5 h-3.5" /> {p.address}</div>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setReportPartnerId(p.id)}>
                      <BarChart3 className="w-3.5 h-3.5" /> Report
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => setEditPartner(p)}>
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className={`gap-1 h-7 text-xs ${p.isActive ? "text-orange-600 border-orange-200" : "text-green-600 border-green-200"}`}
                      onClick={() => toggleMutation.mutate({ id: p.id, isActive: !p.isActive })}
                    >
                      {p.isActive ? <><XCircle className="w-3.5 h-3.5" /> Suspend</> : <><CheckCircle className="w-3.5 h-3.5" /> Activate</>}
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="gap-1 h-7 text-xs text-red-500 hover:text-red-700"
                      onClick={() => { if (confirm(`Remove ${p.name}?`)) deleteMutation.mutate(p.id); }}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Register Delivery Partner</DialogTitle></DialogHeader>
          <PartnerForm onSave={d => createMutation.mutate(d)} onCancel={() => setShowAdd(false)} saving={createMutation.isPending} />
        </DialogContent>
      </Dialog>

      {editPartner && (
        <Dialog open onOpenChange={() => setEditPartner(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Edit Partner — {editPartner.name}</DialogTitle></DialogHeader>
            <PartnerForm
              initial={{ name: editPartner.name, contactPerson: editPartner.contactPerson, phone: editPartner.phone, email: editPartner.email ?? "", address: editPartner.address ?? "", commissionPercent: String(editPartner.commissionPercent) }}
              onSave={d => updateMutation.mutate({ id: editPartner.id, data: d })}
              onCancel={() => setEditPartner(null)}
              saving={updateMutation.isPending}
            />
          </DialogContent>
        </Dialog>
      )}

      {reportPartnerId !== null && (
        <ReportDialog partnerId={reportPartnerId} onClose={() => setReportPartnerId(null)} />
      )}
    </AdminLayout>
  );
}
