import { useState, useMemo } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ShoppingBasket, Plus, Trash2, Search, CheckCircle2, XCircle,
  PackagePlus, Bell, Boxes, Filter,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}/api${path}`, options);
  if (!res.ok) throw new Error((await res.json()).message || 'Request failed');
  return res.json();
}

const CATEGORIES = [
  'Vegetables', 'Fruits', 'Meat', 'Dairy', 'Bakery',
  'Beverages', 'Grains & Cereals', 'Condiments', 'Snacks', 'Household', 'Other',
];

const CATEGORY_EMOJI: Record<string, string> = {
  Vegetables: '🥦', Fruits: '🍎', Meat: '🥩', Dairy: '🥛',
  Bakery: '🍞', Beverages: '🧃', 'Grains & Cereals': '🌾',
  Condiments: '🧴', Snacks: '🍿', Household: '🧹', Other: '📦',
};

const STATUS_BADGE: Record<string, { label: string; variant: any; color: string }> = {
  pending:  { label: 'Pending',  variant: 'outline', color: 'text-amber-600 border-amber-300 bg-amber-50' },
  added:    { label: 'Added',    variant: 'outline', color: 'text-green-700 border-green-300 bg-green-50' },
  rejected: { label: 'Rejected', variant: 'outline', color: 'text-red-600 border-red-300 bg-red-50' },
};

// ─── Add Item Dialog ──────────────────────────────────────────────────────────
function AddItemDialog({
  open, onClose, prefillName = '', onAdded,
}: { open: boolean; onClose: () => void; prefillName?: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('1 unit');

  // When dialog opens (especially from a request), prefill the name
  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setName(prefillName);
      setCategory('');
      setPrice('');
      setUnit('1 unit');
    }
    if (!isOpen) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) { toast({ title: 'Select a category', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await apiFetch('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, price: parseFloat(price), unit }),
      });
      toast({ title: 'Item added', description: `"${name}" is now in the catalogue.` });
      onAdded();
      onClose();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus size={16} className="text-primary" /> Add Catalogue Item
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          <div className="space-y-1">
            <Label>Item Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Tomatoes" className="rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label>Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent position="popper">
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{CATEGORY_EMOJI[c] || '📦'} {c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Price (GHs) *</Label>
              <Input value={price} onChange={e => setPrice(e.target.value)} required type="number" min="0.01" step="0.01" placeholder="0.00" className="rounded-xl font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Unit</Label>
              <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="1 kg" className="rounded-xl" />
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
            <Button type="submit" className="rounded-xl bg-primary hover:bg-primary/90" disabled={saving}>
              {saving ? 'Adding…' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Catalogue Tab ────────────────────────────────────────────────────────────
function CatalogueTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: items = [], isLoading } = useQuery<any[]>({
    queryKey: ['items'],
    queryFn: () => apiFetch('/items'),
  });

  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('All');
  const [addOpen, setAddOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filtered = useMemo(() => items.filter(i => {
    const matchCat = filterCat === 'All' || i.category === filterCat;
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [items, search, filterCat]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await apiFetch(`/items/${deleteTarget.id}`, { method: 'DELETE' });
      toast({ title: 'Item removed', description: `"${deleteTarget.name}" deleted from catalogue.` });
      qc.invalidateQueries({ queryKey: ['items'] });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const allCats = ['All', ...CATEGORIES];

  return (
    <>
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search items…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 rounded-xl h-9" />
        </div>
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted-foreground shrink-0" />
          <Select value={filterCat} onValueChange={setFilterCat}>
            <SelectTrigger className="rounded-xl h-9 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {allCats.map(c => <SelectItem key={c} value={c}>{c === 'All' ? '📋 All Categories' : `${CATEGORY_EMOJI[c] || '📦'} ${c}`}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" className="rounded-xl h-9 gap-1.5 bg-primary hover:bg-primary/90" onClick={() => setAddOpen(true)}>
            <Plus size={14} /> Add Item
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4 text-sm text-muted-foreground">
        <span><strong className="text-foreground">{items.length}</strong> total items</span>
        <span>·</span>
        <span><strong className="text-foreground">{filtered.length}</strong> shown</span>
        {filterCat !== 'All' && <Badge variant="outline" className="text-xs">{filterCat}</Badge>}
      </div>

      {/* Items table */}
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading catalogue…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Boxes size={40} className="mx-auto mb-3 opacity-20" />
          <p>No items found.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50 text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Item</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Category</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Unit</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-right">Price</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {filtered.map((item: any) => (
                <tr key={item.id} className="bg-white hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <span className="mr-2">{CATEGORY_EMOJI[item.category] || '📦'}</span>{item.name}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                  <td className="px-4 py-3 font-mono text-right font-semibold">GHs {item.price.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setDeleteTarget(item)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddItemDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => qc.invalidateQueries({ queryKey: ['items'] })} />

      <AlertDialog open={!!deleteTarget} onOpenChange={o => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Item</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove <strong>{deleteTarget?.name}</strong> from the catalogue? Existing orders won't be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-xl bg-destructive hover:bg-destructive/90" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Removing…' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────
function RequestsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: requests = [], isLoading } = useQuery<any[]>({
    queryKey: ['item-requests'],
    queryFn: () => apiFetch('/items/requests'),
    refetchInterval: 30000,
  });

  const [addFromRequest, setAddFromRequest] = useState<any>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const pending = requests.filter((r: any) => r.status === 'pending');
  const done = requests.filter((r: any) => r.status !== 'pending');

  const markStatus = async (id: number, status: 'rejected' | 'added') => {
    setProcessingId(id);
    try {
      await apiFetch(`/items/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      qc.invalidateQueries({ queryKey: ['item-requests'] });
      if (status === 'rejected') toast({ title: 'Request dismissed' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddToCatalogue = (req: any) => {
    setAddFromRequest(req);
  };

  const handleAddedFromRequest = async () => {
    if (addFromRequest) {
      await markStatus(addFromRequest.id, 'added');
      qc.invalidateQueries({ queryKey: ['items'] });
    }
    setAddFromRequest(null);
  };

  const RequestCard = ({ req }: { req: any }) => {
    const st = STATUS_BADGE[req.status] || STATUS_BADGE.pending;
    const isPending = req.status === 'pending';
    return (
      <Card className="rounded-2xl border border-border/50 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div>
              <p className="font-semibold text-foreground">{req.itemName}</p>
              {req.description && <p className="text-xs text-muted-foreground mt-0.5">{req.description}</p>}
            </div>
            <Badge variant="outline" className={`text-xs shrink-0 ${st.color}`}>{st.label}</Badge>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              By <span className="font-medium text-foreground">{req.residentName || 'Resident'}</span>
              <span className="mx-1.5">·</span>
              {new Date(req.createdAt).toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
            {isPending && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={processingId === req.id}
                  onClick={() => markStatus(req.id, 'rejected')}
                >
                  <XCircle size={12} className="mr-1" /> Dismiss
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs rounded-lg bg-primary hover:bg-primary/90"
                  disabled={processingId === req.id}
                  onClick={() => handleAddToCatalogue(req)}
                >
                  <CheckCircle2 size={12} className="mr-1" /> Add to Catalogue
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      {isLoading ? (
        <div className="text-center py-16 text-muted-foreground">Loading requests…</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Bell size={40} className="mx-auto mb-3 opacity-20" />
          <p className="font-medium">No item requests yet.</p>
          <p className="text-xs mt-1">When subscribers request items not in the catalogue, they'll appear here.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-semibold text-sm">Pending Requests</h3>
                <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">{pending.length}</Badge>
              </div>
              <div className="space-y-3">
                {pending.map((r: any) => <RequestCard key={r.id} req={r} />)}
              </div>
            </div>
          )}
          {done.length > 0 && (
            <div>
              <h3 className="font-semibold text-sm mb-3 text-muted-foreground">Past Requests</h3>
              <div className="space-y-3">
                {done.map((r: any) => <RequestCard key={r.id} req={r} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <AddItemDialog
        open={!!addFromRequest}
        prefillName={addFromRequest?.itemName || ''}
        onClose={() => setAddFromRequest(null)}
        onAdded={handleAddedFromRequest}
      />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdminCatalogue() {
  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ['item-requests'],
    queryFn: () => fetch(`${BASE}/api/items/requests`).then(r => r.json()),
    refetchInterval: 30000,
  });
  const { data: items = [] } = useQuery<any[]>({
    queryKey: ['items'],
    queryFn: () => fetch(`${BASE}/api/items`).then(r => r.json()),
  });

  const pendingCount = (requests as any[]).filter((r: any) => r.status === 'pending').length;

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
              <ShoppingBasket size={26} className="text-primary" /> Item Catalogue
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Manage all grocery items available to subscribers, and review their special requests.
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
            <Card className="rounded-2xl shadow-sm border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-green-50 text-green-700"><Boxes size={20} /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Items</p>
                  <p className="text-2xl font-bold">{(items as any[]).length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm border-border/50">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700"><Bell size={20} /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Pending Requests</p>
                  <p className="text-2xl font-bold">{pendingCount}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl shadow-sm border-border/50 col-span-2 md:col-span-1">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700"><Filter size={20} /></div>
                <div>
                  <p className="text-xs text-muted-foreground">Categories</p>
                  <p className="text-2xl font-bold">
                    {new Set((items as any[]).map((i: any) => i.category)).size}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="catalogue">
            <TabsList className="mb-6 rounded-xl">
              <TabsTrigger value="catalogue" className="rounded-lg gap-2">
                <Boxes size={15} /> All Items ({(items as any[]).length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="rounded-lg gap-2 relative">
                <Bell size={15} /> Item Requests
                {pendingCount > 0 && (
                  <span className="ml-1 bg-amber-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 leading-none">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="catalogue"><CatalogueTab /></TabsContent>
            <TabsContent value="requests"><RequestsTab /></TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
