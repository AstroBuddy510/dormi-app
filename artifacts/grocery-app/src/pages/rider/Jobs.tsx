import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/store';
import { useListOrders, useUpdateOrderStatus, OrderStatus, useUploadOrderPhoto, UploadPhotoRequestPhotoType } from '@workspace/api-client-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DeliveryTimer } from '@/components/ui/DeliveryTimer';
import { RiderStats } from './RiderStats';
import { RiderMessages } from './RiderMessages';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, MapPin, Camera, CheckCircle2, Navigation, X, ImageIcon, Phone, Bell, BellOff, BarChart3, MessageCircle, Boxes, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { compressImage, formatBytes } from '@/lib/imageCompression';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function authHeaders(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const raw = window.localStorage.getItem('grocerease-auth');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const token = parsed?.state?.token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

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

function playAlertTone() {
  try {
    const ctx = new AudioContext();
    const times = [0, 0.15, 0.30];
    times.forEach(t => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime + t);
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.12);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.13);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch {
    // AudioContext unavailable
  }
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = await res.json();
      return body?.message || body?.error || fallback;
    }
    const text = await res.text();
    return text?.slice(0, 200) || fallback;
  } catch {
    return fallback;
  }
}

async function uploadFileToStorage(file: File): Promise<string> {
  const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) {
    const msg = await readErrorMessage(urlRes, 'Failed to get upload URL');
    throw new Error(`(${urlRes.status}) ${msg}`);
  }
  const { uploadURL, objectPath } = await urlRes.json();
  const uploadRes = await fetch(uploadURL, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploadRes.ok) {
    const msg = await readErrorMessage(uploadRes, 'Failed to upload photo');
    // 413 is the tell-tale "payload too large" — surface that clearly.
    if (uploadRes.status === 413) {
      throw new Error(`Photo too large (${formatBytes(file.size)}). Please retake at lower resolution.`);
    }
    throw new Error(`(${uploadRes.status}) ${msg}`);
  }
  return objectPath as string;
}

async function respondToJob(orderId: number, accepted: boolean) {
  const res = await fetch(`${BASE}/api/orders/${orderId}/rider-response`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ accepted }),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Request failed');
  return res.json();
}

async function respondToBulkGroup(groupId: number, accepted: boolean) {
  const res = await fetch(`${BASE}/api/block-groups/${groupId}/rider-response`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ accepted }),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Request failed');
  return res.json();
}

async function updateBulkGroupStatus(groupId: number, status: string) {
  const res = await fetch(`${BASE}/api/block-groups/${groupId}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error((await res.json()).message ?? 'Request failed');
  return res.json();
}

export default function RiderJobs() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: allJobsRaw = [], isLoading } = useListOrders(
    { riderId: user?.id },
    { query: { refetchInterval: 5000 } }
  );

  /* Filter out block orders — they are shown via their bulk group card */
  const allJobs = allJobsRaw.filter((j: any) => j.orderType !== 'block');

  /* Fetch block groups assigned to this rider */
  const { data: bulkGroups = [] } = useQuery<any[]>({
    queryKey: ['block-groups-rider', user?.id],
    queryFn: () => fetch(`${BASE}/api/block-groups?riderId=${user?.id}`, { headers: authHeaders() }).then(r => r.json()),
    enabled: !!user?.id,
    refetchInterval: 5000,
  });

  const updateStatus = useUpdateOrderStatus({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: 'Status Updated' });
    },
  });

  const uploadPhoto = useUploadOrderPhoto({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: 'Photo uploaded!', description: 'Proof of delivery saved.' });
    },
  });

  const [uploading, setUploading] = useState<Record<number, boolean>>({});
  const [previews, setPreviews] = useState<Record<number, string>>({});
  const [responding, setResponding] = useState<Record<number | string, boolean>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const alertedIds = useRef<Set<number>>(new Set());
  const alertedBulkIds = useRef<Set<number>>(new Set());

  /* Individual order categories */
  const pendingJobs = allJobs.filter((j: any) =>
    (j as any).riderAccepted === null &&
    !['in_transit', 'delivered', 'cancelled'].includes(j.status)
  );
  const activeJobs = allJobs.filter((j: any) =>
    ['ready', 'in_transit'].includes(j.status) &&
    (j as any).riderAccepted !== false
  );
  const completedJobs = allJobs.filter((j: any) => j.status === 'delivered');

  /* Bulk group categories */
  const bulkPendingGroups = bulkGroups.filter((g: any) =>
    g.status === 'pending' && g.riderId && !g.riderAccepted
  );
  const bulkActiveGroups = bulkGroups.filter((g: any) =>
    ['accepted', 'collecting', 'ready', 'in_transit'].includes(g.status)
  );
  const bulkCompletedGroups = bulkGroups.filter((g: any) => g.status === 'delivered');

  /* Alert tone for new individual jobs */
  const pendingKey = pendingJobs.map((j: any) => j.id).join(',');
  useEffect(() => {
    const newOnes = pendingJobs.filter((j: any) => !alertedIds.current.has(j.id));
    if (newOnes.length > 0) {
      playAlertTone();
      newOnes.forEach((j: any) => alertedIds.current.add(j.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  /* Alert tone for new bulk group jobs */
  const bulkPendingKey = bulkPendingGroups.map((g: any) => g.id).join(',');
  useEffect(() => {
    const newOnes = bulkPendingGroups.filter((g: any) => !alertedBulkIds.current.has(g.id));
    if (newOnes.length > 0) {
      playAlertTone();
      newOnes.forEach((g: any) => alertedBulkIds.current.add(g.id));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkPendingKey]);

  const handleUpdate = (id: number, status: OrderStatus) => {
    updateStatus.mutate({ id, data: { status } });
  };

  const handleRespond = async (jobId: number, accepted: boolean) => {
    setResponding(prev => ({ ...prev, [jobId]: true }));
    try {
      await respondToJob(jobId, accepted);
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: accepted ? 'Job Accepted!' : 'Job Declined',
        description: accepted ? 'Head to the pickup location.' : 'The admin will reassign.',
        variant: accepted ? 'default' : 'destructive',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setResponding(prev => ({ ...prev, [jobId]: false }));
    }
  };

  const handleBulkRespond = async (groupId: number, accepted: boolean) => {
    const key = `bulk-${groupId}`;
    setResponding(prev => ({ ...prev, [key]: true }));
    try {
      await respondToBulkGroup(groupId, accepted);
      queryClient.invalidateQueries({ queryKey: ['block-groups-rider', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: accepted ? 'Bulk Job Accepted!' : 'Bulk Job Declined',
        description: accepted ? 'Head to the vendor to collect all orders.' : 'The admin will reassign.',
        variant: accepted ? 'default' : 'destructive',
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setResponding(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleBulkStatus = async (groupId: number, status: string) => {
    const key = `bulk-status-${groupId}`;
    setResponding(prev => ({ ...prev, [key]: true }));
    try {
      await updateBulkGroupStatus(groupId, status);
      queryClient.invalidateQueries({ queryKey: ['block-groups-rider', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({ title: 'Status Updated' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setResponding(prev => ({ ...prev, [key]: false }));
    }
  };

  const triggerFilePicker = (jobId: number) => fileInputRefs.current[jobId]?.click();

  const handleFileSelected = useCallback(async (jobId: number, file: File) => {
    if (!file) return;
    setUploading(prev => ({ ...prev, [jobId]: true }));
    try {
      // Compress first so phone-camera JPEGs (often 4–10 MB) fit under
      // Vercel's ~4.5 MB serverless body limit.
      const { file: toUpload, compressed, originalSize, finalSize } =
        await compressImage(file, { targetBytes: 3 * 1024 * 1024, maxBytes: 5 * 1024 * 1024 });

      // Preview the (possibly compressed) image we're actually sending.
      const localPreview = URL.createObjectURL(toUpload);
      setPreviews(prev => ({ ...prev, [jobId]: localPreview }));

      if (compressed) {
        toast({
          title: 'Photo optimised',
          description: `Shrunk ${formatBytes(originalSize)} → ${formatBytes(finalSize)} before upload.`,
        });
      }

      const objectPath = await uploadFileToStorage(toUpload);
      uploadPhoto.mutate({ id: jobId, data: { photoType: UploadPhotoRequestPhotoType.delivery, photoUrl: objectPath } });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message ?? 'Could not upload photo.', variant: 'destructive' });
      setPreviews(prev => { const n = { ...prev }; delete n[jobId]; return n; });
    } finally {
      setUploading(prev => ({ ...prev, [jobId]: false }));
    }
  }, [uploadPhoto, toast]);

  const { data: unreadData } = useQuery<{ total: number }>({
    queryKey: ['rider-messages-unread', user?.id],
    queryFn: () => fetch(`${BASE}/api/rider-messages/unread-count`, { headers: authHeaders() }).then(r => r.json()),
    refetchInterval: 10_000,
    enabled: !!user?.id,
  });
  const unreadCount = unreadData?.total ?? 0;

  const totalIncoming = pendingJobs.length + bulkPendingGroups.length;
  const totalActive   = activeJobs.length + bulkActiveGroups.length;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-zinc-900 px-6 pt-12 pb-5 text-white">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-800 rounded-full">
            <Bike className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-display font-bold">Rider App</h1>
            <p className="text-zinc-400 text-sm">Stay safe out there, {user?.name}</p>
          </div>
          {totalIncoming > 0 && (
            <div className="ml-auto flex items-center gap-1.5 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full animate-pulse">
              <Bell size={13} />
              {totalIncoming} Incoming
            </div>
          )}
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto">

        {/* Tabs */}
        <Tabs defaultValue="jobs" className="w-full mt-4">
          <TabsList className="w-full grid grid-cols-3 mb-5 rounded-2xl bg-white border border-border shadow-sm h-11">
            <TabsTrigger value="jobs" className="rounded-xl text-sm font-medium flex items-center gap-1.5">
              <Bike size={14} /> Jobs
              {(totalIncoming + totalActive) > 0 && (
                <span className="bg-primary text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {totalIncoming + totalActive}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="stats" className="rounded-xl text-sm font-medium flex items-center gap-1.5">
              <BarChart3 size={14} /> Stats
            </TabsTrigger>
            <TabsTrigger value="messages" className="rounded-xl text-sm font-medium flex items-center gap-1.5">
              <MessageCircle size={14} /> Chat
              {unreadCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                  {unreadCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Jobs Tab ── */}
          <TabsContent value="jobs" className="space-y-6 mt-0">

        {/* ── Incoming Jobs (individual) ── */}
        {pendingJobs.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-red-600 mb-3 flex items-center gap-2">
              <Bell size={20} className="animate-bounce" /> Incoming Jobs ({pendingJobs.length})
            </h2>
            <div className="space-y-4">
              {pendingJobs.map((job: any) => (
                <Card key={job.id} className="rounded-2xl border-2 border-red-400 shadow-lg overflow-hidden">
                  <div className="bg-red-50 p-4 border-b border-red-200 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-lg text-red-700">Order #{job.id} — New Job!</p>
                      <p className="text-sm text-red-500">{job.items.length} item{job.items.length !== 1 ? 's' : ''} · GH₵{job.total?.toFixed(2)}</p>
                    </div>
                    <Bell className="text-red-500 animate-bounce" size={24} />
                  </div>

                  <CardContent className="p-4 space-y-3 bg-white">
                    <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 flex items-start gap-3">
                      <div className="mt-0.5 p-1.5 bg-primary/10 rounded-lg">
                        <MapPin size={16} className="text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm leading-tight">{job.residentName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{job.residentAddress}</p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      {(job.items as any[]).slice(0, 3).map((item: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs text-muted-foreground">
                          <span>{item.name}</span>
                          <span>×{item.quantity}</span>
                        </div>
                      ))}
                      {job.items.length > 3 && (
                        <p className="text-xs text-muted-foreground">+{job.items.length - 3} more items</p>
                      )}
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        className="flex-1 h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold text-base"
                        onClick={() => handleRespond(job.id, true)}
                        disabled={responding[job.id] as boolean}
                      >
                        <CheckCircle2 className="mr-2" size={18} />
                        {responding[job.id] ? 'Accepting…' : 'Accept'}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 h-12 rounded-xl border-red-400 text-red-500 hover:bg-red-50 font-bold text-base"
                        onClick={() => handleRespond(job.id, false)}
                        disabled={responding[job.id] as boolean}
                      >
                        <BellOff className="mr-2" size={18} />
                        Decline
                      </Button>
                    </div>
                    <p className="text-xs text-center text-muted-foreground">
                      Declining will return this order to the admin for reassignment.
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* ── Incoming Bulk Group Jobs ── */}
        {bulkPendingGroups.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-indigo-700 mb-3 flex items-center gap-2">
              <Boxes size={20} className="animate-bounce" /> Bulk Delivery Jobs ({bulkPendingGroups.length})
            </h2>
            <div className="space-y-4">
              {bulkPendingGroups.map((group: any) => {
                const bulkKey = `bulk-${group.id}`;
                const isResponding = responding[bulkKey] as boolean;
                return (
                  <Card key={group.id} className="rounded-2xl border-2 border-indigo-400 shadow-lg overflow-hidden">
                    <div className="bg-indigo-50 p-4 border-b border-indigo-200 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-lg text-indigo-700">
                          Bulk Job BLK-{group.id}
                        </p>
                        <p className="text-sm text-indigo-500">
                          {group.totalOrders} orders · {group.estate} · GH₵{group.totalAmount?.toFixed(2)}
                        </p>
                      </div>
                      <Boxes className="text-indigo-500 animate-bounce" size={24} />
                    </div>

                    <CardContent className="p-4 space-y-3 bg-white">
                      <div className="bg-indigo-50 rounded-xl border border-indigo-200 p-3 flex items-start gap-3">
                        <div className="mt-0.5 p-1.5 bg-indigo-100 rounded-lg">
                          <MapPin size={16} className="text-indigo-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm text-indigo-800 leading-tight">{group.estate}</p>
                          <p className="text-xs text-indigo-600 mt-0.5">
                            {group.totalOrders} resident{group.totalOrders !== 1 ? 's' : ''} — single delivery run
                          </p>
                          {group.batchNumber && (
                            <p className="text-xs text-muted-foreground mt-0.5 font-mono">Batch: {group.batchNumber}</p>
                          )}
                        </div>
                      </div>

                      <div className="bg-gray-50 rounded-xl p-3 text-xs text-muted-foreground">
                        <p className="font-semibold text-foreground mb-1">What you'll do:</p>
                        <p>1. Collect all {group.totalOrders} orders from the vendor</p>
                        <p>2. Deliver to each resident in {group.estate}</p>
                      </div>

                      <div className="flex gap-2 pt-1">
                        <Button
                          className="flex-1 h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-base"
                          onClick={() => handleBulkRespond(group.id, true)}
                          disabled={isResponding}
                        >
                          <CheckCircle2 className="mr-2" size={18} />
                          {isResponding ? 'Accepting…' : 'Accept All'}
                        </Button>
                        <Button
                          variant="outline"
                          className="flex-1 h-12 rounded-xl border-red-400 text-red-500 hover:bg-red-50 font-bold text-base"
                          onClick={() => handleBulkRespond(group.id, false)}
                          disabled={isResponding}
                        >
                          <BellOff className="mr-2" size={18} />
                          Decline
                        </Button>
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        Accepting covers all {group.totalOrders} orders in this estate.
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Active Individual Deliveries ── */}
        <div>
          <h2 className="text-lg font-bold text-foreground mb-4">Active Deliveries ({totalActive})</h2>
          {isLoading ? <p className="text-muted-foreground text-center">Loading...</p> :
           totalActive === 0 ? (
             <div className="bg-white border border-dashed border-gray-200 rounded-2xl p-8 text-center">
               <p className="text-muted-foreground">No active deliveries.</p>
             </div>
           ) : (
            <div className="space-y-4">

              {/* Individual active jobs */}
              {activeJobs.map((job: any) => {
                const hasProof = !!job.deliveryPhotoUrl || !!previews[job.id];
                const isUploadingThis = uploading[job.id];
                const previewUrl = previews[job.id] ?? job.deliveryPhotoUrl;

                return (
                  <Card key={job.id} className="rounded-2xl shadow-md border-0 overflow-hidden">
                    <div className="p-4 border-b border-border bg-white">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-bold text-lg">Order #{job.id}</p>
                          <p className="text-sm text-muted-foreground">{job.items.length} items</p>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>
                      <DeliveryTimer
                        pickedUpAt={(job as any).pickedUpAt}
                        deliveredAt={(job as any).deliveredAt}
                        size="sm"
                      />
                    </div>

                    <CardContent className="p-4 space-y-4 bg-gray-50/50">
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

                      <div className="space-y-2">
                        <a
                          href={googleMapsNavUrl(job.residentAddress || job.residentName || '')}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-xl text-white font-bold text-sm transition-colors shadow-sm"
                        >
                          <Navigation size={18} />
                          Navigate with Google Maps
                        </a>
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

              {/* Bulk active group cards */}
              {bulkActiveGroups.map((group: any) => {
                const statusKey = `bulk-status-${group.id}`;
                const isBusy = responding[statusKey] as boolean;
                return (
                  <Card key={`bulk-active-${group.id}`} className="rounded-2xl shadow-md border-2 border-indigo-200 overflow-hidden">
                    <div className="p-4 border-b border-indigo-100 bg-indigo-50">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <div className="flex items-center gap-2">
                            <Boxes size={18} className="text-indigo-600" />
                            <p className="font-bold text-lg text-indigo-800">Bulk Run BLK-{group.id}</p>
                          </div>
                          <p className="text-sm text-indigo-600">
                            {group.totalOrders} orders · {group.estate} · GH₵{group.totalAmount?.toFixed(2)}
                          </p>
                        </div>
                        <StatusBadge status={group.status} />
                      </div>
                    </div>

                    <CardContent className="p-4 space-y-3 bg-white">
                      <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-3 flex items-center gap-3">
                        <MapPin size={16} className="text-indigo-600 shrink-0" />
                        <div>
                          <p className="font-semibold text-sm text-indigo-800">{group.estate}</p>
                          <p className="text-xs text-indigo-500">{group.totalOrders} stops in this estate</p>
                        </div>
                      </div>

                      <a
                        href={googleMapsNavUrl(group.estate)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-center gap-2.5 w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-bold text-sm transition-colors"
                      >
                        <Navigation size={16} />
                        Navigate to {group.estate}
                      </a>

                      {(group.status === 'accepted' || group.status === 'collecting') && (
                        <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-800">
                          <p className="font-semibold">Go collect from vendor</p>
                          <p>Pick up all {group.totalOrders} orders before delivering.</p>
                        </div>
                      )}

                      {group.status === 'ready' && (
                        <Button
                          className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold"
                          onClick={() => handleBulkStatus(group.id, 'in_transit')}
                          disabled={isBusy}
                        >
                          <Package className="mr-2" size={18} />
                          {isBusy ? 'Updating…' : 'Collected — Now Delivering'}
                        </Button>
                      )}

                      {group.status === 'in_transit' && (
                        <Button
                          className="w-full h-12 rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold"
                          onClick={() => handleBulkStatus(group.id, 'delivered')}
                          disabled={isBusy}
                        >
                          <CheckCircle2 className="mr-2" size={18} />
                          {isBusy ? 'Updating…' : 'All Delivered'}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}

            </div>
          )}
        </div>

        {/* ── Completed Today ── */}
        {(completedJobs.length + bulkCompletedGroups.length) > 0 && (
          <div>
            <h2 className="text-lg font-bold text-foreground mb-4">
              Completed Today ({completedJobs.length + bulkCompletedGroups.length})
            </h2>
            <div className="space-y-3">
              {completedJobs.map((job: any) => (
                <Card key={job.id} className="rounded-2xl border-0 shadow-sm opacity-80">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold">Order #{job.id}</p>
                        <p className="text-sm text-muted-foreground">{job.residentName}</p>
                      </div>
                      <StatusBadge status={job.status} />
                    </div>
                    <DeliveryTimer
                      pickedUpAt={(job as any).pickedUpAt}
                      deliveredAt={(job as any).deliveredAt}
                      size="sm"
                    />
                  </CardContent>
                </Card>
              ))}
              {bulkCompletedGroups.map((group: any) => (
                <Card key={`bulk-done-${group.id}`} className="rounded-2xl border-0 shadow-sm opacity-80">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center gap-2">
                        <Boxes size={16} className="text-indigo-500" />
                        <div>
                          <p className="font-semibold">BLK-{group.id} — {group.estate}</p>
                          <p className="text-sm text-muted-foreground">{group.totalOrders} orders · GH₵{group.totalAmount?.toFixed(2)}</p>
                        </div>
                      </div>
                      <StatusBadge status={group.status} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

          </TabsContent>

          {/* ── Stats Tab ── */}
          <TabsContent value="stats" className="mt-0">
            <RiderStats allJobs={allJobsRaw as any} />
          </TabsContent>

          {/* ── Messages Tab ── */}
          <TabsContent value="messages" className="mt-0">
            {user && (
              <RiderMessages riderId={user.id} riderName={user.name} />
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
