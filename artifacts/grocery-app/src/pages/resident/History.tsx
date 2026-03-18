import { useState } from 'react';
import { useAuth } from '@/store';
import { useListOrders } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderDetailModal } from '@/components/ui/OrderDetailModal';
import { Card, CardContent } from '@/components/ui/card';
import { format } from 'date-fns';
import { Receipt, ChevronRight } from 'lucide-react';

export default function ResidentHistory() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useListOrders(
    { residentId: user?.id },
    { query: { enabled: !!user?.id } }
  );

  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-6 pt-12 pb-6 rounded-b-3xl shadow-sm border-b border-border mb-6">
        <h1 className="text-2xl font-display font-bold text-foreground">Order History</h1>
        <p className="text-muted-foreground text-sm mt-1">Tap any order to view full details</p>
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
            <Card
              key={order.id}
              className="rounded-2xl shadow-sm border-0 bg-white overflow-hidden cursor-pointer hover:shadow-md active:scale-[0.99] transition-all"
              onClick={() => setSelectedOrder(order)}
            >
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
                    <p className="text-sm text-muted-foreground">{order.items.length} item{order.items.length !== 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    <div>
                      <p className="font-bold text-primary text-lg tracking-tight">₵{order.total.toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground uppercase">{order.paymentMethod.replace('_', ' ')}</p>
                    </div>
                    <ChevronRight size={18} className="text-muted-foreground/50 mt-1" />
                  </div>
                </div>
                
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-muted-foreground font-medium mb-2 uppercase tracking-wide">Items</p>
                  <div className="space-y-1">
                    {order.items.slice(0, 3).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-sm">
                        <span className="text-foreground">{item.quantity}× {item.itemName}</span>
                        <span className="text-muted-foreground font-mono text-xs">
                          ₵{Number(item.totalPrice ?? (item.unitPrice * item.quantity)).toFixed(2)}
                        </span>
                      </div>
                    ))}
                    {order.items.length > 3 && (
                      <p className="text-xs text-primary mt-1.5 font-medium">
                        +{order.items.length - 3} more — tap to see all
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <OrderDetailModal
        order={selectedOrder}
        open={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />
    </div>
  );
}
