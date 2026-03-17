import { useState } from 'react';
import { useAuth } from '@/store';
import { useListOrders, useUpdateOrderStatus, OrderStatus, useUploadOrderPhoto, UploadPhotoRequestPhotoType } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { Bike, MapPin, Camera, CheckCircle2, Navigation } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function RiderJobs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: jobs = [], isLoading } = useListOrders({ riderId: user?.id });

  const updateStatus = useUpdateOrderStatus({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: "Status Updated" });
    }
  });

  const uploadPhoto = useUploadOrderPhoto({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: "Photo Uploaded successfully" });
    }
  });

  const handleUpdate = (id: number, status: OrderStatus) => {
    updateStatus.mutate({ id, data: { status } });
  };

  const handleFakeUpload = (id: number, type: UploadPhotoRequestPhotoType) => {
    // Fake upload flow since we don't have a real file server in this sandbox
    uploadPhoto.mutate({
      id,
      data: {
        photoType: type,
        photoUrl: `https://dummyimage.com/600x400/16a34a/fff&text=Proof+${id}`
      }
    });
  };

  const activeJobs = jobs.filter(j => ['ready', 'in_transit'].includes(j.status));
  const completedJobs = jobs.filter(j => j.status === 'delivered');

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-zinc-900 px-6 pt-12 pb-6 text-white mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-full">
            <Bike className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold">Rider App</h1>
            <p className="text-zinc-400 text-sm">Stay safe out there, {user?.name}</p>
          </div>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-6">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-4">Active Deliveries ({activeJobs.length})</h2>
          {isLoading ? <p className="text-muted-foreground text-center">Loading...</p> : 
           activeJobs.length === 0 ? (
             <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center">
               <p className="text-muted-foreground">No active deliveries.</p>
             </div>
           ) : (
            <div className="space-y-4">
              {activeJobs.map(job => (
                <Card key={job.id} className="rounded-2xl shadow-md border-0 overflow-hidden">
                  <div className="p-4 border-b border-border bg-white flex justify-between items-start">
                    <div>
                      <p className="font-bold text-lg">Order #{job.id}</p>
                      <p className="text-sm text-muted-foreground">{job.items.length} items</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </div>
                  
                  <CardContent className="p-4 space-y-4 bg-gray-50/50">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 text-primary"><MapPin size={20} /></div>
                      <div>
                        <p className="font-bold text-foreground">{job.residentName}</p>
                        <p className="text-sm text-muted-foreground">{job.residentAddress}</p>
                        <p className="text-sm font-medium mt-1">{job.residentPhone}</p>
                      </div>
                    </div>

                    <a 
                      href={`https://maps.google.com/?q=${encodeURIComponent(job.residentAddress || '')}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-3 bg-white border border-gray-200 rounded-xl text-blue-600 font-bold hover:bg-blue-50 transition-colors"
                    >
                      <Navigation size={18} /> Open in Maps
                    </a>

                    <div className="flex gap-2 pt-2">
                      {job.status === 'ready' && (
                        <>
                          <Button 
                            className="flex-1 h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold"
                            onClick={() => handleUpdate(job.id, OrderStatus.in_transit)}
                            disabled={updateStatus.isPending}
                          >
                            Mark Picked Up
                          </Button>
                        </>
                      )}
                      
                      {job.status === 'in_transit' && (
                        <>
                          <Button 
                            variant="outline"
                            className="flex-1 h-12 rounded-xl border-primary text-primary hover:bg-primary/5 font-bold"
                            onClick={() => handleFakeUpload(job.id, UploadPhotoRequestPhotoType.delivery)}
                            disabled={uploadPhoto.isPending}
                          >
                            <Camera className="mr-2" size={18} /> Snap Proof
                          </Button>
                          <Button 
                            className="flex-1 h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold"
                            onClick={() => handleUpdate(job.id, OrderStatus.delivered)}
                            disabled={updateStatus.isPending || !job.deliveryPhotoUrl}
                          >
                            <CheckCircle2 className="mr-2" size={18} /> Delivered
                          </Button>
                        </>
                      )}
                    </div>
                    {job.status === 'in_transit' && !job.deliveryPhotoUrl && (
                      <p className="text-xs text-center text-red-500 font-medium">Please upload photo proof before marking delivered.</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
