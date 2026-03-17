import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import {
  useCreateCallLogOrder,
  useListResidents,
  useListOrders,
  useUpdateOrderStatus,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { PhoneCall, Plus, CheckCheck } from 'lucide-react';
import { format } from 'date-fns';

export default function AdminCallLog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedResident, setSelectedResident] = useState('');
  const [rawItems, setRawItems] = useState('');
  const [notes, setNotes] = useState('');

  const { data: residents = [] } = useListResidents();
  const { data: callOnlyOrders = [], isLoading } = useListOrders({ callOnly: true });

  const createMutation = useCreateCallLogOrder();
  const updateStatusMutation = useUpdateOrderStatus();

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResident || !rawItems.trim()) {
      toast({ title: 'Missing fields', description: 'Please select a resident and enter items.', variant: 'destructive' });
      return;
    }
    createMutation.mutate(
      { data: { residentId: parseInt(selectedResident), rawItems, notes: notes || undefined } },
      {
        onSuccess: () => {
          toast({ title: 'Order Created', description: 'Call-only order has been placed successfully.' });
          setSelectedResident('');
          setRawItems('');
          setNotes('');
          queryClient.invalidateQueries();
        },
        onError: (err: any) => {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        },
      }
    );
  };

  const handleAccept = (orderId: number) => {
    updateStatusMutation.mutate(
      { id: orderId, data: { status: 'accepted', callAccepted: true } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          toast({ title: 'Marked Accepted', description: `Order #${orderId} marked as called & accepted.` });
        },
      }
    );
  };

  const resident = residents.find((r) => r.id.toString() === selectedResident);

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Call Log</h1>
          <p className="text-muted-foreground mt-1 text-sm">Create orders on behalf of residents via phone call</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-8">
          {/* Create Order Form */}
          <div className="lg:col-span-2">
            <Card className="rounded-2xl shadow-sm border-border/50 sticky top-6">
              <CardHeader className="border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-primary/10 text-primary rounded-lg">
                    <PhoneCall size={18} />
                  </div>
                  <div>
                    <CardTitle className="text-base">New Call Order</CardTitle>
                    <CardDescription className="text-xs">Log a phone-in order manually</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={handleCreateOrder} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="resident">Select Resident *</Label>
                    <Select value={selectedResident} onValueChange={setSelectedResident}>
                      <SelectTrigger id="resident" className="h-11 rounded-xl">
                        <SelectValue placeholder="Choose resident…" />
                      </SelectTrigger>
                      <SelectContent>
                        {residents.map((r) => (
                          <SelectItem key={r.id} value={r.id.toString()}>
                            <div>
                              <span className="font-medium">{r.fullName}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{r.phone}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {resident && (
                      <p className="text-xs text-muted-foreground pl-1">
                        📍 {resident.estate}, Block {resident.blockNumber}, House {resident.houseNumber}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="items">Items & Quantities *</Label>
                    <Textarea
                      id="items"
                      placeholder={`One item per line:\nTomatoes, 2, 8.00\nRice 5kg, 1, 95.00\nEggs, 1, 24.00`}
                      className="min-h-[140px] rounded-xl text-sm font-mono"
                      value={rawItems}
                      onChange={(e) => setRawItems(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Format: Item Name, Quantity, Unit Price</p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      placeholder="Special instructions or delivery notes…"
                      className="min-h-[70px] rounded-xl text-sm"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl font-bold gap-2"
                    disabled={createMutation.isPending}
                  >
                    <Plus size={18} />
                    {createMutation.isPending ? 'Creating…' : 'Create Call Order'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Call-Only Orders List */}
          <div className="lg:col-span-3">
            <Card className="rounded-2xl shadow-sm border-border/50">
              <CardHeader className="border-b border-border/50">
                <CardTitle className="text-base">
                  Call-Only Orders
                  <span className="ml-2 text-sm font-normal text-muted-foreground">({callOnlyOrders.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="py-12 text-center text-muted-foreground">Loading…</div>
                ) : callOnlyOrders.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <PhoneCall size={32} className="mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No call-only orders yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/50">
                    {callOnlyOrders.map((order) => (
                      <div key={order.id} className="p-4 hover:bg-gray-50/50">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-primary">#{order.id}</span>
                              <StatusBadge status={order.status} />
                              {order.callAccepted && (
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                  ✓ Called & Accepted
                                </span>
                              )}
                            </div>
                            <p className="font-semibold text-sm">{order.residentName}</p>
                            <p className="text-xs text-muted-foreground">{order.residentPhone} · {order.residentAddress}</p>
                            <div className="mt-2 space-y-0.5">
                              {Array.isArray(order.items) && order.items.map((item: any, i: number) => (
                                <p key={i} className="text-xs text-foreground">
                                  {item.itemName} × {item.quantity} — ₵{item.totalPrice?.toFixed(2)}
                                </p>
                              ))}
                            </div>
                            <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                              <span>Subtotal: ₵{order.subtotal.toFixed(2)}</span>
                              <span>Fee: ₵{order.serviceFee.toFixed(2)}</span>
                              <span>Delivery: ₵{order.deliveryFee.toFixed(2)}</span>
                              <span className="font-bold text-foreground">Total: ₵{order.total.toFixed(2)}</span>
                            </div>
                            {order.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{order.notes}"</p>}
                            <p className="text-xs text-muted-foreground mt-1">{format(new Date(order.createdAt), 'dd MMM yyyy, HH:mm')}</p>
                          </div>
                          <div className="shrink-0">
                            {!order.callAccepted && order.status === 'pending' && (
                              <Button
                                size="sm"
                                className="h-8 text-xs rounded-lg gap-1 bg-green-600 hover:bg-green-700"
                                onClick={() => handleAccept(order.id)}
                                disabled={updateStatusMutation.isPending}
                              >
                                <CheckCheck size={14} />
                                Called & Accepted
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
