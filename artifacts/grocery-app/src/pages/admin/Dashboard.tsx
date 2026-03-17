import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import {
  useGetAdminStats,
  useListOrders,
  useUpdateOrderStatus,
  useAssignRider,
  useListRiders,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Activity, ShoppingCart, Users, DollarSign, RefreshCcw, CheckCircle, Package } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

type StatusFilter = 'all' | 'pending' | 'in_progress' | 'delivered';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<StatusFilter>('all');

  const { data: stats } = useGetAdminStats();
  const { data: allOrders = [], isLoading: ordersLoading } = useListOrders();
  const { data: riders = [] } = useListRiders();

  const updateStatusMutation = useUpdateOrderStatus();
  const assignRiderMutation = useAssignRider();

  const refresh = () => {
    queryClient.invalidateQueries();
  };

  const filteredOrders = allOrders.filter((o) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return o.status === 'pending';
    if (filter === 'in_progress') return ['accepted', 'ready', 'in_transit'].includes(o.status);
    if (filter === 'delivered') return o.status === 'delivered';
    return true;
  });

  const handleStatusUpdate = (orderId: number, newStatus: string) => {
    updateStatusMutation.mutate(
      { id: orderId, data: { status: newStatus as any } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries();
          toast({ title: 'Order Updated', description: `Order #${orderId} status changed to ${newStatus}` });
        },
      }
    );
  };

  const handleAssignRider = (orderId: number, riderId: string) => {
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

  const statCards = [
    { title: 'Total Orders', value: stats?.totalOrders ?? 0, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { title: 'Pending', value: stats?.pendingOrders ?? 0, icon: Activity, color: 'text-red-600 bg-red-50' },
    { title: 'In Progress', value: stats?.inProgressOrders ?? 0, icon: Package, color: 'text-amber-600 bg-amber-50' },
    { title: 'Delivered', value: stats?.deliveredOrders ?? 0, icon: CheckCircle, color: 'text-green-600 bg-green-50' },
    { title: 'Subscribers', value: stats?.subscriberCount ?? 0, icon: Users, color: 'text-purple-600 bg-purple-50' },
    { title: 'Revenue', value: `₵${(stats?.totalRevenue ?? 0).toFixed(2)}`, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
  ];

  const filterTabs: { label: string; value: StatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Pending', value: 'pending' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Delivered', value: 'delivered' },
  ];

  const nextStatus: Record<string, string | null> = {
    pending: 'accepted',
    accepted: 'ready',
    ready: 'in_transit',
    in_transit: 'delivered',
    delivered: null,
    cancelled: null,
  };

  const nextStatusLabel: Record<string, string> = {
    pending: 'Accept',
    accepted: 'Mark Ready',
    ready: 'In Transit',
    in_transit: 'Delivered',
  };

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Live Orders Dashboard</h1>
            <p className="text-muted-foreground mt-1 text-sm">Real-time overview of all orders</p>
          </div>
          <Button variant="outline" onClick={refresh} className="rounded-xl border-border gap-2">
            <RefreshCcw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          {statCards.map(({ title, value, icon: Icon, color }) => (
            <Card key={title} className="rounded-2xl shadow-sm border-border/50">
              <CardContent className="p-4 flex flex-col gap-2">
                <div className={`p-2 rounded-lg w-fit ${color}`}>
                  <Icon size={18} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{title}</p>
                  <p className="text-xl font-bold text-foreground">{value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4">
          {filterTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                filter === tab.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-white border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
              {tab.value === 'all' && (
                <span className="ml-1.5 text-xs opacity-70">({allOrders.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Orders Table */}
        <Card className="rounded-2xl shadow-sm border-border/50 overflow-hidden">
          <CardContent className="p-0">
            {ordersLoading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground">Loading orders…</div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <ShoppingCart size={36} className="opacity-30" />
                <p>No orders in this category</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-gray-50">
                    <TableRow>
                      <TableHead className="w-16">ID</TableHead>
                      <TableHead>Resident</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Rider</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const next = nextStatus[order.status];
                      return (
                        <TableRow key={order.id} className="hover:bg-gray-50/50">
                          <TableCell className="font-medium text-primary">#{order.id}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{order.residentName || '—'}</p>
                              <p className="text-xs text-muted-foreground">{order.residentPhone || ''}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[140px] truncate">
                            {order.residentAddress || '—'}
                          </TableCell>
                          <TableCell className="text-sm max-w-[160px]">
                            {Array.isArray(order.items) && order.items.length > 0 ? (
                              <div className="space-y-0.5">
                                {order.items.slice(0, 2).map((item: any, i: number) => (
                                  <p key={i} className="truncate text-xs">{item.itemName} ×{item.quantity}</p>
                                ))}
                                {order.items.length > 2 && (
                                  <p className="text-xs text-muted-foreground">+{order.items.length - 2} more</p>
                                )}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{order.vendorName || '—'}</TableCell>
                          <TableCell className="font-bold text-primary">₵{order.total.toFixed(2)}</TableCell>
                          <TableCell><StatusBadge status={order.status} /></TableCell>
                          <TableCell className="min-w-[140px]">
                            {order.status !== 'delivered' && order.status !== 'cancelled' ? (
                              <Select
                                value={order.riderId?.toString() ?? ''}
                                onValueChange={(val) => handleAssignRider(order.id, val)}
                              >
                                <SelectTrigger className="h-8 text-xs rounded-lg">
                                  <SelectValue placeholder="Assign rider" />
                                </SelectTrigger>
                                <SelectContent>
                                  {riders.map((r) => (
                                    <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm text-muted-foreground">{order.riderName || '—'}</span>
                            )}
                          </TableCell>
                          <TableCell className="min-w-[110px]">
                            {next ? (
                              <Button
                                size="sm"
                                variant={order.status === 'pending' ? 'destructive' : 'default'}
                                className="h-7 text-xs rounded-lg px-2"
                                onClick={() => handleStatusUpdate(order.id, next)}
                                disabled={updateStatusMutation.isPending}
                              >
                                {nextStatusLabel[order.status]}
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground capitalize">{order.status}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(order.createdAt), 'dd MMM HH:mm')}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
