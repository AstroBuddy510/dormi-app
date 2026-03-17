import { useState } from 'react';
import { useAuth } from '@/store';
import { useListOrders, useUpdateOrderStatus, OrderStatus } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Store, PhoneCall, CheckCircle, PackageCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function VendorDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: appOrders = [], isLoading: isLoadingApp } = useListOrders({ vendorId: user?.id, callOnly: false });
  const { data: callOrders = [], isLoading: isLoadingCall } = useListOrders({ vendorId: user?.id, callOnly: true });

  const updateStatus = useUpdateOrderStatus({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        toast({ title: "Order Updated", description: "Status changed successfully." });
      }
    }
  });

  const handleUpdate = (orderId: number, status: OrderStatus) => {
    updateStatus.mutate({ id: orderId, data: { status } });
  };

  const OrderCard = ({ order }: { order: any }) => (
    <Card className="rounded-2xl shadow-sm border border-border/50 mb-4 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-border flex justify-between items-center">
        <span className="text-sm font-bold">Order #{order.id}</span>
        <StatusBadge status={order.status} />
      </div>
      <CardContent className="p-4">
        <p className="font-semibold">{order.residentName}</p>
        <p className="text-sm text-muted-foreground mb-4">{order.residentAddress}</p>
        
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-bold text-muted-foreground uppercase">Items to Pick</p>
          {order.items.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center bg-gray-50 p-2 rounded-md">
              <span className="font-medium text-sm">{item.itemName}</span>
              <span className="bg-white px-2 py-1 rounded shadow-sm text-xs font-bold">{item.quantity} {item.unit || 'x'}</span>
            </div>
          ))}
        </div>
      </CardContent>
      {order.status === 'pending' && (
        <CardFooter className="bg-gray-50 p-4 border-t border-border">
          <Button 
            className="w-full h-12 bg-primary hover:bg-primary/90 text-white rounded-xl"
            onClick={() => handleUpdate(order.id, OrderStatus.accepted)}
            disabled={updateStatus.isPending}
          >
            <CheckCircle className="mr-2 h-5 w-5" /> Accept Order
          </Button>
        </CardFooter>
      )}
      {order.status === 'accepted' && (
        <CardFooter className="bg-gray-50 p-4 border-t border-border">
          <Button 
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
            onClick={() => handleUpdate(order.id, OrderStatus.ready)}
            disabled={updateStatus.isPending}
          >
            <PackageCheck className="mr-2 h-5 w-5" /> Mark Ready for Pickup
          </Button>
        </CardFooter>
      )}
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-primary px-6 pt-12 pb-6 text-primary-foreground mb-6">
        <div className="flex items-center gap-3">
          <Store className="h-8 w-8" />
          <div>
            <h1 className="text-2xl font-display font-bold">Vendor Hub</h1>
            <p className="text-primary-foreground/80 text-sm">Manage your preparations</p>
          </div>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto">
        <Tabs defaultValue="app" className="w-full">
          <TabsList className="w-full grid grid-cols-2 h-14 rounded-xl bg-gray-200/50 p-1 mb-6">
            <TabsTrigger value="app" className="rounded-lg text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              App Orders
            </TabsTrigger>
            <TabsTrigger value="call" className="rounded-lg text-sm font-bold data-[state=active]:bg-white data-[state=active]:shadow-sm">
              Call Orders
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="app" className="mt-0">
            {isLoadingApp ? <p className="text-center py-8 text-muted-foreground">Loading...</p> : 
             appOrders.length === 0 ? <p className="text-center py-8 text-muted-foreground">No pending app orders.</p> :
             appOrders.map((order) => <OrderCard key={order.id} order={order} />)
            }
          </TabsContent>
          
          <TabsContent value="call" className="mt-0">
             {isLoadingCall ? <p className="text-center py-8 text-muted-foreground">Loading...</p> : 
             callOrders.length === 0 ? <p className="text-center py-8 text-muted-foreground">No call orders.</p> :
             callOrders.map((order) => <OrderCard key={order.id} order={order} />)
            }
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
