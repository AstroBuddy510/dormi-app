import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Zap, Building2, Truck, Plus, Trash2, AlertCircle } from "lucide-react";
import { ItemsBuilder } from "@/components/ItemsBuilder";

const BASE = "";

async function fetchResidents() {
  const r = await fetch(`${BASE}/api/residents`);
  return r.json();
}
async function fetchDeliveryPartners() {
  const r = await fetch(`${BASE}/api/delivery-partners`);
  return r.json();
}

function OrderSummaryBox({ rawItems, deliveryFee = 30, markupPct = 18 }: { rawItems: string; deliveryFee?: number; markupPct?: number }) {
  const lines = rawItems.split("\n").filter(l => l.trim());
  const parsed = lines.map(l => {
    const p = l.split(",");
    const qty = parseFloat(p[1]?.trim() ?? "1") || 1;
    const price = parseFloat(p[2]?.trim() ?? "0") || 0;
    return { name: p[0]?.trim() ?? "Item", qty, price, total: qty * price };
  });
  const subtotal = parsed.reduce((s, i) => s + i.total, 0);
  const serviceFee = subtotal * markupPct / 100;
  const total = subtotal + serviceFee + deliveryFee;
  if (parsed.length === 0) return null;
  return (
    <div className="rounded-lg border bg-green-50 p-3 text-sm space-y-1">
      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Order Summary</p>
      {parsed.map((i, idx) => (
        <div key={idx} className="flex justify-between">
          <span className="text-gray-600">{i.name} × {i.qty}</span>
          <span>₵{i.total.toFixed(2)}</span>
        </div>
      ))}
      <div className="border-t pt-1 mt-1 space-y-1">
        <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>₵{subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Service fee ({markupPct}%)</span><span>₵{serviceFee.toFixed(2)}</span></div>
        <div className="flex justify-between text-gray-500"><span>Delivery</span><span>₵{deliveryFee.toFixed(2)}</span></div>
        <div className="flex justify-between font-semibold text-green-700 text-base pt-1"><span>Total</span><span>₵{total.toFixed(2)}</span></div>
      </div>
    </div>
  );
}

function SingleOrderTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const [residentId, setResidentId] = useState("");
  const [rawItems, setRawItems] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [isUrgent, setIsUrgent] = useState(true);
  const [resetKey, setResetKey] = useState(0);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/admin/orders/single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId: parseInt(residentId), rawItems, notes, paymentMethod, isUrgent }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Single order created!", description: isUrgent ? "Marked URGENT — 30-60 min ETA" : "ETA: 2-3 hours" });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setResidentId(""); setRawItems(""); setNotes("");
      setResetKey(k => k + 1);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200">
        <AlertCircle className="w-4 h-4 text-orange-600 shrink-0" />
        <p className="text-sm text-orange-700">Single orders are for individual residents who need items delivered urgently. One driver handles one household.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Resident *</Label>
          <Select value={residentId} onValueChange={setResidentId}>
            <SelectTrigger><SelectValue placeholder="Select resident" /></SelectTrigger>
            <SelectContent>
              {(residents as any[]).map((r: any) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.fullName} — {r.estate}, {r.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Payment Method</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
              <SelectItem value="mobile_money">Mobile Money</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-3 p-3 rounded-lg border bg-red-50">
        <Zap className="w-4 h-4 text-red-600" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">Mark as Urgent (ASAP)</p>
          <p className="text-xs text-red-600">ETA drops to 30-60 minutes. Use when resident called in an emergency order.</p>
        </div>
        <Switch checked={isUrgent} onCheckedChange={setIsUrgent} />
        {isUrgent && <Badge className="bg-red-100 text-red-700">URGENT</Badge>}
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Items & Quantities *</Label>
        <ItemsBuilder key={resetKey} onChange={setRawItems} color="green" />
      </div>

      {rawItems.trim() && <OrderSummaryBox rawItems={rawItems} />}

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Input placeholder="Special instructions, gate code, etc." value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <Button
        className="w-full bg-green-600 hover:bg-green-700"
        disabled={!residentId || !rawItems.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Creating..." : `Create ${isUrgent ? "URGENT " : ""}Single Order`}
      </Button>
    </div>
  );
}

interface BlockOrderEntry {
  _eid: number;
  residentId: string;
  rawItems: string;
  notes: string;
}

function BlockOrderTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const [estate, setEstate] = useState("");
  const [groupName, setGroupName] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [groupNotes, setGroupNotes] = useState("");
  const [entries, setEntries] = useState<BlockOrderEntry[]>([{ _eid: Date.now(), residentId: "", rawItems: "", notes: "" }]);
  const [resetKey, setResetKey] = useState(0);

  const addEntry = () => setEntries(prev => [...prev, { _eid: Date.now(), residentId: "", rawItems: "", notes: "" }]);
  const removeEntry = (eid: number) => setEntries(prev => prev.filter(e => e._eid !== eid));
  const updateEntry = (eid: number, field: keyof Omit<BlockOrderEntry, '_eid'>, val: string) =>
    setEntries(prev => prev.map(e => e._eid === eid ? { ...e, [field]: val } : e));

  const mutation = useMutation({
    mutationFn: async () => {
      const orders = entries.map(e => ({ residentId: parseInt(e.residentId), rawItems: e.rawItems, notes: e.notes, paymentMethod: "cash_on_delivery" }));
      const r = await fetch(`${BASE}/api/admin/orders/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estate, groupName, scheduledDate, notes: groupNotes, orders }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Block order created!", description: `${data.ordersCreated} orders grouped for ${estate}` });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setEstate(""); setGroupName("");
      setEntries([{ _eid: Date.now(), residentId: "", rawItems: "", notes: "" }]);
      setResetKey(k => k + 1);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const valid = estate.trim() && entries.every(e => e.residentId && e.rawItems.trim());

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
        <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
        <p className="text-sm text-blue-700">Block orders batch all residents from one estate into a single driver run. One driver, one estate, all deliveries in sequence.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Estate / Area *</Label>
          <Input placeholder="e.g. Oyarifa Housing Project" value={estate} onChange={e => setEstate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Group Name (auto-generated if empty)</Label>
          <Input placeholder="e.g. Oyarifa — 17 Mar 2026" value={groupName} onChange={e => setGroupName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Scheduled Delivery Date (optional)</Label>
          <Input type="datetime-local" value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Group Notes</Label>
          <Input placeholder="Any notes for this batch" value={groupNotes} onChange={e => setGroupNotes(e.target.value)} />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Resident Orders ({entries.length})</Label>
          <Button variant="outline" size="sm" onClick={addEntry} className="gap-1">
            <Plus className="w-4 h-4" /> Add Resident
          </Button>
        </div>

        {entries.map((entry, i) => (
          <Card key={entry._eid} className="border-dashed">
            <CardHeader className="pb-3 pt-4 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Resident #{i + 1}</CardTitle>
                {entries.length > 1 && (
                  <Button variant="ghost" size="sm" className="text-red-500 h-7 w-7 p-0" onClick={() => removeEntry(entry._eid)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-3">
              <Select value={entry.residentId} onValueChange={v => updateEntry(entry._eid, "residentId", v)}>
                <SelectTrigger><SelectValue placeholder="Select resident" /></SelectTrigger>
                <SelectContent>
                  {(residents as any[]).map((r: any) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.fullName} — {r.estate}, {r.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-gray-600">Items & Quantities</Label>
                <ItemsBuilder
                  key={`${entry._eid}-${resetKey}`}
                  onChange={v => updateEntry(entry._eid, "rawItems", v)}
                  color="green"
                />
              </div>

              {entry.rawItems.trim() && <OrderSummaryBox rawItems={entry.rawItems} />}
              <Input placeholder="Notes for this resident (optional)" value={entry.notes} onChange={e => updateEntry(entry._eid, "notes", e.target.value)} />
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        className="w-full bg-green-600 hover:bg-green-700"
        disabled={!valid || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Creating..." : `Create Block Order (${entries.length} resident${entries.length !== 1 ? "s" : ""})`}
      </Button>
    </div>
  );
}

function ThirdPartyTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const { data: partners = [] } = useQuery({ queryKey: ["delivery-partners"], queryFn: fetchDeliveryPartners });
  const [residentId, setResidentId] = useState("");
  const [deliveryPartnerId, setDeliveryPartnerId] = useState("");
  const [rawItems, setRawItems] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [resetKey, setResetKey] = useState(0);

  const selectedPartner = (partners as any[]).find((p: any) => String(p.id) === deliveryPartnerId);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/admin/orders/third-party`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ residentId: parseInt(residentId), deliveryPartnerId: parseInt(deliveryPartnerId), rawItems, notes, paymentMethod }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Third-party order created!", description: `Assigned to ${selectedPartner?.name}` });
      qc.invalidateQueries({ queryKey: ["orders"] });
      setResidentId(""); setDeliveryPartnerId(""); setRawItems(""); setNotes("");
      setResetKey(k => k + 1);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-50 border border-purple-200">
        <Truck className="w-4 h-4 text-purple-600 shrink-0" />
        <p className="text-sm text-purple-700">Third-party orders are packaged by us but delivered by a registered external partner. A commission is charged on the order value.</p>
      </div>

      {(partners as any[]).length === 0 && (
        <div className="p-4 rounded-lg border border-yellow-200 bg-yellow-50 text-sm text-yellow-800">
          No delivery partners registered yet. Go to <strong>Delivery Partners</strong> in the sidebar to add one first.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Resident *</Label>
          <Select value={residentId} onValueChange={setResidentId}>
            <SelectTrigger><SelectValue placeholder="Select resident" /></SelectTrigger>
            <SelectContent>
              {(residents as any[]).map((r: any) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.fullName} — {r.estate}, {r.phone}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Delivery Partner *</Label>
          <Select value={deliveryPartnerId} onValueChange={setDeliveryPartnerId}>
            <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
            <SelectContent>
              {(partners as any[]).filter((p: any) => p.isActive).map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name} ({p.commissionPercent}% commission)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedPartner && (
        <div className="p-3 rounded-lg border bg-purple-50 text-sm space-y-1">
          <p className="font-medium text-purple-800">{selectedPartner.name}</p>
          <p className="text-purple-600">Contact: {selectedPartner.contactPerson} · {selectedPartner.phone}</p>
          <p className="text-purple-600">Commission: {selectedPartner.commissionPercent}% of order total</p>
          <p className="text-purple-600">Total deliveries handled: {selectedPartner.totalDeliveries}</p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Payment Method</Label>
        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cash_on_delivery">Cash on Delivery</SelectItem>
            <SelectItem value="mobile_money">Mobile Money</SelectItem>
            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Items & Quantities *</Label>
        <ItemsBuilder key={resetKey} onChange={setRawItems} color="green" />
      </div>

      {rawItems.trim() && <OrderSummaryBox rawItems={rawItems} />}

      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Input placeholder="Delivery instructions for the partner" value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <Button
        className="w-full bg-green-600 hover:bg-green-700"
        disabled={!residentId || !deliveryPartnerId || !rawItems.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? "Creating..." : "Create Third-Party Order"}
      </Button>
    </div>
  );
}

export default function CreateOrder() {
  return (
    <AdminLayout>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Order</h1>
          <p className="text-gray-500 mt-1">Choose the order type that matches the customer's situation.</p>
        </div>

        <Tabs defaultValue="single" className="w-full">
          <TabsList className="grid grid-cols-3 w-full mb-6">
            <TabsTrigger value="single" className="gap-1.5">
              <Zap className="w-4 h-4" /> Single
            </TabsTrigger>
            <TabsTrigger value="block" className="gap-1.5">
              <Building2 className="w-4 h-4" /> Block
            </TabsTrigger>
            <TabsTrigger value="third-party" className="gap-1.5">
              <Truck className="w-4 h-4" /> Third-Party
            </TabsTrigger>
          </TabsList>

          <TabsContent value="single">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Zap className="w-5 h-5 text-orange-500" /> Single Order</CardTitle>
                <CardDescription>An individual resident's order — can be marked urgent for ASAP delivery.</CardDescription>
              </CardHeader>
              <CardContent><SingleOrderTab /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="block">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="w-5 h-5 text-blue-500" /> Block Order</CardTitle>
                <CardDescription>Group orders from an entire estate — one driver dispatched to fulfil all households in sequence.</CardDescription>
              </CardHeader>
              <CardContent><BlockOrderTab /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="third-party">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Truck className="w-5 h-5 text-purple-500" /> Third-Party Delivery</CardTitle>
                <CardDescription>Order is packed by us, but delivery is outsourced to a registered external partner who pays us a commission.</CardDescription>
              </CardHeader>
              <CardContent><ThirdPartyTab /></CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
