import { AdminSidebar } from '@/components/layout/AdminSidebar';
import {
  useListOrders,
  useListRiders,
  useAssignRider,
  useUpdateOrderStatus,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { Truck, User, MapPin, Package, Building2 } from 'lucide-react';
import { format } from 'date-fns';

interface DeliveryPartner { id: number; name: string; isActive: boolean; }

export default function AdminRiders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: orders = [], isLoading: ordersLoading } = useListOrders();
  const { data: riders = [], isLoading: ridersLoading } = useListRiders();
  const { data: deliveryPartners = [] } = useQuery<DeliveryPartner[]>({
    queryKey: ['/api/delivery-partners'],
    queryFn: () => fetch('/api/delivery-partners').then(r => r.json()),
  });
  const activePartners = deliveryPartners.filter(p => p.isActive);

  const assignRiderMutation = useAssignRider();
  const updateStatusMutation = useUpdateOrderStatus();
  const assignDeliveryPartnerMutation = useMutation({
    mutationFn: ({ orderId, partnerId }: { orderId: number; partnerId: number }) =>
      fetch(`/api/orders/${orderId}/assign-delivery-partner`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryPartnerId: partnerId }),
      }).then(r => r.json()),
    onSuccess: (_data, { orderId }) => {
      queryClient.invalidateQueries();
      toast({ title: 'Delivery Company Assigned', description: `Delivery company assigned to order #${orderId}` });
    },
  });

  const activeOrders = orders.filter((o) => !['delivered', 'cancelled'].includes(o.status));

  const inHouseUnassigned = activeOrders.filter(
    (o) => (o as any).orderType !== 'third_party' && !o.riderId
  );
  const thirdPartyOrders = activeOrders.filter(
    (o) => (o as any).orderType === 'third_party'
  );
  const inHouseAssigned = activeOrders.filter(
    (o) => (o as any).orderType !== 'third_party' && !!o.riderId
  );

  const handleAssign = (orderId: number, riderId: string) => {
    assignRiderMutation.mutate(
      { id: orderId, data: { riderId: parseInt(riderId) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          toast({ title: 'Rider Assigned', description: `Rider assigned to order #${orderId}` });
        },
      }
    );
  };

  const handleUpdateStatus = (orderId: number, status: string) => {
    updateStatusMutation.mutate(
      { id: orderId, data: { status: status as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          toast({ title: 'Status Updated', description: `Order #${orderId} → ${status}` });
        },
      }
    );
  };

  const riderOrders = riders.map((rider) => ({
    rider,
    assigned: orders.filter((o) => o.riderId === rider.id && !['delivered', 'cancelled'].includes(o.status)),
    completed: orders.filter((o) => o.riderId === rider.id && o.status === 'delivered').length,
  }));

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Assign Riders</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage rider assignments and track deliveries</p>
        </div>

        {/* Rider Overview Cards */}
        {!ridersLoading && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {riderOrders.map(({ rider, assigned, completed }) => (
              <Card key={rider.id} className="rounded-2xl shadow-sm border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-base">
                      {rider.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{rider.name}</p>
                      <p className="text-xs text-muted-foreground">{rider.phone}</p>
                    </div>
                    <span className={`ml-auto text-xs px-2 py-1 rounded-full font-medium ${rider.isAvailable ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {rider.isAvailable ? 'Available' : 'Busy'}
                    </span>
                  </div>
                  <div className="flex gap-4 text-center border-t border-border/50 pt-3">
                    <div className="flex-1">
                      <p className="text-lg font-bold text-amber-600">{assigned.length}</p>
                      <p className="text-xs text-muted-foreground">Active</p>
                    </div>
                    <div className="flex-1 border-l border-border/50">
                      <p className="text-lg font-bold text-green-600">{completed}</p>
                      <p className="text-xs text-muted-foreground">Delivered</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Unassigned In-House Orders */}
        <Card className="rounded-2xl shadow-sm border-border/50 mb-6">
          <CardHeader className="border-b border-border/50 bg-red-50/50 rounded-t-2xl">
            <CardTitle className="text-base text-red-700 flex items-center gap-2">
              <Package size={18} />
              Unassigned Orders
              <span className="ml-1 text-sm font-normal text-red-500">
                ({inHouseUnassigned.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {ordersLoading ? (
              <div className="py-8 text-center text-muted-foreground">Loading…</div>
            ) : inHouseUnassigned.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">All in-house orders have riders assigned ✓</div>
            ) : (
              <div className="divide-y divide-border/50">
                {inHouseUnassigned.map((order) => (
                  <div key={order.id} className="p-4 flex items-center gap-4 hover:bg-gray-50/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-primary">#{order.id}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="font-semibold text-sm">{order.residentName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin size={11} /> {order.residentAddress}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(order.createdAt), 'dd MMM, HH:mm')}</p>
                    </div>
                    <div className="shrink-0 w-40">
                      <Select onValueChange={(val) => handleAssign(order.id, val)}>
                        <SelectTrigger className="h-9 text-xs rounded-xl">
                          <SelectValue placeholder="Assign rider" />
                        </SelectTrigger>
                        <SelectContent>
                          {riders.map((r) => (
                            <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Third-Party Delivery Orders */}
        {thirdPartyOrders.length > 0 && (
          <Card className="rounded-2xl shadow-sm border-border/50 mb-6">
            <CardHeader className="border-b border-border/50 bg-blue-50/50 rounded-t-2xl">
              <CardTitle className="text-base text-blue-700 flex items-center gap-2">
                <Building2 size={18} />
                Third-Party Deliveries
                <span className="ml-1 text-sm font-normal text-blue-500">
                  ({thirdPartyOrders.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-border/50">
                {thirdPartyOrders.map((order) => {
                  const partnerName = (order as any).deliveryPartnerName as string | null;
                  const partnerId = (order as any).deliveryPartnerId as number | null;
                  return (
                    <div key={order.id} className="p-4 flex items-center gap-4 hover:bg-blue-50/30">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-primary">#{order.id}</span>
                          <StatusBadge status={order.status} />
                        </div>
                        <p className="font-semibold text-sm">{order.residentName}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin size={11} /> {order.residentAddress}
                        </p>
                        {partnerName && (
                          <p className="text-xs text-blue-600 font-medium flex items-center gap-1 mt-0.5">
                            <Building2 size={11} /> {partnerName}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(order.createdAt), 'dd MMM, HH:mm')}</p>
                      </div>
                      <div className="shrink-0 flex flex-col gap-2 items-end">
                        <Select
                          value={partnerId?.toString() ?? ''}
                          onValueChange={(val) =>
                            assignDeliveryPartnerMutation.mutate({ orderId: order.id, partnerId: parseInt(val) })
                          }
                        >
                          <SelectTrigger className="h-9 text-xs rounded-xl w-44 border-blue-200 bg-blue-50">
                            <SelectValue placeholder={partnerName ?? 'Assign delivery co.'} />
                          </SelectTrigger>
                          <SelectContent>
                            {activePartners.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {order.status === 'ready' && (
                          <Button
                            size="sm"
                            className="h-7 text-xs rounded-lg px-3 bg-blue-600 hover:bg-blue-700"
                            onClick={() => handleUpdateStatus(order.id, 'in_transit')}
                          >
                            Dispatch
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* All Active In-House Orders with Riders */}
        <Card className="rounded-2xl shadow-sm border-border/50">
          <CardHeader className="border-b border-border/50 bg-white rounded-t-2xl">
            <CardTitle className="text-base flex items-center gap-2">
              <Truck size={18} className="text-primary" />
              Active Deliveries
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({inHouseAssigned.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {inHouseAssigned.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No active in-house deliveries in progress</div>
            ) : (
              <div className="divide-y divide-border/50">
                {inHouseAssigned.map((order) => (
                  <div key={order.id} className="p-4 flex items-center gap-4 hover:bg-gray-50/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-medium text-primary">#{order.id}</span>
                        <StatusBadge status={order.status} />
                      </div>
                      <p className="font-semibold text-sm">{order.residentName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin size={11} /> {order.residentAddress}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User size={11} className="text-primary" />
                        <span className="font-medium text-foreground">{order.riderName}</span>
                      </p>
                    </div>
                    <div className="shrink-0 flex flex-col gap-2 items-end">
                      <Select
                        value={order.riderId?.toString() ?? ''}
                        onValueChange={(val) => handleAssign(order.id, val)}
                      >
                        <SelectTrigger className="h-8 text-xs rounded-xl w-36">
                          <SelectValue placeholder="Change rider" />
                        </SelectTrigger>
                        <SelectContent>
                          {riders.map((r) => (
                            <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {order.status === 'ready' && (
                        <Button
                          size="sm"
                          className="h-7 text-xs rounded-lg px-3"
                          onClick={() => handleUpdateStatus(order.id, 'in_transit')}
                        >
                          Dispatch
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
