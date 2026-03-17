import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useGetAdminStats, useListOrders, useGetPricing, useUpdatePricing } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { Activity, ShoppingCart, Users, DollarSign, RefreshCcw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useGetAdminStats();
  const { data: orders = [], isLoading: ordersLoading } = useListOrders();

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/admin/stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
  };

  const StatCard = ({ title, value, icon: Icon, desc }: any) => (
    <Card className="shadow-sm border-border/50 rounded-2xl">
      <CardContent className="p-6 flex items-center gap-4">
        <div className="p-4 bg-primary/10 text-primary rounded-xl">
          <Icon size={24} />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <h4 className="text-2xl font-bold font-display tracking-tight text-foreground">{value}</h4>
          {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-8 overflow-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">Live Dashboard</h1>
            <p className="text-muted-foreground mt-1">Overview of today's operations</p>
          </div>
          <Button variant="outline" onClick={refresh} className="rounded-xl border-gray-200">
            <RefreshCcw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Orders" value={stats?.totalOrders || 0} icon={ShoppingCart} />
          <StatCard title="Pending" value={stats?.pendingOrders || 0} icon={Activity} />
          <StatCard title="Subscribers" value={stats?.subscriberCount || 0} icon={Users} desc="Active Friday Queue" />
          <StatCard title="Revenue" value={`₵${stats?.totalRevenue?.toFixed(2) || '0.00'}`} icon={DollarSign} desc="Today's Total" />
        </div>

        {/* Recent Orders Table */}
        <Card className="rounded-2xl shadow-sm border-border/50">
          <CardHeader className="border-b border-border/50 bg-white rounded-t-2xl">
            <CardTitle>Live Orders Feed</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="w-[100px]">ID</TableHead>
                  <TableHead>Resident</TableHead>
                  <TableHead>Estate</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersLoading ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : orders.slice(0, 10).map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">#{order.id}</TableCell>
                    <TableCell>{order.residentName}</TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[150px]">{order.residentAddress}</TableCell>
                    <TableCell className="font-bold text-primary">₵{order.total.toFixed(2)}</TableCell>
                    <TableCell><StatusBadge status={order.status} /></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(order.createdAt), 'HH:mm a')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
