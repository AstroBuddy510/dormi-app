import { useState, useRef, useEffect } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useListResidents, useListVendors, useListRiders } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Users,
  Truck,
  Store,
  Pencil,
  Trash2,
  PauseCircle,
  PlayCircle,
  Phone,
  MapPin,
  Calendar,
  Key,
  Search,
  UserCheck,
  UserX,
  Camera,
  ShieldCheck,
  Loader2,
  Eye,
  EyeOff,
  Headset,
  Plus,
  Zap,
  Navigation2,
  Calculator,
  Info,
  LayoutGrid,
  List,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';

const API_BASE = '/api';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Request failed');
  }
  return res.json();
}

// ─── Two-step presigned upload ────────────────────────────────────────────────
async function uploadPhoto(file: File): Promise<string> {
  const metaRes = await fetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!metaRes.ok) throw new Error('Failed to get upload URL');
  const { uploadURL, objectPath } = await metaRes.json();
  const putRes = await fetch(uploadURL, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });
  if (!putRes.ok) throw new Error('Failed to upload photo');
  // Return full serving URL so it can be stored and used directly as img src
  return `/api/storage${objectPath}` as string;
}

// ─── Shared UI pieces ─────────────────────────────────────────────────────────
function StatusPill({ active, suspended }: { active?: boolean; suspended?: boolean }) {
  const isSuspended = suspended === true || active === false;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
      {isSuspended ? <UserX size={11} /> : <UserCheck size={11} />}
      {isSuspended ? 'Suspended' : 'Active'}
    </span>
  );
}

function Avatar({ name, photoUrl, color, size = 'md' }: { name: string; photoUrl?: string | null; color: string; size?: 'sm' | 'md' }) {
  const [imgError, setImgError] = useState(false);
  const sz = size === 'sm' ? 'w-9 h-9 text-sm' : 'w-12 h-12 text-base';
  if (photoUrl && !imgError) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={`${sz} rounded-full object-cover shrink-0 ring-2 ring-white shadow`}
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-bold shrink-0 ring-2 ring-white shadow`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Photo Upload button (inline camera icon) ─────────────────────────────────
function PhotoUploadButton({ onUpload }: { onUpload: (file: File) => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(file);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handle} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        title="Upload photo"
        className="absolute bottom-0 right-0 bg-primary text-white rounded-full p-1.5 shadow-md hover:bg-primary/90 transition-colors"
      >
        {uploading ? <Loader2 size={11} className="animate-spin" /> : <Camera size={11} />}
      </button>
    </>
  );
}

// ─── PIN Reset Dialog ─────────────────────────────────────────────────────────
function PinResetDialog({
  open, onClose, onSave, name,
}: { open: boolean; onClose: () => void; onSave: (pin: string) => Promise<void>; name: string }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const handleClose = () => { setPin(''); setConfirm(''); setShow(false); onClose(); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length < 4) return toast({ title: 'PIN too short', description: 'PIN must be at least 4 digits', variant: 'destructive' });
    if (pin !== confirm) return toast({ title: 'PINs do not match', variant: 'destructive' });
    setSaving(true);
    try {
      await onSave(pin);
      toast({ title: 'PIN Reset', description: `New PIN set for ${name}` });
      handleClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-primary" /> Reset PIN — {name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <p className="text-sm text-muted-foreground">Set a new PIN for this user. They will use it to log in next time.</p>
          <div className="space-y-1">
            <Label>New PIN</Label>
            <div className="relative">
              <Input
                type={show ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={8}
                placeholder="e.g. 4821"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
                className="rounded-xl pr-10 font-mono tracking-widest"
              />
              <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShow(!show)}>
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <Label>Confirm PIN</Label>
            <Input
              type={show ? 'text' : 'password'}
              inputMode="numeric"
              maxLength={8}
              placeholder="Repeat new PIN"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
              required
              className="rounded-xl font-mono tracking-widest"
            />
          </div>
          {pin && confirm && pin !== confirm && (
            <p className="text-xs text-destructive">PINs do not match</p>
          )}
          <DialogFooter className="gap-2 pt-1">
            <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
            <Button type="submit" className="rounded-xl" disabled={saving || pin !== confirm || pin.length < 4}>
              {saving ? <><Loader2 size={14} className="animate-spin mr-1" /> Saving…</> : 'Set PIN'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Zone badge helper ─────────────────────────────────────────────────────────
function ZoneBadge({ zone }: { zone?: string | null }) {
  if (!zone) return <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">No zone</span>;
  const colors: Record<string, string> = {
    'Inner Accra': 'bg-green-100 text-green-700',
    'Outer Accra': 'bg-blue-100 text-blue-700',
    'Far': 'bg-orange-100 text-orange-700',
  };
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[zone] ?? 'bg-gray-100 text-gray-600'}`}>{zone}</span>;
}

const ZONES = ['Inner Accra', 'Outer Accra', 'Far'];
const PAGE_SIZE_GRID = 12;
const PAGE_SIZE_LIST = 15;

type ViewMode = 'grid' | 'list';

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 bg-muted rounded-xl p-1 border border-border/40">
      <button
        onClick={() => onChange('grid')}
        title="Grid view"
        className={`p-1.5 rounded-lg transition-colors ${view === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <LayoutGrid size={14} />
      </button>
      <button
        onClick={() => onChange('list')}
        title="List view"
        className={`p-1.5 rounded-lg transition-colors ${view === 'list' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <List size={14} />
      </button>
    </div>
  );
}

function Paginator({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <div className="flex items-center justify-between mt-6 pt-4 border-t border-border/50">
      <p className="text-xs text-muted-foreground">
        {total} total · page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground"
        >
          <ChevronLeft size={15} />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`ellipsis-${i}`} className="w-8 text-center text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p as number)}
              className={`w-8 h-8 text-xs font-medium rounded-lg transition-colors ${p === page ? 'bg-primary text-white' : 'hover:bg-muted text-foreground'}`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

// ─── Residents Tab ────────────────────────────────────────────────────────────
function ResidentsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: residents = [], isLoading } = useListResidents();
  const { data: estateList = [] } = useQuery<string[]>({
    queryKey: ['estates'],
    queryFn: () => fetch('/api/residents/estates').then(r => r.json()),
  });
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editZone, setEditZone] = useState<string>('none');
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [detectingId, setDetectingId] = useState<number | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  const filtered = residents.filter(
    (r) => r.fullName.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search) || r.estate.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => { setPage(1); }, [search, viewMode]);

  const handlePhotoUpload = async (r: any, file: File) => {
    try {
      const photoUrl = await uploadPhoto(file);
      await apiFetch(`/residents/${r.id}/photo`, { method: 'PUT', body: JSON.stringify({ photoUrl }) });
      queryClient.invalidateQueries();
      toast({ title: 'Photo updated' });
    } catch (e: any) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); }
  };

  const handleSuspend = async (r: any) => {
    try {
      await apiFetch(`/residents/${r.id}/suspend`, { method: 'PUT', body: JSON.stringify({ suspended: !r.suspended }) });
      queryClient.invalidateQueries();
      toast({ title: r.suspended ? 'Resident Reactivated' : 'Resident Suspended' });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/residents/${deleteTarget.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries();
      toast({ title: 'Resident Deleted' });
      setDeleteTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleDetectZone = async (r: any) => {
    setDetectingId(r.id);
    try {
      const result = await apiFetch(`/residents/${r.id}/detect-zone`, { method: 'POST' });
      queryClient.invalidateQueries();
      toast({ title: 'Zone Detected', description: `${r.fullName} tagged as ${result.zone}` });
    } catch (e: any) { toast({ title: 'Cannot detect zone', description: e.message, variant: 'destructive' }); }
    finally { setDetectingId(null); }
  };

  const handleBulkDetect = async () => {
    setBulkRunning(true);
    try {
      const result = await apiFetch('/residents/bulk-detect-zones', { method: 'POST' });
      queryClient.invalidateQueries();
      toast({ title: 'Bulk Zone Detection', description: result.message });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setBulkRunning(false); }
  };

  const openEdit = (r: any) => {
    setEditTarget({ ...r });
    setEditZone(r.zone ?? 'none');
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/residents/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fd.get('fullName'), phone: fd.get('phone'), estate: fd.get('estate'),
          blockNumber: fd.get('blockNumber'), houseNumber: fd.get('houseNumber'),
          ghanaGpsAddress: fd.get('ghanaGpsAddress') || undefined,
        }),
      });
      if (editZone !== 'none') {
        await apiFetch(`/residents/${editTarget.id}/zone`, { method: 'PATCH', body: JSON.stringify({ zone: editZone === 'clear' ? null : editZone }) });
      }
      queryClient.invalidateQueries();
      toast({ title: 'Resident Updated' });
      setEditTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsAdding(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch('/residents/signup', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fd.get('fullName'),
          phone: fd.get('phone'),
          estate: fd.get('estate'),
          blockNumber: fd.get('blockNumber'),
          houseNumber: fd.get('houseNumber'),
          ghanaGpsAddress: fd.get('ghanaGpsAddress') || undefined,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['residents'] });
      queryClient.invalidateQueries({ queryKey: ['estates'] });
      toast({ title: 'Resident Added' });
      setAddOpen(false);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsAdding(false); }
  };

  const pageSize = viewMode === 'grid' ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, phone or estate…" className="pl-9 h-9 rounded-xl text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} residents</span>
        <ViewToggle view={viewMode} onChange={(v) => { setViewMode(v); setPage(1); }} />
        <Button size="sm" variant="outline" className="rounded-xl h-9 gap-1.5 text-xs" onClick={handleBulkDetect} disabled={bulkRunning}>
          {bulkRunning ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
          Auto-tag All Zones
        </Button>
        <Button size="sm" className="rounded-xl gap-1.5 ml-auto" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Add Resident
        </Button>
      </div>

      {isLoading ? <div className="py-12 text-center text-muted-foreground">Loading…</div> : (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((r) => (
              <Card key={r.id} className={`rounded-2xl shadow-sm border-border/50 ${(r as any).suspended ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar name={r.fullName} photoUrl={(r as any).photoUrl} color="bg-primary/10 text-primary" />
                        <PhotoUploadButton onUpload={(file) => handlePhotoUpload(r, file)} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{r.fullName}</p>
                        <p className="text-xs text-muted-foreground">ID #{r.id}</p>
                      </div>
                    </div>
                    <StatusPill suspended={(r as any).suspended} />
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone size={11} className="text-primary" />
                      <span className="font-mono font-medium text-foreground">{r.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin size={11} className="text-primary" />
                      <span>{r.estate}, Blk {r.blockNumber}, Hse {r.houseNumber}</span>
                    </div>
                    {r.ghanaGpsAddress && (
                      <div className="flex items-center gap-2 pl-4">
                        <span className="text-xs text-muted-foreground font-mono">{r.ghanaGpsAddress}</span>
                        {!(r as any).zone && (
                          <button className="text-xs text-blue-600 hover:underline flex items-center gap-0.5" onClick={() => handleDetectZone(r)} disabled={detectingId === r.id}>
                            {detectingId === r.id ? <Loader2 size={10} className="animate-spin" /> : <Navigation2 size={10} />}
                            Auto-tag
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <ZoneBadge zone={(r as any).zone} />
                      {(r as any).zone && r.ghanaGpsAddress && (
                        <button className="text-xs text-muted-foreground hover:text-blue-600 flex items-center gap-0.5" onClick={() => handleDetectZone(r)} disabled={detectingId === r.id}>
                          {detectingId === r.id ? <Loader2 size={10} className="animate-spin" /> : <Navigation2 size={10} />}
                          Re-detect
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar size={11} className="text-primary" />
                      <span>Joined {format(new Date(r.createdAt), 'dd MMM yyyy')}</span>
                    </div>
                    {r.subscribeWeekly && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">📅 Friday Subscriber</span>}
                  </div>
                  <div className="mb-3 pb-3 border-b border-border/50 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Key size={11} className="text-primary" />
                    <span>Login: <span className="font-medium text-foreground">Phone only</span></span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl gap-1" onClick={() => openEdit(r)}>
                      <Pencil size={12} /> Edit
                    </Button>
                    <Button size="sm" variant={(r as any).suspended ? 'default' : 'outline'}
                      className={`flex-1 h-8 text-xs rounded-xl gap-1 ${!(r as any).suspended ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : ''}`}
                      onClick={() => handleSuspend(r)}>
                      {(r as any).suspended ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                      {(r as any).suspended ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteTarget(r)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* ── List view ── */
          <div className="space-y-1.5">
            {/* Header row */}
            <div className="hidden md:grid grid-cols-[2.5rem_8rem_11rem_6rem_5.5rem_auto] gap-4 px-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
              <span />
              <span>Name</span>
              <span>Contact & Address</span>
              <span>Zone</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {paged.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 md:grid md:grid-cols-[2.5rem_8rem_11rem_6rem_5.5rem_auto] md:gap-4 md:items-start px-3 py-2.5 bg-white rounded-xl border border-border/50 hover:shadow-sm transition-shadow ${(r as any).suspended ? 'opacity-60' : ''}`}>
                <div className="relative shrink-0">
                  <Avatar name={r.fullName} photoUrl={(r as any).photoUrl} color="bg-primary/10 text-primary" size="sm" />
                  <PhotoUploadButton onUpload={(file) => handlePhotoUpload(r, file)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.fullName}</p>
                  <p className="text-[11px] text-muted-foreground">ID #{r.id} · {format(new Date(r.createdAt), 'dd MMM yy')}</p>
                  <p className="text-[11px] text-muted-foreground truncate md:hidden">{r.phone} · {r.estate}</p>
                  <div className="flex gap-1.5 mt-1 md:hidden">
                    <ZoneBadge zone={(r as any).zone} />
                    <StatusPill suspended={(r as any).suspended} />
                  </div>
                </div>
                <div className="hidden md:block min-w-0 overflow-hidden">
                  <p className="text-xs font-mono truncate">{r.phone}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.estate}, Blk {r.blockNumber}, Hse {r.houseNumber}</p>
                </div>
                <div className="hidden md:block overflow-hidden"><ZoneBadge zone={(r as any).zone} /></div>
                <div className="hidden md:block overflow-hidden"><StatusPill suspended={(r as any).suspended} /></div>
                <div className="flex gap-1 shrink-0 md:justify-end">
                  <button className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors" onClick={() => openEdit(r)} title="Edit">
                    <Pencil size={14} />
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors" onClick={() => handleSuspend(r)} title={(r as any).suspended ? 'Reactivate' : 'Suspend'}>
                    {(r as any).suspended ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-red-50 text-destructive transition-colors" onClick={() => setDeleteTarget(r)} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Paginator page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Users size={16} className="text-primary" /> Add Resident</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Full Name *</Label>
                <Input name="fullName" required placeholder="e.g. Kofi Mensah" className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>Phone *</Label>
                <Input name="phone" required placeholder="e.g. 0244123456" className="rounded-xl font-mono" />
              </div>
              <div className="space-y-1">
                <Label>Estate *</Label>
                <Input
                  name="estate"
                  required
                  list="add-resident-estates"
                  placeholder="Select or type new…"
                  className="rounded-xl"
                />
                <datalist id="add-resident-estates">
                  {estateList.map(e => <option key={e} value={e} />)}
                </datalist>
                <p className="text-[11px] text-muted-foreground">Pick from list or type a new estate name.</p>
              </div>
              <div className="space-y-1">
                <Label>Block *</Label>
                <Input name="blockNumber" required placeholder="e.g. A" className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>House *</Label>
                <Input name="houseNumber" required placeholder="e.g. 12" className="rounded-xl" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Ghana GPS <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input name="ghanaGpsAddress" placeholder="e.g. GE-123-4567" className="rounded-xl" />
              </div>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
              <Button type="submit" className="rounded-xl" disabled={isAdding}>{isAdding ? <><Loader2 size={14} className="animate-spin mr-1" /> Adding…</> : 'Add Resident'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle>Edit Resident</DialogTitle></DialogHeader>
          {editTarget && (
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1"><Label>Full Name</Label><Input name="fullName" defaultValue={editTarget.fullName} required className="rounded-xl" /></div>
                <div className="space-y-1"><Label>Phone</Label><Input name="phone" defaultValue={editTarget.phone} required className="rounded-xl" /></div>
                <div className="space-y-1"><Label>Estate</Label><Input name="estate" defaultValue={editTarget.estate} required className="rounded-xl" /></div>
                <div className="space-y-1"><Label>Block</Label><Input name="blockNumber" defaultValue={editTarget.blockNumber} required className="rounded-xl" /></div>
                <div className="space-y-1"><Label>House</Label><Input name="houseNumber" defaultValue={editTarget.houseNumber} required className="rounded-xl" /></div>
                <div className="col-span-2 space-y-1"><Label>Ghana GPS (optional)</Label><Input name="ghanaGpsAddress" defaultValue={editTarget.ghanaGpsAddress ?? ''} className="rounded-xl" /></div>
                <div className="col-span-2 space-y-1">
                  <Label>Delivery Zone</Label>
                  <Select value={editZone} onValueChange={setEditZone}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Select zone…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Keep current —</SelectItem>
                      {ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                      <SelectItem value="clear">Clear zone</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Override the zone manually, or use the Auto-tag button on the card.</p>
                </div>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
                <Button type="submit" className="rounded-xl" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resident</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete <strong>{deleteTarget?.fullName}</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Vendors Tab ──────────────────────────────────────────────────────────────
function VendorsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: vendors = [], isLoading } = useListVendors();
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [pinTarget, setPinTarget] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);

  const filtered = vendors.filter(
    (v) => v.name.toLowerCase().includes(search.toLowerCase()) || (v.phone && v.phone.includes(search))
  );

  useEffect(() => { setPage(1); }, [search, viewMode]);

  const handlePhotoUpload = async (v: any, file: File) => {
    try {
      const photoUrl = await uploadPhoto(file);
      await apiFetch(`/vendors/${v.id}/photo`, { method: 'PUT', body: JSON.stringify({ photoUrl }) });
      queryClient.invalidateQueries();
      toast({ title: 'Photo updated' });
    } catch (e: any) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); }
  };

  const handlePinReset = async (v: any, pin: string) => {
    await apiFetch(`/vendors/${v.id}/reset-pin`, { method: 'PUT', body: JSON.stringify({ pin }) });
    queryClient.invalidateQueries();
  };

  const handleSuspend = async (v: any) => {
    try {
      await apiFetch(`/vendors/${v.id}/suspend`, { method: 'PUT', body: JSON.stringify({ suspended: v.isActive }) });
      queryClient.invalidateQueries();
      toast({ title: v.isActive ? 'Vendor Suspended' : 'Vendor Reactivated' });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/vendors/${deleteTarget.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries();
      toast({ title: 'Vendor Deleted' });
      setDeleteTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    const cats = (fd.get('categories') as string || '').split(',').map((c) => c.trim()).filter(Boolean);
    try {
      await apiFetch(`/vendors/${editTarget.id}`, { method: 'PUT', body: JSON.stringify({ name: fd.get('name'), phone: fd.get('phone') || null, description: fd.get('description') || null, categories: cats }) });
      queryClient.invalidateQueries();
      toast({ title: 'Vendor Updated' });
      setEditTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const pageSize = viewMode === 'grid' ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search vendors…" className="pl-9 h-9 rounded-xl text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} vendors</span>
        <ViewToggle view={viewMode} onChange={(v) => { setViewMode(v); setPage(1); }} />
      </div>

      {isLoading ? <div className="py-12 text-center text-muted-foreground">Loading…</div> : (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((v) => (
              <Card key={v.id} className={`rounded-2xl shadow-sm border-border/50 ${!v.isActive ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar name={v.name} photoUrl={(v as any).photoUrl} color="bg-amber-100 text-amber-700" />
                        <PhotoUploadButton onUpload={(file) => handlePhotoUpload(v, file)} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{v.name}</p>
                        <p className="text-xs text-muted-foreground">Vendor #{v.id}</p>
                      </div>
                    </div>
                    <StatusPill active={v.isActive} />
                  </div>
                  <div className="space-y-1.5 mb-3">
                    {v.phone && <div className="flex items-center gap-1.5 text-xs"><Phone size={11} className="text-primary" /><span className="font-mono font-medium">{v.phone}</span></div>}
                    {(v as any).description && <p className="text-xs text-muted-foreground">{(v as any).description}</p>}
                    {v.categories && v.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {v.categories.map((cat) => <span key={cat} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{cat}</span>)}
                      </div>
                    )}
                  </div>
                  <div className="mb-3 pb-3 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Key size={11} className="text-primary" />
                        <span>Login PIN: <span className="font-mono font-medium text-foreground">{(v as any).hasCustomPin ? '••••' : '5678 (default)'}</span></span>
                      </div>
                      <button onClick={() => setPinTarget(v)} className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
                        <ShieldCheck size={11} /> Reset
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 pl-4">Phone: {v.phone || 'not set'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl gap-1" onClick={() => setEditTarget({ ...v })}>
                      <Pencil size={12} /> Edit
                    </Button>
                    <Button size="sm" variant={!v.isActive ? 'default' : 'outline'}
                      className={`flex-1 h-8 text-xs rounded-xl gap-1 ${v.isActive ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : ''}`}
                      onClick={() => handleSuspend(v)}>
                      {!v.isActive ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                      {!v.isActive ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteTarget(v)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* ── List view ── */
          <div className="space-y-1.5">
            <div className="hidden md:grid grid-cols-[2.5rem_9rem_12rem_5.5rem_auto] gap-4 px-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
              <span />
              <span>Name</span>
              <span>Phone & Categories</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {paged.map((v) => (
              <div key={v.id} className={`flex items-center gap-3 md:grid md:grid-cols-[2.5rem_9rem_12rem_5.5rem_auto] md:gap-4 md:items-start px-3 py-2.5 bg-white rounded-xl border border-border/50 hover:shadow-sm transition-shadow ${!v.isActive ? 'opacity-60' : ''}`}>
                <div className="relative shrink-0">
                  <Avatar name={v.name} photoUrl={(v as any).photoUrl} color="bg-amber-100 text-amber-700" size="sm" />
                  <PhotoUploadButton onUpload={(file) => handlePhotoUpload(v, file)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{v.name}</p>
                  <p className="text-[11px] text-muted-foreground">Vendor #{v.id}</p>
                  <p className="text-[11px] text-muted-foreground truncate md:hidden">{v.phone || 'No phone'}</p>
                  <div className="md:hidden mt-0.5"><StatusPill active={v.isActive} /></div>
                </div>
                <div className="hidden md:block min-w-0 overflow-hidden">
                  <p className="text-xs font-mono truncate">{v.phone || '—'}</p>
                  <div className="flex flex-wrap gap-0.5 mt-0.5">
                    {(v.categories || []).slice(0, 3).map(c => (
                      <span key={c} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{c}</span>
                    ))}
                  </div>
                </div>
                <div className="hidden md:block overflow-hidden"><StatusPill active={v.isActive} /></div>
                <div className="flex gap-1 shrink-0 md:justify-end">
                  <button className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" onClick={() => setEditTarget({ ...v })} title="Edit"><Pencil size={14} /></button>
                  <button className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" onClick={() => setPinTarget(v)} title="Reset PIN"><ShieldCheck size={14} /></button>
                  <button className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" onClick={() => handleSuspend(v)} title={v.isActive ? 'Suspend' : 'Reactivate'}>
                    {!v.isActive ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-red-50 text-destructive" onClick={() => setDeleteTarget(v)} title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Paginator page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />

      <PinResetDialog
        open={!!pinTarget} onClose={() => setPinTarget(null)} name={pinTarget?.name ?? ''}
        onSave={(pin) => handlePinReset(pinTarget, pin)}
      />

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle>Edit Vendor</DialogTitle></DialogHeader>
          {editTarget && (
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div className="space-y-1"><Label>Name *</Label><Input name="name" defaultValue={editTarget.name} required className="rounded-xl" /></div>
              <div className="space-y-1"><Label>Phone</Label><Input name="phone" defaultValue={editTarget.phone ?? ''} className="rounded-xl" placeholder="Optional" /></div>
              <div className="space-y-1"><Label>Description / Location</Label><Input name="description" defaultValue={editTarget.description ?? ''} className="rounded-xl" placeholder="e.g. Makola Market, Stall 5" /></div>
              <div className="space-y-1"><Label>Categories (comma-separated)</Label><Input name="categories" defaultValue={(editTarget.categories || []).join(', ')} className="rounded-xl" placeholder="Vegetables, Fruits" /></div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
                <Button type="submit" className="rounded-xl" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete <strong>{deleteTarget?.name}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Riders Tab ───────────────────────────────────────────────────────────────
function RidersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: riders = [], isLoading } = useListRiders();
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [pinTarget, setPinTarget] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);

  const filtered = riders.filter(
    (r) => r.name.toLowerCase().includes(search.toLowerCase()) || r.phone.includes(search)
  );

  useEffect(() => { setPage(1); }, [search, viewMode]);

  const handlePhotoUpload = async (r: any, file: File) => {
    try {
      const photoUrl = await uploadPhoto(file);
      await apiFetch(`/riders/${r.id}/photo`, { method: 'PUT', body: JSON.stringify({ photoUrl }) });
      queryClient.invalidateQueries();
      toast({ title: 'Photo updated' });
    } catch (e: any) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); }
  };

  const handlePinReset = async (r: any, pin: string) => {
    await apiFetch(`/riders/${r.id}/reset-pin`, { method: 'PUT', body: JSON.stringify({ pin }) });
    queryClient.invalidateQueries();
  };

  const handleSuspend = async (r: any) => {
    try {
      await apiFetch(`/riders/${r.id}/suspend`, { method: 'PUT', body: JSON.stringify({ suspended: !r.suspended }) });
      queryClient.invalidateQueries();
      toast({ title: r.suspended ? 'Rider Reactivated' : 'Rider Suspended' });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/riders/${deleteTarget.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries();
      toast({ title: 'Rider Deleted' });
      setDeleteTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/riders/${editTarget.id}`, { method: 'PUT', body: JSON.stringify({ name: fd.get('name'), phone: fd.get('phone') }) });
      queryClient.invalidateQueries();
      toast({ title: 'Rider Updated' });
      setEditTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const pageSize = viewMode === 'grid' ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search riders…" className="pl-9 h-9 rounded-xl text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} riders</span>
        <ViewToggle view={viewMode} onChange={(v) => { setViewMode(v); setPage(1); }} />
      </div>

      {isLoading ? <div className="py-12 text-center text-muted-foreground">Loading…</div> : (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paged.map((r) => (
              <Card key={r.id} className={`rounded-2xl shadow-sm border-border/50 ${(r as any).suspended ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Avatar name={r.name} photoUrl={(r as any).photoUrl} color="bg-blue-100 text-blue-700" />
                        <PhotoUploadButton onUpload={(file) => handlePhotoUpload(r, file)} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{r.name}</p>
                        <p className="text-xs text-muted-foreground">Rider #{r.id}</p>
                      </div>
                    </div>
                    <StatusPill suspended={(r as any).suspended} />
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-1.5 text-xs"><Phone size={11} className="text-primary" /><span className="font-mono font-medium">{r.phone}</span></div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${r.isAvailable ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <span className="text-muted-foreground">{r.isAvailable ? 'Available' : 'On delivery'}</span>
                    </div>
                    {(r as any).createdAt && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar size={11} className="text-primary" />
                        <span>Joined {format(new Date((r as any).createdAt), 'dd MMM yyyy')}</span>
                      </div>
                    )}
                  </div>
                  <div className="mb-3 pb-3 border-b border-border/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Key size={11} className="text-primary" />
                        <span>Login PIN: <span className="font-mono font-medium text-foreground">{(r as any).hasCustomPin ? '••••' : '9012 (default)'}</span></span>
                      </div>
                      <button onClick={() => setPinTarget(r)} className="text-xs text-primary hover:underline font-medium flex items-center gap-1">
                        <ShieldCheck size={11} /> Reset
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 pl-4">Phone: {r.phone}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl gap-1" onClick={() => setEditTarget({ ...r })}>
                      <Pencil size={12} /> Edit
                    </Button>
                    <Button size="sm" variant={(r as any).suspended ? 'default' : 'outline'}
                      className={`flex-1 h-8 text-xs rounded-xl gap-1 ${!(r as any).suspended ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : ''}`}
                      onClick={() => handleSuspend(r)}>
                      {(r as any).suspended ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                      {(r as any).suspended ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteTarget(r)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          /* ── List view ── */
          <div className="space-y-1.5">
            <div className="hidden md:grid grid-cols-[2.5rem_8rem_10rem_7rem_5.5rem_auto] gap-4 px-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
              <span />
              <span>Name</span>
              <span>Phone & Availability</span>
              <span>PIN</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {paged.map((r) => (
              <div key={r.id} className={`flex items-center gap-3 md:grid md:grid-cols-[2.5rem_8rem_10rem_7rem_5.5rem_auto] md:gap-4 md:items-start px-3 py-2.5 bg-white rounded-xl border border-border/50 hover:shadow-sm transition-shadow ${(r as any).suspended ? 'opacity-60' : ''}`}>
                <div className="relative shrink-0">
                  <Avatar name={r.name} photoUrl={(r as any).photoUrl} color="bg-blue-100 text-blue-700" size="sm" />
                  <PhotoUploadButton onUpload={(file) => handlePhotoUpload(r, file)} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">Rider #{r.id} · {(r as any).createdAt ? format(new Date((r as any).createdAt), 'dd MMM yy') : ''}</p>
                  <p className="text-[11px] text-muted-foreground truncate md:hidden">{r.phone}</p>
                  <div className="flex items-center gap-1.5 mt-1 md:hidden">
                    <span className={`w-2 h-2 rounded-full ${r.isAvailable ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <StatusPill suspended={(r as any).suspended} />
                  </div>
                </div>
                <div className="hidden md:block min-w-0 overflow-hidden">
                  <p className="text-xs font-mono truncate">{r.phone}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`w-2 h-2 rounded-full ${r.isAvailable ? 'bg-green-500' : 'bg-amber-500'}`} />
                    <span className="text-[11px] text-muted-foreground">{r.isAvailable ? 'Available' : 'On delivery'}</span>
                  </div>
                </div>
                <button onClick={() => setPinTarget(r)} className="hidden md:flex text-xs text-primary hover:underline font-medium items-center gap-1 whitespace-nowrap">
                  <ShieldCheck size={11} /> {(r as any).hasCustomPin ? 'Reset PIN' : 'Set PIN'}
                </button>
                <div className="hidden md:block overflow-hidden"><StatusPill suspended={(r as any).suspended} /></div>
                <div className="flex gap-1 shrink-0 md:justify-end">
                  <button className="p-1.5 rounded-lg hover:bg-primary/10 text-primary" onClick={() => setEditTarget({ ...r })} title="Edit"><Pencil size={14} /></button>
                  <button className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" onClick={() => handleSuspend(r)} title={(r as any).suspended ? 'Reactivate' : 'Suspend'}>
                    {(r as any).suspended ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                  </button>
                  <button className="p-1.5 rounded-lg hover:bg-red-50 text-destructive" onClick={() => setDeleteTarget(r)} title="Delete"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Paginator page={page} total={filtered.length} pageSize={pageSize} onChange={setPage} />

      <PinResetDialog
        open={!!pinTarget} onClose={() => setPinTarget(null)} name={pinTarget?.name ?? ''}
        onSave={(pin) => handlePinReset(pinTarget, pin)}
      />

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Edit Rider</DialogTitle></DialogHeader>
          {editTarget && (
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div className="space-y-1"><Label>Full Name *</Label><Input name="name" defaultValue={editTarget.name} required className="rounded-xl" /></div>
              <div className="space-y-1"><Label>Phone *</Label><Input name="phone" defaultValue={editTarget.phone} required className="rounded-xl" /></div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
                <Button type="submit" className="rounded-xl" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rider</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete rider <strong>{deleteTarget?.name}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Agents Tab ───────────────────────────────────────────────────────────────
function AgentsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: agents = [], isLoading } = useQuery<any[]>({
    queryKey: ['agents'],
    queryFn: () => fetch('/api/agents').then((r) => r.json()),
  });
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [pinTarget, setPinTarget] = useState<any>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [page, setPage] = useState(1);

  const filtered = agents.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.phone.includes(search)
  );

  useEffect(() => { setPage(1); }, [search, viewMode]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['agents'] });

  const handlePhotoUpload = async (a: any, file: File) => {
    try {
      const photoUrl = await uploadPhoto(file);
      await apiFetch(`/agents/${a.id}`, { method: 'PUT', body: JSON.stringify({ photoUrl }) });
      invalidate();
      toast({ title: 'Photo updated' });
    } catch (e: any) { toast({ title: 'Upload failed', description: e.message, variant: 'destructive' }); }
  };

  const handlePinReset = async (a: any, pin: string) => {
    await apiFetch(`/agents/${a.id}/reset-pin`, { method: 'PUT', body: JSON.stringify({ pin }) });
    invalidate();
  };

  const handleToggleActive = async (a: any) => {
    try {
      await apiFetch(`/agents/${a.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !a.isActive }) });
      invalidate();
      toast({ title: a.isActive ? 'Agent Suspended' : 'Agent Reactivated' });
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/agents/${deleteTarget.id}`, { method: 'DELETE' });
      invalidate();
      toast({ title: 'Agent Deleted' });
      setDeleteTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/agents/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({ name: fd.get('name'), phone: fd.get('phone') }),
      });
      invalidate();
      toast({ title: 'Agent Updated' });
      setEditTarget(null);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch('/agents', {
        method: 'POST',
        body: JSON.stringify({ name: fd.get('name'), phone: fd.get('phone'), pin: fd.get('pin') || undefined }),
      });
      invalidate();
      toast({ title: 'Agent Created' });
      setAddOpen(false);
    } catch (e: any) { toast({ title: 'Error', description: e.message, variant: 'destructive' }); }
    finally { setIsSaving(false); }
  };

  const agentPageSize = viewMode === 'grid' ? PAGE_SIZE_GRID : PAGE_SIZE_LIST;
  const pagedAgents = filtered.slice((page - 1) * agentPageSize, page * agentPageSize);

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search agents…" className="pl-9 h-9 rounded-xl text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} agents</span>
        <ViewToggle view={viewMode} onChange={(v) => { setViewMode(v); setPage(1); }} />
        <Button size="sm" className="rounded-xl gap-1.5 ml-auto" onClick={() => setAddOpen(true)}>
          <Plus size={14} /> Add Agent
        </Button>
      </div>

      {isLoading && <div className="py-12 text-center text-muted-foreground">Loading…</div>}
      {!isLoading && filtered.length === 0 && (
        <div className="py-16 text-center text-muted-foreground">
          <Headset size={36} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No call agents yet. Click <strong>Add Agent</strong> to create one.</p>
        </div>
      )}
      {!isLoading && filtered.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pagedAgents.map((a) => (
            <Card key={a.id} className={`rounded-2xl shadow-sm border-border/50 ${!a.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Avatar name={a.name} photoUrl={a.photoUrl} color="bg-indigo-100 text-indigo-700" />
                      <PhotoUploadButton onUpload={(file) => handlePhotoUpload(a, file)} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{a.name}</p>
                      <p className="text-xs text-muted-foreground">Agent #{a.id}</p>
                    </div>
                  </div>
                  <StatusPill active={a.isActive} />
                </div>

                <div className="space-y-1.5 mb-3">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Phone size={11} className="text-indigo-500" />
                    <span className="font-mono font-medium">{a.phone}</span>
                  </div>
                  {a.createdAt && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Calendar size={11} className="text-indigo-500" />
                      <span>Added {format(new Date(a.createdAt), 'dd MMM yyyy')}</span>
                    </div>
                  )}
                </div>

                <div className="mb-3 pb-3 border-b border-border/50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Key size={11} className="text-indigo-500" />
                      <span>Login PIN: <span className="font-mono font-medium text-foreground">••••</span></span>
                    </div>
                    <button onClick={() => setPinTarget(a)} className="text-xs text-indigo-600 hover:underline font-medium flex items-center gap-1">
                      <ShieldCheck size={11} /> Reset
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 pl-4">Role: Call Center Agent</p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl gap-1" onClick={() => setEditTarget({ ...a })}>
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button size="sm" variant={!a.isActive ? 'default' : 'outline'}
                    className={`flex-1 h-8 text-xs rounded-xl gap-1 ${a.isActive ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : ''}`}
                    onClick={() => handleToggleActive(a)}>
                    {!a.isActive ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                    {!a.isActive ? 'Reactivate' : 'Suspend'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteTarget(a)}>
                    <Trash2 size={12} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!isLoading && filtered.length > 0 && viewMode !== 'grid' && (
        <div className="space-y-1">
          <div className="hidden md:grid grid-cols-[2.5rem_9rem_9rem_5.5rem_5.5rem_auto] gap-4 px-3 pb-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
            <span></span><span>Name</span><span>Phone</span><span>Status</span><span>Added</span><span></span>
          </div>
          {pagedAgents.map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 md:grid md:grid-cols-[2.5rem_9rem_9rem_5.5rem_5.5rem_auto] md:gap-4 md:items-start px-3 py-2.5 rounded-xl border border-border/50 bg-card hover:bg-muted/40 transition-colors ${!a.isActive ? 'opacity-60' : ''}`}
            >
              <div className="relative shrink-0">
                <Avatar name={a.name} photoUrl={a.photoUrl} color="bg-indigo-100 text-indigo-700" size="sm" />
                <PhotoUploadButton onUpload={(file) => handlePhotoUpload(a, file)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{a.name}</p>
                <p className="text-[11px] text-muted-foreground">Agent #{a.id}</p>
                <p className="text-[11px] text-muted-foreground truncate md:hidden">{a.phone}</p>
                <div className="md:hidden mt-0.5"><StatusPill active={a.isActive} /></div>
              </div>
              <p className="hidden md:block text-xs font-mono truncate min-w-0">{a.phone}</p>
              <div className="hidden md:block overflow-hidden"><StatusPill active={a.isActive} /></div>
              <span className="hidden md:block text-[11px] text-muted-foreground whitespace-nowrap">
                {a.createdAt ? format(new Date(a.createdAt), 'dd MMM yy') : '—'}
              </span>
              <div className="flex gap-1 shrink-0 md:justify-end">
                <button className="p-1.5 rounded-lg hover:bg-indigo-50 text-indigo-600 transition-colors" onClick={() => setEditTarget({ ...a })} title="Edit"><Pencil size={14} /></button>
                <button className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600 transition-colors" onClick={() => handleToggleActive(a)} title={a.isActive ? 'Suspend' : 'Reactivate'}>
                  {a.isActive ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                </button>
                <button className="p-1.5 rounded-lg hover:bg-red-50 text-destructive transition-colors" onClick={() => setDeleteTarget(a)} title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Paginator page={page} total={filtered.length} pageSize={agentPageSize} onChange={setPage} />

      <PinResetDialog
        open={!!pinTarget} onClose={() => setPinTarget(null)} name={pinTarget?.name ?? ''}
        onSave={(pin) => handlePinReset(pinTarget, pin)}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Headset size={16} className="text-indigo-500" /> Add Call Agent</DialogTitle></DialogHeader>
          <form onSubmit={handleAdd} className="space-y-3 pt-2">
            <div className="space-y-1"><Label>Full Name *</Label><Input name="name" required placeholder="e.g. Akosua Frimpong" className="rounded-xl" /></div>
            <div className="space-y-1"><Label>Phone *</Label><Input name="phone" required placeholder="e.g. 0244222001" className="rounded-xl font-mono" /></div>
            <div className="space-y-1">
              <Label>Initial PIN <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input name="pin" inputMode="numeric" maxLength={8} placeholder="e.g. 3456" className="rounded-xl font-mono tracking-widest" />
            </div>
            <DialogFooter className="gap-2 pt-2">
              <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
              <Button type="submit" className="rounded-xl bg-indigo-600 hover:bg-indigo-700" disabled={isSaving}>{isSaving ? 'Creating…' : 'Create Agent'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Edit Agent</DialogTitle></DialogHeader>
          {editTarget && (
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div className="space-y-1"><Label>Full Name *</Label><Input name="name" defaultValue={editTarget.name} required className="rounded-xl" /></div>
              <div className="space-y-1"><Label>Phone *</Label><Input name="phone" defaultValue={editTarget.phone} required className="rounded-xl font-mono" /></div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
                <Button type="submit" className="rounded-xl" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save Changes'}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete agent <strong>{deleteTarget?.name}</strong>? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Accountant Tab ───────────────────────────────────────────────────────────
function AccountantTab() {
  const { toast } = useToast();
  const [pinOpen, setPinOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handlePinReset(pin: string) {
    setIsSaving(true);
    try {
      const res = await apiFetch('/auth/reset-accountant-pin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      toast({ title: 'PIN Updated', description: 'Accountant PIN has been reset successfully.' });
      setPinOpen(false);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="max-w-md">
        <Card className="rounded-2xl shadow-sm border-border/50 overflow-hidden">
          <div className="h-1.5 bg-blue-600 w-full" />
          <CardContent className="p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                <Calculator size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-foreground">Accountant</p>
                <p className="text-xs text-muted-foreground">Finance &amp; Payouts Portal</p>
              </div>
            </div>

            <div className="mb-4 pb-4 border-b border-border/50 space-y-2">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone size={11} className="text-blue-500" />
                <span>Login: <span className="text-foreground font-medium">Any phone number</span></span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Key size={11} className="text-blue-500" />
                  <span>Login PIN: <span className="font-mono font-medium text-foreground">••••</span></span>
                </div>
                <button
                  onClick={() => setPinOpen(true)}
                  className="text-xs text-blue-600 hover:underline font-medium flex items-center gap-1"
                >
                  <ShieldCheck size={11} /> Reset PIN
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl bg-blue-50/60 border border-blue-100 p-3">
              <Info size={13} className="text-blue-500 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 leading-relaxed">
                The accountant role uses a single shared PIN. After resetting, share the new PIN directly with your accountant. The default PIN is <span className="font-mono font-semibold">2468</span>.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <PinResetDialog
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        name="Accountant"
        onSave={handlePinReset}
      />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const { data: residents = [] } = useListResidents();
  const { data: vendors = [] } = useListVendors();
  const { data: riders = [] } = useListRiders();
  const { data: agents = [] } = useQuery<any[]>({ queryKey: ['agents'], queryFn: () => fetch('/api/agents').then((r) => r.json()) });

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View, edit, upload photos, reset PINs, suspend or delete all users
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {[
            { icon: Users, label: 'Residents', count: residents.length, color: 'bg-green-50 text-green-700' },
            { icon: Store, label: 'Vendors', count: vendors.length, color: 'bg-amber-50 text-amber-700' },
            { icon: Truck, label: 'Riders', count: riders.length, color: 'bg-blue-50 text-blue-700' },
            { icon: Headset, label: 'Agents', count: agents.length, color: 'bg-indigo-50 text-indigo-700' },
            { icon: Calculator, label: 'Accountant', count: 1, color: 'bg-blue-50 text-blue-700' },
          ].map(({ icon: Icon, label, count, color }) => (
            <Card key={label} className="rounded-2xl shadow-sm border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${color}`}><Icon size={20} /></div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{count}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="residents">
          <TabsList className="mb-6 rounded-xl">
            <TabsTrigger value="residents" className="rounded-lg gap-2"><Users size={15} /> Residents ({residents.length})</TabsTrigger>
            <TabsTrigger value="vendors" className="rounded-lg gap-2"><Store size={15} /> Vendors ({vendors.length})</TabsTrigger>
            <TabsTrigger value="riders" className="rounded-lg gap-2"><Truck size={15} /> Riders ({riders.length})</TabsTrigger>
            <TabsTrigger value="agents" className="rounded-lg gap-2"><Headset size={15} /> Agents ({agents.length})</TabsTrigger>
            <TabsTrigger value="accountant" className="rounded-lg gap-2"><Calculator size={15} /> Accountant</TabsTrigger>
          </TabsList>
          <TabsContent value="residents"><ResidentsTab /></TabsContent>
          <TabsContent value="vendors"><VendorsTab /></TabsContent>
          <TabsContent value="riders"><RidersTab /></TabsContent>
          <TabsContent value="agents"><AgentsTab /></TabsContent>
          <TabsContent value="accountant"><AccountantTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
