import { useState, useEffect } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useGetPricing, useUpdatePricing } from '@workspace/api-client-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, MapPin, Percent, Truck, Settings2 } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).message ?? 'Request failed');
    return r.json();
  });
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
  const { data: zones = [] } = useQuery<any[]>({
    queryKey: ['delivery-zones'],
    queryFn: () => apiFetch('/finance/zones'),
  });

  const [zoneFees, setZoneFees] = useState<Record<number, string>>({});

  useEffect(() => {
    const init: Record<number, string> = {};
    (zones as any[]).forEach(z => { init[z.id] = z.feeCedis.toFixed(2); });
    setZoneFees(init);
  }, [zones]);

  const updateZoneMutation = useMutation({
    mutationFn: ({ id, feeCedis }: { id: number; feeCedis: number }) =>
      apiFetch(`/finance/zones/${id}`, { method: 'PUT', body: JSON.stringify({ feeCedis }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-zones'] }); toast({ title: 'Zone fee updated' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const saveZone = (id: number) => {
    const fee = parseFloat(zoneFees[id] ?? '0');
    if (isNaN(fee) || fee < 0) { toast({ variant: 'destructive', title: 'Invalid fee' }); return; }
    updateZoneMutation.mutate({ id, feeCedis: fee });
  };

  // ── Finance Settings (commissions + distance) ─────────────────────────────
  const { data: finSettings } = useQuery<any>({
    queryKey: ['finance-settings'],
    queryFn: () => apiFetch('/finance/settings'),
  });

  const [fs, setFs] = useState({ vendorCommissionPercent: '', courierCommissionFixed: '', distanceRateCedisPerKm: '', distanceThresholdKm: '' });

  useEffect(() => {
    if (finSettings) {
      setFs({
        vendorCommissionPercent: finSettings.vendorCommissionPercent.toString(),
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
      courierCommissionFixed: parseFloat(fs.courierCommissionFixed),
      distanceRateCedisPerKm: parseFloat(fs.distanceRateCedisPerKm),
      distanceThresholdKm: parseFloat(fs.distanceThresholdKm),
    });
  };

  const Section = ({ icon: Icon, title, description, children }: any) => (
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

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 overflow-auto py-8 px-12">
        <div className="max-w-3xl mx-auto space-y-6">
          <h1 className="text-3xl font-display font-bold text-foreground text-center">Pricing & Revenue Configuration</h1>

          {/* Global Fees */}
          <Section icon={Save} title="Global Fees" description="Base delivery fee and service markup applied to all orders.">
            {isLoading ? <p className="text-muted-foreground text-sm">Loading...</p> : (
              <form onSubmit={handleSavePricing} className="space-y-5">
                <div className="space-y-2">
                  <Label>Flat Delivery Fee (GH₵) — Fallback if no zone is set</Label>
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
          <Section icon={MapPin} title="Delivery Zone Fees" description="Set the delivery fee for each zone. Residents are tagged to a zone from their Ghana GPS address.">
            <div className="space-y-4">
              {(zones as any[]).map(zone => (
                <div key={zone.id} className="flex items-center gap-3">
                  <div className="flex-1">
                    <Label className="text-sm font-medium">{zone.name}</Label>
                  </div>
                  <div className="relative w-40">
                    <span className="absolute left-3 top-2.5 text-muted-foreground font-medium text-sm">₵</span>
                    <Input
                      type="number"
                      step="0.01"
                      className="pl-7 h-10 rounded-xl"
                      value={zoneFees[zone.id] ?? ''}
                      onChange={e => setZoneFees(prev => ({ ...prev, [zone.id]: e.target.value }))}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-xl h-10"
                    onClick={() => saveZone(zone.id)}
                    disabled={updateZoneMutation.isPending}
                  >
                    Save
                  </Button>
                </div>
              ))}
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
                  <p className="text-xs text-muted-foreground">Global default. Override per vendor in Settings.</p>
                </div>
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
