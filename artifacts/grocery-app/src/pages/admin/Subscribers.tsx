import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useGetFridayQueue, useListResidents, useCreateCallLogOrder } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Users, Calendar, Phone, MapPin, ShoppingBag, CheckCircle } from 'lucide-react';
import { useState } from 'react';

export default function AdminSubscribers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createdOrders, setCreatedOrders] = useState<number[]>([]);

  const { data: fridayQueue = [], isLoading } = useGetFridayQueue();
  const { data: allResidents = [] } = useListResidents();
  const createMutation = useCreateCallLogOrder();

  const totalSubscribers = allResidents.filter((r) => r.subscribeWeekly).length;

  const handleCreateWeeklyOrder = (residentId: number, residentName: string) => {
    createMutation.mutate(
      {
        data: {
          residentId,
          rawItems: 'Weekly Subscription Order, 1, 0\nPlease call resident for item details',
          notes: 'Weekly Friday subscription order — call resident to confirm items',
        },
      },
      {
        onSuccess: () => {
          setCreatedOrders((prev) => [...prev, residentId]);
          queryClient.invalidateQueries();
          toast({
            title: 'Weekly Order Created',
            description: `Order created for ${residentName}. Call to confirm items.`,
          });
        },
      }
    );
  };

  const today = new Date();
  const dayName = today.toLocaleDateString('en-GB', { weekday: 'long' });
  const isFriday = dayName === 'Friday';

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Weekly Subscribers</h1>
          <p className="text-muted-foreground mt-1 text-sm">Friday delivery subscription management</p>
        </div>

        {/* Status Banner */}
        <div className={`rounded-2xl p-5 mb-6 flex items-center gap-4 ${isFriday ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
          <div className={`p-3 rounded-xl ${isFriday ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
            <Calendar size={22} />
          </div>
          <div>
            <p className={`font-bold text-base ${isFriday ? 'text-green-800' : 'text-amber-800'}`}>
              {isFriday ? '🎉 Today is Friday — Time to Call the Queue!' : `Today is ${dayName}`}
            </p>
            <p className={`text-sm ${isFriday ? 'text-green-700' : 'text-amber-700'}`}>
              {isFriday
                ? `${fridayQueue.length} subscribers are queued for today. Create their orders below.`
                : `Next delivery day is Friday. ${fridayQueue.length} subscribers are scheduled.`}
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <Card className="rounded-2xl shadow-sm border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                <Users size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Subscribers</p>
                <p className="text-2xl font-bold">{totalSubscribers}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-green-50 text-green-600 rounded-xl">
                <Calendar size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Friday Queue</p>
                <p className="text-2xl font-bold">{fridayQueue.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-2xl shadow-sm border-border/50">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <CheckCircle size={20} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Orders Created</p>
                <p className="text-2xl font-bold">{createdOrders.length}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Friday Queue List */}
        <Card className="rounded-2xl shadow-sm border-border/50">
          <CardHeader className="border-b border-border/50">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar size={18} className="text-primary" />
              Friday Call Queue
            </CardTitle>
            <CardDescription>
              Call each subscriber to confirm their items, then create their weekly order.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Loading subscribers…</div>
            ) : fridayQueue.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Users size={36} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm font-medium">No active subscribers yet</p>
                <p className="text-xs mt-1">Residents can enable weekly delivery from their home screen</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {fridayQueue.map((resident, idx) => {
                  const alreadyCreated = createdOrders.includes(resident.id);
                  return (
                    <div
                      key={resident.id}
                      className={`p-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors ${alreadyCreated ? 'opacity-60' : ''}`}
                    >
                      <div className="shrink-0 w-8 h-8 bg-primary/10 text-primary rounded-full flex items-center justify-center text-sm font-bold">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm">{resident.fullName}</p>
                          {alreadyCreated && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Order Created</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Phone size={11} />
                          {resident.phone}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin size={11} />
                          {resident.estate}, Block {resident.blockNumber}, House {resident.houseNumber}
                          {resident.ghanaGpsAddress && ` · ${resident.ghanaGpsAddress}`}
                        </p>
                      </div>
                      <div className="shrink-0 flex gap-2">
                        <a
                          href={`tel:${resident.phone}`}
                          className="flex items-center gap-1 text-xs px-3 py-2 rounded-xl border border-border bg-white hover:bg-gray-50 font-medium transition-colors"
                        >
                          <Phone size={13} /> Call
                        </a>
                        {!alreadyCreated ? (
                          <Button
                            size="sm"
                            className="h-8 text-xs rounded-xl gap-1"
                            onClick={() => handleCreateWeeklyOrder(resident.id, resident.fullName)}
                            disabled={createMutation.isPending}
                          >
                            <ShoppingBag size={13} /> Create Order
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1 text-xs px-3 py-2 rounded-xl bg-green-50 text-green-700 font-medium">
                            <CheckCircle size={13} /> Done
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
