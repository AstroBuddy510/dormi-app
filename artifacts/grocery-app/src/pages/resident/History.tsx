import { useLocation } from 'wouter';
import { useAuth } from '@/store';
import { useListOrders } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { Receipt, MapPin } from 'lucide-react';

export default function ResidentHistory() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useListOrders(
    { residentId: user?.id },
    { query: { enabled: !!user?.id } }
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-6 pt-12 pb-6 rounded-b-3xl shadow-sm border-b border-border mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Order History</h1>
        <p className="text-muted-foreground text-sm mt-1">Track your recent purchases</p>
      </div>

      <div className="px-4 space-y-4 max-w-md mx-auto">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Loading orders...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
            <Receipt className="w-12 h-12 mb-3 text-gray-300" />
            <p>No orders yet.</p>
          </div>
        ) : (
          orders.map((order) => (
            <Card key={order.id} className="rounded-2xl shadow-sm border-0 bg-white overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-border flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">
                  {format(new Date(order.createdAt), 'MMM d, yyyy • h:mm a')}
                </span>
                <StatusBadge status={order.status} />
              </div>
              <CardContent className="p-4">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="font-bold text-foreground text-lg">Order #{order.id}</p>
                    <p className="text-sm text-muted-foreground">{order.items.length} items</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-primary text-lg tracking-tight">₵{order.total.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground uppercase">{order.paymentMethod.replace('_', ' ')}</p>
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2">ITEMS SUMMARY</p>
                  <div className="space-y-1">
                    {order.items.slice(0, 3).map((item, idx) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-foreground">{item.quantity}x {item.itemName}</span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-muted-foreground italic mt-2">+{order.items.length - 3} more items...</p>
                    )}
                  </div>
                </div>

                {order.eta && order.status !== 'delivered' && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-blue-700 bg-blue-50 p-2 rounded-lg">
                    <MapPin size={16} />
                    <span>Estimated Arrival: <span className="font-bold">{order.eta}</span></span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
