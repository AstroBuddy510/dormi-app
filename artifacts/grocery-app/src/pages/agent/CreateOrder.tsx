import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { AgentLayout } from "@/components/layout/AgentLayout";
import { useAuth } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Zap, CheckCircle, AlertCircle } from "lucide-react";
import { ItemsBuilder } from "@/components/ItemsBuilder";

import { authFetchArray } from "@/lib/authFetch";

const API = "/api";

const fetchResidents = () => authFetchArray(`${API}/residents`);
const fetchVendors = () => authFetchArray(`${API}/vendors`);

function OrderPreview({ rawItems }: { rawItems: string }) {
  const lines = rawItems.split("\n").filter(l => l.trim());
  if (lines.length === 0) return null;
  const parsed = lines.map(l => {
    const p = l.split(",");
    const qty = parseFloat(p[1]?.trim() ?? "1") || 1;
    const price = parseFloat(p[2]?.trim() ?? "0") || 0;
    return { name: p[0]?.trim() ?? "Item", qty, price, total: qty * price };
  });
  const subtotal = parsed.reduce((s, i) => s + i.total, 0);
  const serviceFee = subtotal * 0.18;
  const total = subtotal + serviceFee + 30;
  return (
    <div className="rounded-lg border bg-blue-50 p-3 text-sm space-y-1">
      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Order Summary</p>
      {parsed.map((i, idx) => (
        <div key={idx} className="flex justify-between">
          <span className="text-gray-600">{i.name} × {i.qty}</span>
          <span>₵{i.total.toFixed(2)}</span>
        </div>
      ))}
      <div className="border-t pt-1 mt-1 space-y-1">
        <div className="flex justify-between text-gray-500 text-xs"><span>Subtotal</span><span>₵{subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between text-gray-500 text-xs"><span>Service fee (18%)</span><span>₵{serviceFee.toFixed(2)}</span></div>
        <div className="flex justify-between text-gray-500 text-xs"><span>Delivery</span><span>₵30.00</span></div>
        <div className="flex justify-between font-semibold text-blue-700 text-base pt-1"><span>Estimated Total</span><span>₵{total.toFixed(2)}</span></div>
      </div>
    </div>
  );
}

export default function AgentCreateOrder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [location] = useLocation();

  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const presetResidentId = params.get("residentId") ?? "";

  const { data: residents = [] } = useQuery({ queryKey: ["residents"], queryFn: fetchResidents });
  const { data: vendors = [] } = useQuery({ queryKey: ["vendors"], queryFn: fetchVendors });
  const [residentId, setResidentId] = useState(presetResidentId);
  const [vendorId, setVendorId] = useState("");
  const [rawItems, setRawItems] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash_on_delivery");
  const [isUrgent, setIsUrgent] = useState(false);
  const [success, setSuccess] = useState<any>(null);
  const [resetKey, setResetKey] = useState(0);

  const selectedVendor = (vendors as any[]).find((v: any) => String(v.id) === vendorId);

  useEffect(() => {
    if (presetResidentId) setResidentId(presetResidentId);
  }, [presetResidentId]);

  const selectedResident = (residents as any[]).find((r: any) => String(r.id) === residentId);

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/admin/orders/single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId: parseInt(residentId),
          rawItems,
          notes,
          paymentMethod,
          isUrgent,
          agentId: user?.id,
          vendorId: vendorId || undefined,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).message);
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Order created!", description: `Order #${data.id} submitted successfully.` });
      qc.invalidateQueries({ queryKey: ["agent-stats"] });
      setSuccess(data);
      setRawItems("");
      setNotes("");
      setVendorId("");
      setResetKey(k => k + 1);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (success) {
    return (
      <AgentLayout>
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <CheckCircle className="w-9 h-9 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800">Order Submitted!</h2>
          <p className="text-gray-500">Order #{success.id} for <strong>{success.residentName}</strong> has been forwarded to the admin dashboard.</p>
          <div className="p-4 rounded-lg bg-gray-50 border text-left text-sm space-y-1">
            <div className="flex justify-between"><span className="text-gray-500">Status</span><Badge>{success.status}</Badge></div>
            <div className="flex justify-between"><span className="text-gray-500">ETA</span><span>{success.eta}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-semibold">₵{success.total?.toFixed(2)}</span></div>
          </div>
          <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => { setSuccess(null); }}>
            Create Another Order
          </Button>
        </div>
      </AgentLayout>
    );
  }

  return (
    <AgentLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Create Order</h1>
          <p className="text-gray-500 mt-1">Log an order on behalf of a resident after their call.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resident Details</CardTitle>
            <CardDescription>Select the resident who called in this order.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={residentId} onValueChange={setResidentId}>
              <SelectTrigger><SelectValue placeholder="Search and select resident..." /></SelectTrigger>
              <SelectContent>
                {(residents as any[]).map((r: any) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.fullName} — {r.phone} ({r.estate})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedResident && (
              <div className="p-3 rounded-lg border bg-blue-50 text-sm space-y-1">
                <p className="font-medium text-blue-800">{selectedResident.fullName}</p>
                <p className="text-blue-600">{selectedResident.estate}, Block {selectedResident.blockNumber}, House {selectedResident.houseNumber}</p>
                {selectedResident.ghanaGpsAddress && <p className="text-gray-500">Ghana GPS: {selectedResident.ghanaGpsAddress}</p>}
                {selectedResident.subscribeWeekly && <Badge className="bg-green-100 text-green-700 text-xs">Weekly Subscriber</Badge>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vendor & Items</CardTitle>
            <CardDescription>Select the vendor who will fulfil this order, then build the item list.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Vendor / Supplier *</Label>
              <Select value={vendorId} onValueChange={setVendorId}>
                <SelectTrigger><SelectValue placeholder="Select vendor" /></SelectTrigger>
                <SelectContent>
                  {(vendors as any[]).filter((v: any) => v.isActive).map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedVendor && (
                <p className="text-xs text-blue-700 font-medium">Order will appear on {selectedVendor.name}'s portal immediately after creation</p>
              )}
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border bg-orange-50">
              <Zap className="w-4 h-4 text-orange-500" />
              <div className="flex-1">
                <p className="text-sm font-medium text-orange-800">Mark as Urgent</p>
                <p className="text-xs text-orange-600">Resident needs this ASAP — ETA drops to 30-60 mins.</p>
              </div>
              <Switch checked={isUrgent} onCheckedChange={setIsUrgent} />
              {isUrgent && <Badge className="bg-red-100 text-red-700 text-xs">URGENT</Badge>}
            </div>

            <ItemsBuilder key={resetKey} onChange={setRawItems} color="blue" />

            {rawItems.trim() && <OrderPreview rawItems={rawItems} />}

            <div className="grid grid-cols-2 gap-3">
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
                <Label>Notes (optional)</Label>
                <Input
                  placeholder="Gate code, special instructions..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                />
              </div>
            </div>

            {!residentId && rawItems.trim() && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                Please select a resident before submitting.
              </div>
            )}

            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 h-11"
              disabled={!residentId || !vendorId || !rawItems.trim() || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Submitting..." : `Submit ${isUrgent ? "URGENT " : ""}Order to Admin`}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AgentLayout>
  );
}
