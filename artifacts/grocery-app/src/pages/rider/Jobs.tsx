import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/store';
import { useListOrders, useUpdateOrderStatus, OrderStatus, useUploadOrderPhoto, UploadPhotoRequestPhotoType } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQueryClient } from '@tanstack/react-query';
import { Bike, MapPin, Camera, CheckCircle2, Navigation, X, ImageIcon, Phone } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const GHANA_POST_RE = /\b([A-Z]{2,3}-\d{3,4}-\d{3,4})\b/i;

function extractGhanaPostCode(address: string): string | null {
  const match = address?.match(GHANA_POST_RE);
  return match ? match[1].toUpperCase() : null;
}

function googleMapsNavUrl(address: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}&travelmode=driving`;
}

function ghanaPostUrl(code: string): string {
  return `https://ghanapostgps.com/map?address=${encodeURIComponent(code)}`;
}

async function uploadFileToStorage(file: File): Promise<string> {
  const urlRes = await fetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error('Failed to get upload URL');
  const { uploadURL, objectPath } = await urlRes.json();

  const uploadRes = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error('Failed to upload photo');

  return objectPath as string;
}

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
      toast({ title: "Photo uploaded!", description: "Proof of delivery saved." });
    }
  });

  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const handleUpdate = (id: number, status: OrderStatus) => {
    updateStatus.mutate({ id, data: { status } });
  };

  const triggerFilePicker = (jobId: number) => {
    fileInputRefs.current[jobId]?.click();
  };

  const handleFileSelected = useCallback(async (jobId: number, file: File) => {
    if (!file) return;

    const localPreview = URL.createObjectURL(file);
    setPreviews(prev => ({ ...prev, [jobId]: localPreview }));
    setUploading(prev => ({ ...prev, [jobId]: true }));

    try {
      const objectPath = await uploadFileToStorage(file);
      uploadPhoto.mutate({
        id: jobId,
        data: {
          photoType: UploadPhotoRequestPhotoType.delivery,
          photoUrl: objectPath,
        },
      });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message ?? "Could not upload photo.", variant: "destructive" });
      setPreviews(prev => { const n = { ...prev }; delete n[jobId]; return n; });
    } finally {
      setUploading(prev => ({ ...prev, [jobId]: false }));
    }
  }, [uploadPhoto, toast]);

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
              {activeJobs.map(job => {
                const hasProof = !!job.deliveryPhotoUrl || !!previews[job.id];
                const isUploadingThis = uploading[job.id];
                const previewUrl = previews[job.id] ?? job.deliveryPhotoUrl;

                return (
                  <Card key={job.id} className="rounded-2xl shadow-md border-0 overflow-hidden">
                    <div className="p-4 border-b border-border bg-white flex justify-between items-start">
                      <div>
                        <p className="font-bold text-lg">Order #{job.id}</p>
                        <p className="text-sm text-muted-foreground">{job.items.length} items</p>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>

                    <CardContent className="p-4 space-y-4 bg-gray-50/50">
                      {/* Delivery address block */}
                      <div className="bg-white rounded-xl border border-border p-3.5 flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 bg-primary/10 rounded-lg">
                          <MapPin size={18} className="text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-foreground leading-tight">{job.residentName}</p>
                          <p className="text-sm text-muted-foreground mt-0.5 leading-snug">{job.residentAddress}</p>
                          {extractGhanaPostCode(job.residentAddress || '') && (
                            <span className="inline-flex items-center mt-1.5 text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-mono font-semibold">
                              📍 {extractGhanaPostCode(job.residentAddress || '')}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Navigation buttons */}
                      <div className="space-y-2">
                        {/* Primary: Google Maps direct navigation */}
                        <a
                          href={googleMapsNavUrl(job.residentAddress || job.residentName || '')}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl text-white font-bold text-sm transition-colors shadow-sm"
                        >
                          <Navigation size={18} />
                          Navigate with Google Maps
                        </a>

                        {/* Secondary row: GhanaPost GPS (if code found) + Call */}
                        <div className="flex gap-2">
                          {extractGhanaPostCode(job.residentAddress || '') ? (
                            <a
                              href={ghanaPostUrl(extractGhanaPostCode(job.residentAddress || '')!)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 active:bg-green-800 rounded-xl text-white font-bold text-sm transition-colors shadow-sm"
                            >
                              <span className="text-base leading-none">📍</span>
                              GhanaPost GPS
                            </a>
                          ) : null}
                          <a
                            href={`tel:${job.residentPhone}`}
                            className={`${extractGhanaPostCode(job.residentAddress || '') ? 'flex-1' : 'w-full'} flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 rounded-xl text-gray-700 font-bold text-sm transition-colors shadow-sm`}
                          >
                            <Phone size={16} className="text-green-600" />
                            Call Customer
                          </a>
                        </div>
                      </div>

                      {job.status === 'ready' && (
                        <Button
                          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold"
                          onClick={() => handleUpdate(job.id, OrderStatus.in_transit)}
                          disabled={updateStatus.isPending}
                        >
                          Mark Picked Up
                        </Button>
                      )}

                      {job.status === 'in_transit' && (
                        <div className="space-y-3">
                          {previewUrl ? (
                            <div className="relative rounded-xl overflow-hidden border-2 border-green-400 bg-white">
                              <img
                                src={previewUrl}
                                alt="Delivery proof"
                                className="w-full h-40 object-cover"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <div className="absolute top-2 right-2 flex gap-1">
                                <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                                  <CheckCircle2 size={11} /> Proof saved
                                </span>
                                {!job.deliveryPhotoUrl && (
                                  <button
                                    onClick={() => setPreviews(prev => { const n = { ...prev }; delete n[job.id]; return n; })}
                                    className="bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                                  >
                                    <X size={13} />
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="rounded-xl border-2 border-dashed border-gray-200 bg-white p-4 text-center text-gray-400">
                              <ImageIcon size={28} className="mx-auto mb-1 text-gray-300" />
                              <p className="text-xs">No proof photo yet</p>
                            </div>
                          )}

                          <input
                            ref={el => { fileInputRefs.current[job.id] = el; }}
                            type="file"
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={e => {
                              const file = e.target.files?.[0];
                              if (file) handleFileSelected(job.id, file);
                              e.target.value = '';
                            }}
                          />

                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              className="flex-1 h-12 rounded-xl border-primary text-primary hover:bg-primary/5 font-bold"
                              onClick={() => triggerFilePicker(job.id)}
                              disabled={isUploadingThis}
                            >
                              <Camera className="mr-2" size={18} />
                              {isUploadingThis ? 'Uploading...' : hasProof ? 'Retake Photo' : 'Snap Proof'}
                            </Button>
                            <Button
                              className="flex-1 h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold"
                              onClick={() => handleUpdate(job.id, OrderStatus.delivered)}
                              disabled={updateStatus.isPending || !hasProof || isUploadingThis}
                            >
                              <CheckCircle2 className="mr-2" size={18} /> Delivered
                            </Button>
                          </div>

                          {!hasProof && (
                            <p className="text-xs text-center text-red-500 font-medium">
                              Take a photo of the delivered goods before marking as delivered.
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {completedJobs.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4">Completed Today ({completedJobs.length})</h2>
            <div className="space-y-3">
              {completedJobs.map(job => (
                <Card key={job.id} className="rounded-2xl border-0 shadow-sm opacity-70">
                  <CardContent className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold">Order #{job.id}</p>
                      <p className="text-sm text-muted-foreground">{job.residentName}</p>
                    </div>
                    <StatusBadge status={job.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
