import { useState, useMemo, useEffect } from 'react';
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
  PackagePlus, Bell, Boxes, Filter, X, Tag, ImagePlus, Loader2,
  ChevronLeft, ChevronRight, Pencil,
} from 'lucide-react';

import { useToast } from '@/hooks/use-toast';

const ADMIN_PAGE_SIZE = 20;

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

const NEW_CATEGORY_VALUE = '__new__';

// ─── Add Item Dialog ──────────────────────────────────────────────────────────
function AddItemDialog({
  open, onClose, prefillName = '', onAdded,
}: { open: boolean; onClose: () => void; prefillName?: string; onAdded: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [categorySelect, setCategorySelect] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('1 unit');
  const [brands, setBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageObjectPath, setImageObjectPath] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);

  const isCustomCategory = categorySelect === NEW_CATEGORY_VALUE;
  const resolvedCategory = isCustomCategory ? newCategory.trim() : categorySelect;

  const resetForm = () => {
    setName('');
    setCategorySelect('');
    setNewCategory('');
    setPrice('');
    setUnit('1 unit');
    setBrands([]);
    setBrandInput('');
    setImagePreview(null);
    setImageObjectPath(null);
    setImageUploading(false);
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Unsupported format', description: 'Use PNG, JPG, SVG, or WebP.', variant: 'destructive' });
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    setImageUploading(true);
    try {
      const res = await apiFetch('/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      await fetch(res.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      setImageObjectPath(res.objectPath);
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload image. Try again.', variant: 'destructive' });
      setImagePreview(null);
    } finally {
      setImageUploading(false);
    }
    e.target.value = '';
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      resetForm();
      setName(prefillName);
    }
    if (!isOpen) onClose();
  };

  const addBrand = () => {
    const b = brandInput.trim();
    if (!b || brands.includes(b)) { setBrandInput(''); return; }
    setBrands(prev => [...prev, b]);
    setBrandInput('');
  };

  const removeBrand = (b: string) => setBrands(prev => prev.filter(x => x !== b));

  const handleBrandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addBrand(); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedCategory) { toast({ title: 'Select or enter a category', variant: 'destructive' }); return; }
    if (imageUploading) { toast({ title: 'Image still uploading', description: 'Please wait…', variant: 'destructive' }); return; }
    setSaving(true);
    const imageUrl = imageObjectPath ? `${BASE}/api/storage${imageObjectPath}` : undefined;
    try {
      await apiFetch('/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category: resolvedCategory, price: parseFloat(price), unit, brands, imageUrl }),
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
      <DialogContent className="rounded-2xl max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus size={16} className="text-primary" /> Add Catalogue Item
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          {/* Name */}
          <div className="space-y-1">
            <Label>Item Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Tomatoes" className="rounded-xl" />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label>Category *</Label>
            <Select value={categorySelect} onValueChange={setCategorySelect}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent position="popper">
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{CATEGORY_EMOJI[c] || '📦'} {c}</SelectItem>
                ))}
                <SelectItem value={NEW_CATEGORY_VALUE}>➕ Add new category…</SelectItem>
              </SelectContent>
            </Select>
            {isCustomCategory && (
              <Input
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="Type new category name"
                className="rounded-xl mt-1.5"
                autoFocus
                required={isCustomCategory}
              />
            )}
          </div>

          {/* Price + Unit */}
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

          {/* Brands */}
          <div className="space-y-1.5">
            <Label>Available Brands <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <p className="text-xs text-muted-foreground">Customers will pick their preferred brand when ordering.</p>
            <div className="flex gap-2">
              <Input
                value={brandInput}
                onChange={e => setBrandInput(e.target.value)}
                onKeyDown={handleBrandKeyDown}
                placeholder="e.g. Mamador, Gino… press Enter"
                className="rounded-xl flex-1"
              />
              <Button type="button" variant="outline" size="sm" className="rounded-xl shrink-0" onClick={addBrand}>
                <Plus size={14} />
              </Button>
            </div>
            {brands.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {brands.map(b => (
                  <span key={b} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full">
                    {b}
                    <button type="button" onClick={() => removeBrand(b)} className="hover:text-destructive transition-colors ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Image Upload */}
          <div className="space-y-1.5">
            <Label>Item Image <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <p className="text-xs text-muted-foreground">Upload a PNG, JPG, SVG or WebP image for visual reference.</p>
            <div className="flex items-start gap-3">
              {imagePreview ? (
                <div className="relative shrink-0">
                  <img src={imagePreview} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-border" />
                  {imageUploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                      <Loader2 size={16} className="animate-spin text-primary" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setImagePreview(null); setImageObjectPath(null); }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 border-dashed border-border bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors shrink-0">
                  <ImagePlus size={18} className="text-muted-foreground" />
                  <input type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" className="hidden" onChange={handleImagePick} />
                </label>
              )}
              {imageObjectPath && !imageUploading && (
                <p className="text-xs text-green-600 font-medium mt-1">✓ Image uploaded</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <DialogClose asChild><Button type="button" variant="outline" className="rounded-xl">Cancel</Button></DialogClose>
            <Button type="submit" className="rounded-xl bg-primary hover:bg-primary/90" disabled={saving || imageUploading}>
              {saving ? 'Adding…' : imageUploading ? 'Uploading…' : 'Add Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Item Dialog ─────────────────────────────────────────────────────────
function EditItemDialog({
  item, open, onClose, onSaved,
}: { item: any | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [categorySelect, setCategorySelect] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [price, setPrice] = useState('');
  const [unit, setUnit] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [brandInput, setBrandInput] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageObjectPath, setImageObjectPath] = useState<string | null>(null);
  const [imageCleared, setImageCleared] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  const isCustomCategory = categorySelect === NEW_CATEGORY_VALUE;
  const resolvedCategory = isCustomCategory ? newCategory.trim() : categorySelect;

  // Pre-fill form when item changes
  useEffect(() => {
    if (item && open) {
      setName(item.name ?? '');
      const knownCat = CATEGORIES.includes(item.category);
      setCategorySelect(knownCat ? item.category : NEW_CATEGORY_VALUE);
      setNewCategory(knownCat ? '' : (item.category ?? ''));
      setPrice(item.price != null ? String(item.price) : '');
      setUnit(item.unit ?? '1 unit');
      setBrands(item.brands ?? []);
      setBrandInput('');
      setImagePreview(item.imageUrl ?? null);
      setImageObjectPath(null);
      setImageCleared(false);
      setImageUploading(false);
    }
  }, [item, open]);

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      toast({ title: 'Unsupported format', description: 'Use PNG, JPG, SVG, or WebP.', variant: 'destructive' });
      return;
    }
    setImagePreview(URL.createObjectURL(file));
    setImageUploading(true);
    try {
      const res = await apiFetch('/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      await fetch(res.uploadURL, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      setImageObjectPath(res.objectPath);
      setImageCleared(false);
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload image. Try again.', variant: 'destructive' });
      setImagePreview(null);
    } finally {
      setImageUploading(false);
    }
    e.target.value = '';
  };

  const handleClearImage = () => {
    setImagePreview(null);
    setImageObjectPath(null);
    setImageCleared(true);
  };

  const addBrand = () => {
    const b = brandInput.trim();
    if (!b || brands.includes(b)) { setBrandInput(''); return; }
    setBrands(prev => [...prev, b]);
    setBrandInput('');
  };

  const removeBrand = (b: string) => setBrands(prev => prev.filter(x => x !== b));

  const handleBrandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addBrand(); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedCategory) { toast({ title: 'Select or enter a category', variant: 'destructive' }); return; }
    if (imageUploading) { toast({ title: 'Image still uploading', description: 'Please wait…', variant: 'destructive' }); return; }
    setSaving(true);

    let imageUrl: string | null | undefined;
    if (imageObjectPath) {
      imageUrl = `${BASE}/api/storage${imageObjectPath}`;
    } else if (imageCleared) {
      imageUrl = null;
    } else {
      imageUrl = item?.imageUrl ?? null;
    }

    try {
      await apiFetch(`/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          category: resolvedCategory,
          price: parseFloat(price),
          unit,
          brands,
          imageUrl,
        }),
      });
      toast({ title: 'Item updated', description: `"${name}" has been saved.` });
      onSaved();
      onClose();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="rounded-2xl max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil size={16} className="text-primary" /> Edit Item
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-2">
          {/* Name */}
          <div className="space-y-1">
            <Label>Item Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Tomatoes" className="rounded-xl" />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <Label>Category *</Label>
            <Select value={categorySelect} onValueChange={setCategorySelect}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent position="popper">
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{CATEGORY_EMOJI[c] || '📦'} {c}</SelectItem>
                ))}
                <SelectItem value={NEW_CATEGORY_VALUE}>➕ Add new category…</SelectItem>
              </SelectContent>
            </Select>
            {isCustomCategory && (
              <Input
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="Type new category name"
                className="rounded-xl mt-1.5"
                autoFocus
                required={isCustomCategory}
              />
            )}
          </div>

          {/* Price + Unit */}
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

          {/* Brands */}
          <div className="space-y-1.5">
            <Label>Available Brands <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex gap-2">
              <Input
                value={brandInput}
                onChange={e => setBrandInput(e.target.value)}
                onKeyDown={handleBrandKeyDown}
                placeholder="e.g. Mamador, Gino… press Enter"
                className="rounded-xl flex-1"
              />
              <Button type="button" variant="outline" size="sm" className="rounded-xl shrink-0" onClick={addBrand}>
                <Plus size={14} />
              </Button>
            </div>
            {brands.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {brands.map(b => (
                  <span key={b} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full">
                    {b}
                    <button type="button" onClick={() => removeBrand(b)} className="hover:text-destructive transition-colors ml-0.5">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Image */}
          <div className="space-y-1.5">
            <Label>Item Image <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex items-start gap-3">
              {imagePreview ? (
                <div className="relative shrink-0">
                  <img src={imagePreview} alt="Preview" className="w-16 h-16 rounded-xl object-cover border border-border" />
                  {imageUploading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center rounded-xl">
                      <Loader2 size={16} className="animate-spin text-primary" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleClearImage}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center"
                  >
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 border-dashed border-border bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors shrink-0">
                  <ImagePlus size={18} className="text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground mt-0.5">Upload</span>
                  <input type="file" accept="image/png,image/jpeg,image/jpg,image/svg+xml,image/webp" className="hidden" onChange={handleImagePick} />
                </label>
              )}
              {imageObjectPath && !imageUploading && (
                <p className="text-xs text-green-600 font-medium mt-1">✓ New image uploaded</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="rounded-xl">Cancel</Button>
            </DialogClose>
            <Button type="submit" className="rounded-xl bg-primary hover:bg-primary/90" disabled={saving || imageUploading}>
              {saving ? 'Saving…' : imageUploading ? 'Uploading…' : 'Save Changes'}
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
  const [editTarget, setEditTarget] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => items.filter(i => {
    const matchCat = filterCat === 'All' || i.category === filterCat;
    const matchSearch = i.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  }), [items, search, filterCat]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, filterCat]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ADMIN_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedItems = filtered.slice((safePage - 1) * ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE);

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
        {totalPages > 1 && (
          <span className="ml-auto">Page <strong className="text-foreground">{safePage}</strong> of {totalPages}</span>
        )}
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
                <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Brands</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Unit</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide text-right">Price</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {pagedItems.map((item: any) => (
                <tr key={item.id} className="bg-white hover:bg-secondary/30 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2.5">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} loading="lazy" className="w-8 h-8 rounded-lg object-cover border border-border shrink-0" />
                      ) : (
                        <span className="text-xl leading-none">{CATEGORY_EMOJI[item.category] || '📦'}</span>
                      )}
                      <span>{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.category}</td>
                  <td className="px-4 py-3">
                    {item.brands && item.brands.length > 0 ? (
                      <div className="flex flex-wrap gap-1 max-w-[180px]">
                        {item.brands.slice(0, 3).map((b: string) => (
                          <span key={b} className="inline-flex items-center gap-0.5 bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                            <Tag size={9} className="shrink-0" /> {b}
                          </span>
                        ))}
                        {item.brands.length > 3 && (
                          <span className="text-xs text-muted-foreground">+{item.brands.length - 3} more</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50 italic">None</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{item.unit}</td>
                  <td className="px-4 py-3 font-mono text-right font-semibold">GHs {item.price.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditTarget(item)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Edit item"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(item)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete item"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <Button
            variant="outline" size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage === 1}
          >
            <ChevronLeft size={15} /> Previous
          </Button>
          <span className="text-sm text-muted-foreground font-medium">
            {safePage} / {totalPages}
          </span>
          <Button
            variant="outline" size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
          >
            Next <ChevronRight size={15} />
          </Button>
        </div>
      )}

      <AddItemDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={() => qc.invalidateQueries({ queryKey: ['items'] })} />

      <EditItemDialog
        item={editTarget}
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ['items'] })}
      />

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
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
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
