import { useState, useEffect, type ReactNode, type ElementType } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useGetPricing, useUpdatePricing } from '@workspace/api-client-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Save, MapPin, Percent, Plus, Trash2, Pencil, Check, X, Layers } from 'lucide-react';

interface Zone { id: number; name: string; feeCedis: number; }
interface Town { id: number; name: string; zoneId: number | null; zoneName: string | null; feeCedis: number | null; }

const EMPTY_ZONES: Zone[] = [];
const EMPTY_TOWNS: Town[] = [];

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).message ?? 'Request failed');
    return r.json();
  });
}

function Section({ icon: Icon, title, description, children }: { icon: ElementType; title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="rounded-2xl shadow-sm border-border/50">
      <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-primary/10 text-primary"><Icon size={18} /></div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && <CardDescription className="text-xs mt-0.5">{description}</CardDescription>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">{children}</CardContent>
    </Card>
  );
}

const ZONE_BADGE_COLORS = [
  'bg-green-100 text-green-800',
  'bg-blue-100 text-blue-800',
  'bg-orange-100 text-orange-800',
  'bg-purple-100 text-purple-800',
  'bg-pink-100 text-pink-800',
  'bg-cyan-100 text-cyan-800',
];

function zoneBadgeColor(idx: number) {
  return ZONE_BADGE_COLORS[idx % ZONE_BADGE_COLORS.length];
}

export default function AdminPricing() {
  const { data: pricing, isLoading } = useGetPricing();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [deliveryFee, setDeliveryFee] = useState('');
  const [markup, setMarkup] = useState('');

  useEffect(() => {
    if (pricing) {
      setDeliveryFee(pricing.deliveryFee.toString());
      setMarkup(pricing.serviceMarkupPercent.toString());
    }
  }, [pricing]);

  const updatePricingMutation = useUpdatePricing({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['/api/pricing'] });
        toast({ title: 'Pricing Updated', description: 'Changes will reflect on new orders immediately.' });
      }
    }
  });

  const handleSavePricing = (e: React.FormEvent) => {
    e.preventDefault();
    updatePricingMutation.mutate({ data: { deliveryFee: parseFloat(deliveryFee), serviceMarkupPercent: parseFloat(markup) } });
  };

  // ── Delivery Zones ─────────────────────────────────────────────────────────
  const { data: zones = EMPTY_ZONES } = useQuery<Zone[]>({
    queryKey: ['delivery-zones'],
    queryFn: () => apiFetch('/finance/zones'),
  });

  // Per-zone fee editing state
  const [zoneFees, setZoneFees] = useState<Record<number, string>>({});
  const [zoneEditingId, setZoneEditingId] = useState<number | null>(null);
  const [zoneEditingName, setZoneEditingName] = useState('');

  useEffect(() => {
    if (zones.length === 0) return;
    const init: Record<number, string> = {};
    zones.forEach(z => { init[z.id] = z.feeCedis.toFixed(2); });
    setZoneFees(prev => {
      const next = { ...init };
      Object.keys(prev).forEach(k => { if (next[Number(k)] === undefined) delete next[Number(k)]; });
      return next;
    });
  }, [zones]);

  // New zone form
  const [newZoneName, setNewZoneName] = useState('');
  const [newZoneFee, setNewZoneFee] = useState('');

  const createZoneMutation = useMutation({
    mutationFn: (body: { name: string; feeCedis: number }) =>
      apiFetch('/finance/zones', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-zones'] });
      qc.invalidateQueries({ queryKey: ['delivery-towns'] });
      setNewZoneName(''); setNewZoneFee('');
      toast({ title: 'Zone added' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const updateZoneMutation = useMutation({
    mutationFn: ({ id, feeCedis, name }: { id: number; feeCedis?: number; name?: string }) =>
      apiFetch(`/finance/zones/${id}`, { method: 'PUT', body: JSON.stringify({ feeCedis, name }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-zones'] });
      qc.invalidateQueries({ queryKey: ['delivery-towns'] });
      setZoneEditingId(null);
      toast({ title: 'Zone updated' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const deleteZoneMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/zones/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-zones'] });
      qc.invalidateQueries({ queryKey: ['delivery-towns'] });
      toast({ title: 'Zone removed' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const handleAddZone = () => {
    const name = newZoneName.trim();
    const fee = parseFloat(newZoneFee);
    if (!name) { toast({ variant: 'destructive', title: 'Enter a zone name' }); return; }
    if (isNaN(fee) || fee < 0) { toast({ variant: 'destructive', title: 'Enter a valid delivery fee' }); return; }
    createZoneMutation.mutate({ name, feeCedis: fee });
  };

  const handleSaveZoneFee = (id: number) => {
    const fee = parseFloat(zoneFees[id] ?? '0');
    if (isNaN(fee) || fee < 0) { toast({ variant: 'destructive', title: 'Invalid fee' }); return; }
    updateZoneMutation.mutate({ id, feeCedis: fee });
  };

  const handleSaveZoneName = (id: number) => {
    const name = zoneEditingName.trim();
    if (!name) return;
    updateZoneMutation.mutate({ id, name, feeCedis: parseFloat(zoneFees[id] ?? '0') });
  };

  // ── Delivery Towns ─────────────────────────────────────────────────────────
  const { data: towns = EMPTY_TOWNS } = useQuery<Town[]>({
    queryKey: ['delivery-towns'],
    queryFn: () => apiFetch('/finance/towns'),
  });

  const [newTownName, setNewTownName] = useState('');
  const [newTownZoneId, setNewTownZoneId] = useState<string>('');
  const [editingTown, setEditingTown] = useState<{ id: number; name: string; zoneId: string } | null>(null);

  const createTownMutation = useMutation({
    mutationFn: (body: { name: string; zoneId: number | null }) =>
      apiFetch('/finance/towns', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-towns'] });
      setNewTownName(''); setNewTownZoneId('');
      toast({ title: 'Town added' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const updateTownMutation = useMutation({
    mutationFn: ({ id, name, zoneId }: { id: number; name: string; zoneId: number | null }) =>
      apiFetch(`/finance/towns/${id}`, { method: 'PUT', body: JSON.stringify({ name, zoneId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['delivery-towns'] });
      setEditingTown(null);
      toast({ title: 'Town updated' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const deleteTownMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/finance/towns/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-towns'] }); toast({ title: 'Town removed' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const handleAddTown = () => {
    if (!newTownName.trim()) { toast({ variant: 'destructive', title: 'Enter a town name' }); return; }
    createTownMutation.mutate({ name: newTownName.trim(), zoneId: newTownZoneId ? parseInt(newTownZoneId) : null });
  };

  const handleSaveEditTown = () => {
    if (!editingTown || !editingTown.name.trim()) return;
    const zoneId = editingTown.zoneId && editingTown.zoneId !== '__none__' ? parseInt(editingTown.zoneId) : null;
    updateTownMutation.mutate({ id: editingTown.id, name: editingTown.name.trim(), zoneId });
  };

  // ── Finance Settings ────────────────────────────────────────────────────────
  const { data: finSettings } = useQuery<any>({
    queryKey: ['finance-settings'],
    queryFn: () => apiFetch('/finance/settings'),
  });

  const [fs, setFs] = useState({ vendorCommissionPercent: '', riderCommissionPercent: '', courierCommissionFixed: '', distanceRateCedisPerKm: '', distanceThresholdKm: '' });

  useEffect(() => {
    if (finSettings) {
      setFs({
        vendorCommissionPercent: finSettings.vendorCommissionPercent.toString(),
        riderCommissionPercent: (finSettings.riderCommissionPercent ?? 20).toString(),
        courierCommissionFixed: finSettings.courierCommissionFixed.toString(),
        distanceRateCedisPerKm: finSettings.distanceRateCedisPerKm.toString(),
        distanceThresholdKm: finSettings.distanceThresholdKm.toString(),
      });
    }
  }, [finSettings]);

  const updateFsMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/finance/settings', { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['finance-settings'] }); toast({ title: 'Finance settings saved' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const handleSaveFs = (e: React.FormEvent) => {
    e.preventDefault();
    updateFsMutation.mutate({
      vendorCommissionPercent: parseFloat(fs.vendorCommissionPercent),
      riderCommissionPercent: parseFloat(fs.riderCommissionPercent),
      courierCommissionFixed: parseFloat(fs.courierCommissionFixed),
      distanceRateCedisPerKm: parseFloat(fs.distanceRateCedisPerKm),
      distanceThresholdKm: parseFloat(fs.distanceThresholdKm),
    });
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="space-y-6">
          <h1 className="text-3xl font-display font-bold text-foreground text-center">Pricing & Revenue Configuration</h1>

          {/* Global Fees */}
          <Section icon={Save} title="Global Fees" description="Base delivery fee (fallback) and service markup applied to all orders.">
            {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
              <form onSubmit={handleSavePricing} className="space-y-5">
                <div className="space-y-2">
                  <Label>Flat Delivery Fee (GH₵) — Fallback when no zone is matched</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-muted-foreground font-medium">₵</span>
                    <Input type="number" step="0.01" className="pl-8 h-12 rounded-xl text-lg" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Service Markup (%)</Label>
                  <div className="relative">
                    <Input type="number" step="0.1" className="pr-8 h-12 rounded-xl text-lg" value={markup} onChange={e => setMarkup(e.target.value)} required />
                    <span className="absolute right-3 top-3 text-muted-foreground font-medium">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Added to the item subtotal of every order.</p>
                </div>
                <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl" disabled={updatePricingMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" /> {updatePricingMutation.isPending ? 'Saving...' : 'Save Global Fees'}
                </Button>
              </form>
            )}
          </Section>

          {/* Delivery Zones */}
          <Section
            icon={Layers}
            title="Delivery Zones"
            description="Create zones and set a delivery fee for each. Towns are then assigned to a zone — the zone fee is automatically applied when calculating order costs."
          >
            <div className="space-y-3">
              {/* Existing zones */}
              {zones.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-3 bg-amber-50 border border-amber-100 rounded-xl">
                  No zones yet. Add your first zone below — you'll need at least one before assigning towns.
                </p>
              )}
              {zones.map((zone, idx) => (
                <div key={zone.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-border/40">
                  {zoneEditingId === zone.id ? (
                    <>
                      <Input
                        className="flex-1 h-9 rounded-lg text-sm"
                        value={zoneEditingName}
                        onChange={e => setZoneEditingName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveZoneName(zone.id)}
                        autoFocus
                      />
                      <div className="relative w-36">
                        <span className="absolute left-3 top-2 text-muted-foreground font-medium text-sm">₵</span>
                        <Input
                          type="number" step="0.01"
                          className="pl-7 h-9 rounded-lg text-sm"
                          value={zoneFees[zone.id] ?? ''}
                          onChange={e => setZoneFees(prev => ({ ...prev, [zone.id]: e.target.value }))}
                        />
                      </div>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-green-600 hover:text-green-700"
                        onClick={() => handleSaveZoneName(zone.id)} disabled={updateZoneMutation.isPending}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground"
                        onClick={() => setZoneEditingId(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Badge className={`text-xs font-semibold px-2.5 py-1 ${zoneBadgeColor(idx)}`}>{zone.name}</Badge>
                      <span className="flex-1 text-sm text-muted-foreground">Delivery fee:</span>
                      <div className="flex items-center gap-2">
                        <div className="relative w-36">
                          <span className="absolute left-3 top-2 text-muted-foreground font-medium text-sm">₵</span>
                          <Input
                            type="number" step="0.01"
                            className="pl-7 h-9 rounded-lg text-sm"
                            value={zoneFees[zone.id] ?? ''}
                            onChange={e => setZoneFees(prev => ({ ...prev, [zone.id]: e.target.value }))}
                          />
                        </div>
                        <Button size="sm" variant="outline" className="h-9 rounded-lg px-3 text-xs"
                          onClick={() => handleSaveZoneFee(zone.id)} disabled={updateZoneMutation.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => { setZoneEditingId(zone.id); setZoneEditingName(zone.name); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-red-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent className="rounded-2xl max-w-xs mx-auto">
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete "{zone.name}" zone?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Towns in this zone will become unassigned. Their delivery fee will fall back to the global flat fee.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                              <AlertDialogAction className="rounded-xl bg-red-500 hover:bg-red-600"
                                onClick={() => deleteZoneMutation.mutate(zone.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* Add new zone row */}
              <div className="pt-2 border-t border-border/40">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Add New Zone</p>
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-10 rounded-xl"
                    placeholder="Zone name (e.g. Inner Accra, Tema)"
                    value={newZoneName}
                    onChange={e => setNewZoneName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddZone()}
                  />
                  <div className="relative w-36">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium text-sm">₵</span>
                    <Input
                      type="number" step="0.01" min="0"
                      className="pl-7 h-10 rounded-xl"
                      placeholder="Fee"
                      value={newZoneFee}
                      onChange={e => setNewZoneFee(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddZone()}
                    />
                  </div>
                  <Button
                    className="h-10 gap-1.5 rounded-xl px-4 shrink-0"
                    onClick={handleAddZone}
                    disabled={createZoneMutation.isPending || !newZoneName.trim()}
                  >
                    <Plus className="w-4 h-4" /> Add Zone
                  </Button>
                </div>
              </div>
            </div>
          </Section>

          {/* Delivery Towns */}
          <Section
            icon={MapPin}
            title="Towns & Delivery Areas"
            description="Assign towns to a zone. When a resident or admin picks a town, the system automatically applies that zone's delivery fee."
          >
            <div className="space-y-3">
              {zones.length === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-start gap-2">
                  <span className="text-lg leading-none">⚠️</span>
                  <span>You need to add at least one zone above before assigning towns to it.</span>
                </div>
              )}

              {/* Town list */}
              {towns.length === 0 && zones.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No towns added yet. Add your first town below.</p>
              )}
              {towns.map((town, idx) => (
                <div key={town.id} className="flex items-center gap-3 py-2 border-b border-border/40 last:border-0">
                  {editingTown?.id === town.id ? (
                    <>
                      <Input
                        className="flex-1 h-9 rounded-lg"
                        value={editingTown.name}
                        onChange={e => setEditingTown({ ...editingTown, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handleSaveEditTown()}
                      />
                      <Select value={editingTown.zoneId} onValueChange={v => setEditingTown({ ...editingTown, zoneId: v })}>
                        <SelectTrigger className="w-44 h-9 rounded-lg"><SelectValue placeholder="Zone…" /></SelectTrigger>
                        <SelectContent position="popper">
                          <SelectItem value="__none__">— No zone —</SelectItem>
                          {zones.map(z => (
                            <SelectItem key={z.id} value={String(z.id)}>{z.name} · GH₵{z.feeCedis.toFixed(2)}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-green-600" onClick={handleSaveEditTown} disabled={updateTownMutation.isPending}>
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground" onClick={() => setEditingTown(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 font-medium text-sm">{town.name}</span>
                      {town.zoneName ? (
                        <Badge className={`text-xs font-medium ${zoneBadgeColor(zones.findIndex(z => z.id === town.zoneId))}`}>
                          {town.zoneName} · GH₵{town.feeCedis?.toFixed(2)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">No zone</Badge>
                      )}
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditingTown({ id: town.id, name: town.name, zoneId: town.zoneId ? String(town.zoneId) : '' })}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400 hover:text-red-600"
                        onClick={() => deleteTownMutation.mutate(town.id)} disabled={deleteTownMutation.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}

              {/* Add new town row */}
              <div className="pt-2 border-t border-border/40">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Add New Town</p>
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-10 rounded-xl"
                    placeholder="Town or area (e.g. Tema, East Legon)"
                    value={newTownName}
                    onChange={e => setNewTownName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddTown()}
                  />
                  <Select value={newTownZoneId} onValueChange={setNewTownZoneId}>
                    <SelectTrigger className="w-52 h-10 rounded-xl">
                      <SelectValue placeholder={zones.length === 0 ? 'Add zones first' : 'Assign zone…'} />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {zones.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-muted-foreground">No zones available — add zones above first.</div>
                      ) : zones.map(z => (
                        <SelectItem key={z.id} value={String(z.id)}>
                          {z.name} · GH₵{z.feeCedis.toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    className="h-10 gap-1.5 rounded-xl px-4 shrink-0"
                    onClick={handleAddTown}
                    disabled={createTownMutation.isPending || !newTownName.trim()}
                  >
                    <Plus className="w-4 h-4" /> Add
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Zone is optional — towns without a zone use the global flat fee as fallback.</p>
              </div>
            </div>
          </Section>

          {/* Commissions & Distance */}
          <Section icon={Percent} title="Commissions & Distance Pricing" description="Set vendor commission, courier fees, and optional km-based distance pricing.">
            <form onSubmit={handleSaveFs} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vendor Commission (%)</Label>
                  <div className="relative">
                    <Input type="number" step="0.1" min="0" max="100" className="pr-8 h-12 rounded-xl" value={fs.vendorCommissionPercent} onChange={e => setFs({ ...fs, vendorCommissionPercent: e.target.value })} required />
                    <span className="absolute right-3 top-3 text-muted-foreground font-medium">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Global default. Override per vendor in Settings. Applied to <strong>goods value (subtotal) only</strong>, never on fees or total.</p>
                </div>
                <div className="space-y-2">
                  <Label>Independent Rider Commission (%)</Label>
                  <div className="relative">
                    <Input type="number" step="0.1" min="0" max="100" className="pr-8 h-12 rounded-xl" value={fs.riderCommissionPercent} onChange={e => setFs({ ...fs, riderCommissionPercent: e.target.value })} required />
                    <span className="absolute right-3 top-3 text-muted-foreground font-medium">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">Platform's share of delivery fee for Independent riders. Remainder is paid to the rider. In-house riders are unaffected (full fee = revenue, paid via payroll).</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Courier Commission (Fixed, GH₵)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-muted-foreground font-medium">₵</span>
                    <Input type="number" step="0.01" min="0" className="pl-8 h-12 rounded-xl" value={fs.courierCommissionFixed} onChange={e => setFs({ ...fs, courierCommissionFixed: e.target.value })} required />
                  </div>
                  <p className="text-xs text-muted-foreground">Per outsourced/third-party delivery.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Distance Rate (GH₵ per km)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-3 text-muted-foreground font-medium">₵</span>
                    <Input type="number" step="0.01" min="0" className="pl-8 h-12 rounded-xl" value={fs.distanceRateCedisPerKm} onChange={e => setFs({ ...fs, distanceRateCedisPerKm: e.target.value })} required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Free Distance Threshold (km)</Label>
                  <Input type="number" step="0.1" min="0" className="h-12 rounded-xl" value={fs.distanceThresholdKm} onChange={e => setFs({ ...fs, distanceThresholdKm: e.target.value })} required />
                  <p className="text-xs text-muted-foreground">Distance rate kicks in beyond this.</p>
                </div>
              </div>
              <Button type="submit" className="w-full h-12 text-base font-bold rounded-xl" disabled={updateFsMutation.isPending}>
                <Save className="mr-2 h-4 w-4" /> {updateFsMutation.isPending ? 'Saving...' : 'Save Commission Settings'}
              </Button>
            </form>
          </Section>
        </div>
      </div>
    </div>
  );
}
