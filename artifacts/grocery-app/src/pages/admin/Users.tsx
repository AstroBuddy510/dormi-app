import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useListResidents, useListVendors, useListRiders } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
} from 'lucide-react';
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

function StatusPill({ active, suspended }: { active?: boolean; suspended?: boolean }) {
  const isSuspended = suspended === true || active === false;
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${
        isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
      }`}
    >
      {isSuspended ? <UserX size={11} /> : <UserCheck size={11} />}
      {isSuspended ? 'Suspended' : 'Active'}
    </span>
  );
}

function LoginBadge({ role, pin }: { role: string; pin: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Key size={11} className="text-primary" />
      <span>
        Login: <span className="font-mono font-medium text-foreground">{role === 'resident' ? 'Phone only' : `PIN: ${pin}`}</span>
      </span>
    </div>
  );
}

// ─── Residents Tab ────────────────────────────────────────────────────────────
function ResidentsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: residents = [], isLoading } = useListResidents();
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filtered = residents.filter(
    (r) =>
      r.fullName.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.includes(search) ||
      r.estate.toLowerCase().includes(search.toLowerCase())
  );

  const handleSuspend = async (r: any) => {
    try {
      await apiFetch(`/residents/${r.id}/suspend`, {
        method: 'PUT',
        body: JSON.stringify({ suspended: !r.suspended }),
      });
      queryClient.invalidateQueries();
      toast({ title: r.suspended ? 'Resident Reactivated' : 'Resident Suspended' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/residents/${deleteTarget.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries();
      toast({ title: 'Resident Deleted' });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/residents/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          fullName: fd.get('fullName'),
          phone: fd.get('phone'),
          estate: fd.get('estate'),
          blockNumber: fd.get('blockNumber'),
          houseNumber: fd.get('houseNumber'),
          ghanaGpsAddress: fd.get('ghanaGpsAddress') || undefined,
        }),
      });
      queryClient.invalidateQueries();
      toast({ title: 'Resident Updated' });
      setEditTarget(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone or estate…"
            className="pl-9 h-9 rounded-xl text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} residents</span>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Users size={36} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No residents found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => (
            <Card key={r.id} className={`rounded-2xl shadow-sm border-border/50 ${r.suspended ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                      {r.fullName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{r.fullName}</p>
                      <p className="text-xs text-muted-foreground">ID #{r.id}</p>
                    </div>
                  </div>
                  <StatusPill suspended={r.suspended} />
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
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="w-3" />
                      <span className="font-mono">{r.ghanaGpsAddress}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar size={11} className="text-primary" />
                    <span>Joined {format(new Date(r.createdAt), 'dd MMM yyyy')}</span>
                  </div>
                  {r.subscribeWeekly && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      📅 Friday Subscriber
                    </span>
                  )}
                </div>

                <div className="mb-3 pb-3 border-b border-border/50">
                  <LoginBadge role="resident" pin="" />
                  <p className="text-xs text-muted-foreground mt-0.5 pl-4">Uses phone number to log in</p>
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 h-8 text-xs rounded-xl gap-1"
                    onClick={() => setEditTarget({ ...r })}
                  >
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={r.suspended ? 'default' : 'outline'}
                    className={`flex-1 h-8 text-xs rounded-xl gap-1 ${!r.suspended ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : ''}`}
                    onClick={() => handleSuspend(r)}
                  >
                    {r.suspended ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                    {r.suspended ? 'Reactivate' : 'Suspend'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10"
                    onClick={() => setDeleteTarget(r)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Resident</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Full Name</Label>
                  <Input name="fullName" defaultValue={editTarget.fullName} required className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input name="phone" defaultValue={editTarget.phone} required className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>Estate</Label>
                  <Input name="estate" defaultValue={editTarget.estate} required className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>Block Number</Label>
                  <Input name="blockNumber" defaultValue={editTarget.blockNumber} required className="rounded-xl" />
                </div>
                <div className="space-y-1">
                  <Label>House Number</Label>
                  <Input name="houseNumber" defaultValue={editTarget.houseNumber} required className="rounded-xl" />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Ghana GPS Address</Label>
                  <Input name="ghanaGpsAddress" defaultValue={editTarget.ghanaGpsAddress ?? ''} className="rounded-xl" placeholder="Optional" />
                </div>
              </div>
              <DialogFooter className="gap-2 pt-2">
                <DialogClose asChild>
                  <Button type="button" variant="outline" className="rounded-xl">Cancel</Button>
                </DialogClose>
                <Button type="submit" className="rounded-xl" disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Resident</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{deleteTarget?.fullName}</strong>? This cannot be undone and will remove all their orders too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive hover:bg-destructive/90" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
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
  const [isSaving, setIsSaving] = useState(false);

  const filtered = vendors.filter(
    (v) =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.phone && v.phone.includes(search))
  );

  const handleSuspend = async (v: any) => {
    try {
      await apiFetch(`/vendors/${v.id}/suspend`, {
        method: 'PUT',
        body: JSON.stringify({ suspended: v.isActive }),
      });
      queryClient.invalidateQueries();
      toast({ title: v.isActive ? 'Vendor Suspended' : 'Vendor Reactivated' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/vendors/${deleteTarget.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries();
      toast({ title: 'Vendor Deleted' });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    const categoriesRaw = (fd.get('categories') as string) || '';
    const categories = categoriesRaw.split(',').map((c) => c.trim()).filter(Boolean);
    try {
      await apiFetch(`/vendors/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: fd.get('name'),
          phone: fd.get('phone') || null,
          description: fd.get('description') || null,
          categories,
        }),
      });
      queryClient.invalidateQueries();
      toast({ title: 'Vendor Updated' });
      setEditTarget(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search vendors…"
            className="pl-9 h-9 rounded-xl text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} vendors</span>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((v) => (
            <Card key={v.id} className={`rounded-2xl shadow-sm border-border/50 ${!v.isActive ? 'opacity-60' : ''}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                      <Store size={16} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{v.name}</p>
                      <p className="text-xs text-muted-foreground">Vendor ID #{v.id}</p>
                    </div>
                  </div>
                  <StatusPill active={v.isActive} />
                </div>

                <div className="space-y-1.5 mb-3">
                  {v.phone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone size={11} className="text-primary" />
                      <span className="font-mono font-medium text-foreground">{v.phone}</span>
                    </div>
                  )}
                  {v.description && (
                    <p className="text-xs text-muted-foreground">{v.description}</p>
                  )}
                  {v.categories && v.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {v.categories.map((cat) => (
                        <span key={cat} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          {cat}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mb-3 pb-3 border-b border-border/50">
                  <LoginBadge role="vendor" pin="5678" />
                  <p className="text-xs text-muted-foreground mt-0.5 pl-4">
                    Login: {v.phone || 'No phone set'} + PIN 5678
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl gap-1" onClick={() => setEditTarget({ ...v })}>
                    <Pencil size={12} /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant={!v.isActive ? 'default' : 'outline'}
                    className={`flex-1 h-8 text-xs rounded-xl gap-1 ${v.isActive ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : ''}`}
                    onClick={() => handleSuspend(v)}
                  >
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
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader><DialogTitle>Edit Vendor</DialogTitle></DialogHeader>
          {editTarget && (
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label>Name *</Label>
                <Input name="name" defaultValue={editTarget.name} required className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input name="phone" defaultValue={editTarget.phone ?? ''} className="rounded-xl" placeholder="Optional" />
              </div>
              <div className="space-y-1">
                <Label>Description / Location</Label>
                <Input name="description" defaultValue={editTarget.description ?? ''} className="rounded-xl" placeholder="e.g. Makola Market, Stall 5" />
              </div>
              <div className="space-y-1">
                <Label>Categories (comma-separated)</Label>
                <Input name="categories" defaultValue={(editTarget.categories || []).join(', ')} className="rounded-xl" placeholder="Vegetables, Fruits, Meat" />
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
            <AlertDialogTitle>Delete Vendor</AlertDialogTitle>
            <AlertDialogDescription>Permanently delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.</AlertDialogDescription>
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
  const [isSaving, setIsSaving] = useState(false);

  const filtered = riders.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.phone.includes(search)
  );

  const handleSuspend = async (r: any) => {
    try {
      await apiFetch(`/riders/${r.id}/suspend`, {
        method: 'PUT',
        body: JSON.stringify({ suspended: !(r as any).suspended }),
      });
      queryClient.invalidateQueries();
      toast({ title: (r as any).suspended ? 'Rider Reactivated' : 'Rider Suspended' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/riders/${deleteTarget.id}`, { method: 'DELETE' });
      queryClient.invalidateQueries();
      toast({ title: 'Rider Deleted' });
      setDeleteTarget(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    const fd = new FormData(e.currentTarget);
    try {
      await apiFetch(`/riders/${editTarget.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: fd.get('name'),
          phone: fd.get('phone'),
        }),
      });
      queryClient.invalidateQueries();
      toast({ title: 'Rider Updated' });
      setEditTarget(null);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search riders…"
            className="pl-9 h-9 rounded-xl text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} riders</span>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((r) => {
            const rAny = r as any;
            return (
              <Card key={r.id} className={`rounded-2xl shadow-sm border-border/50 ${rAny.suspended ? 'opacity-60' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                        <Truck size={16} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{r.name}</p>
                        <p className="text-xs text-muted-foreground">Rider ID #{r.id}</p>
                      </div>
                    </div>
                    <StatusPill suspended={rAny.suspended} />
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone size={11} className="text-primary" />
                      <span className="font-mono font-medium text-foreground">{r.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className={`w-2 h-2 rounded-full ${r.isAvailable ? 'bg-green-500' : 'bg-amber-500'}`} />
                      <span className="text-muted-foreground">{r.isAvailable ? 'Available' : 'On delivery'}</span>
                    </div>
                    {rAny.createdAt && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar size={11} className="text-primary" />
                        <span>Joined {format(new Date(rAny.createdAt), 'dd MMM yyyy')}</span>
                      </div>
                    )}
                  </div>

                  <div className="mb-3 pb-3 border-b border-border/50">
                    <LoginBadge role="rider" pin="9012" />
                    <p className="text-xs text-muted-foreground mt-0.5 pl-4">
                      Login: {r.phone} + PIN 9012
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1 h-8 text-xs rounded-xl gap-1" onClick={() => setEditTarget({ ...r })}>
                      <Pencil size={12} /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={rAny.suspended ? 'default' : 'outline'}
                      className={`flex-1 h-8 text-xs rounded-xl gap-1 ${!rAny.suspended ? 'text-amber-600 border-amber-200 hover:bg-amber-50' : ''}`}
                      onClick={() => handleSuspend(r)}
                    >
                      {rAny.suspended ? <PlayCircle size={12} /> : <PauseCircle size={12} />}
                      {rAny.suspended ? 'Reactivate' : 'Suspend'}
                    </Button>
                    <Button size="sm" variant="outline" className="h-8 text-xs rounded-xl text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => setDeleteTarget(r)}>
                      <Trash2 size={12} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader><DialogTitle>Edit Rider</DialogTitle></DialogHeader>
          {editTarget && (
            <form onSubmit={handleSave} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label>Full Name *</Label>
                <Input name="name" defaultValue={editTarget.name} required className="rounded-xl" />
              </div>
              <div className="space-y-1">
                <Label>Phone *</Label>
                <Input name="phone" defaultValue={editTarget.phone} required className="rounded-xl" />
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminUsers() {
  const { data: residents = [] } = useListResidents();
  const { data: vendors = [] } = useListVendors();
  const { data: riders = [] } = useListRiders();

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">User Management</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            View, edit, suspend or delete all users across roles
          </p>
        </div>

        {/* Summary Row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { icon: Users, label: 'Residents', count: residents.length, color: 'bg-green-50 text-green-700' },
            { icon: Store, label: 'Vendors', count: vendors.length, color: 'bg-amber-50 text-amber-700' },
            { icon: Truck, label: 'Riders', count: riders.length, color: 'bg-blue-50 text-blue-700' },
          ].map(({ icon: Icon, label, count, color }) => (
            <Card key={label} className="rounded-2xl shadow-sm border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${color}`}>
                  <Icon size={20} />
                </div>
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
            <TabsTrigger value="residents" className="rounded-lg gap-2">
              <Users size={15} /> Residents ({residents.length})
            </TabsTrigger>
            <TabsTrigger value="vendors" className="rounded-lg gap-2">
              <Store size={15} /> Vendors ({vendors.length})
            </TabsTrigger>
            <TabsTrigger value="riders" className="rounded-lg gap-2">
              <Truck size={15} /> Riders ({riders.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="residents"><ResidentsTab /></TabsContent>
          <TabsContent value="vendors"><VendorsTab /></TabsContent>
          <TabsContent value="riders"><RidersTab /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
