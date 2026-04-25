import { useState, useEffect } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Receipt, Save, Info, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface TaxSetting {
  id: number;
  code: string;
  name: string;
  rate: number;          // decimal fraction
  ratePercent: number;   // human-readable %
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).message ?? 'Request failed');
    return r.json();
  });
}

const EMPTY: TaxSetting[] = [];

export default function AdminTaxSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: taxes = EMPTY, isLoading } = useQuery<TaxSetting[]>({
    queryKey: ['tax-settings'],
    queryFn: () => apiFetch('/tax-settings'),
  });

  // Local edit state for the percent inputs (so the user can type freely
  // without each keystroke firing a PUT).
  const [pctDraft, setPctDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    taxes.forEach(t => { next[t.code] = t.ratePercent.toString(); });
    setPctDraft(prev => {
      // Preserve any in-flight edits the user has typed; only seed new codes.
      const merged = { ...next };
      Object.keys(prev).forEach(k => { if (prev[k] !== undefined) merged[k] = prev[k]; });
      return merged;
    });
  }, [taxes]);

  const updateMutation = useMutation({
    mutationFn: ({ code, body }: { code: string; body: { rate?: number; enabled?: boolean } }) =>
      apiFetch(`/tax-settings/${code}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['tax-settings'] });
      const what = vars.body.enabled !== undefined
        ? (vars.body.enabled ? 'enabled' : 'disabled')
        : 'updated';
      toast({ title: `${vars.code} ${what}`, description: 'New orders will use the updated tax position.' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const handleToggle = (t: TaxSetting, enabled: boolean) => {
    updateMutation.mutate({ code: t.code, body: { enabled } });
  };

  const handleSaveRate = (t: TaxSetting) => {
    const raw = pctDraft[t.code];
    const pct = parseFloat(raw);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      toast({ variant: 'destructive', title: 'Invalid rate', description: 'Enter a percentage between 0 and 100.' });
      return;
    }
    const rate = Math.round((pct / 100) * 10000) / 10000; // 4dp decimal
    updateMutation.mutate({ code: t.code, body: { rate } });
  };

  const enabledTaxes = taxes.filter(t => t.enabled);
  const effectiveRate = enabledTaxes.reduce((s, t) => s + t.ratePercent, 0);

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Receipt size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-bold font-display">Tax & Levies</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Toggle Ghana taxes on or off and adjust their rates. Changes apply to <strong>new orders</strong> only — historical orders keep the tax position they were created with.
              </p>
            </div>
          </div>

          {/* Effective rate summary */}
          <Card className="rounded-2xl border-0 shadow-sm bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Currently Active</p>
                <p className="text-2xl font-bold mt-1">
                  {effectiveRate === 0 ? 'No taxes applied' : `${effectiveRate.toFixed(2)}% effective`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {enabledTaxes.length === 0
                    ? 'Customers see no tax on top of service + delivery fees.'
                    : `Applied to (service fee + delivery fee) on every new order. ${enabledTaxes.map(t => t.code).join(' + ')}.`}
                </p>
              </div>
              <Receipt size={48} className="text-primary/20 shrink-0" />
            </CardContent>
          </Card>

          {/* Info banner — base of taxation */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3 text-sm">
            <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div className="text-blue-900">
              <p className="font-semibold">Tax base: Platform revenue only</p>
              <p className="text-xs mt-1 text-blue-800">
                VAT, NHIL and GETFund are calculated on the <strong>service fee + delivery fee</strong> per order — never on the goods (item subtotal). All three apply to the same base, so when fully enabled the effective rate is 20% (15% + 2.5% + 2.5%).
              </p>
            </div>
          </div>

          {isLoading ? (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-8 text-center text-muted-foreground text-sm">Loading tax settings…</CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {taxes.map(tax => {
                const draft = pctDraft[tax.code] ?? tax.ratePercent.toString();
                const draftPct = parseFloat(draft);
                const isDirty = !isNaN(draftPct) && Math.abs(draftPct - tax.ratePercent) > 0.001;

                return (
                  <Card key={tax.code} className="rounded-2xl border-0 shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/40">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${tax.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            <Receipt size={18} />
                          </div>
                          <div>
                            <CardTitle className="text-base flex items-center gap-2">
                              {tax.name}
                              <span className="text-xs font-mono px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{tax.code}</span>
                            </CardTitle>
                            {tax.description && (
                              <CardDescription className="text-xs mt-1">{tax.description}</CardDescription>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-semibold ${tax.enabled ? 'text-green-700' : 'text-muted-foreground'}`}>
                            {tax.enabled ? 'ON' : 'OFF'}
                          </span>
                          <Switch
                            checked={tax.enabled}
                            disabled={updateMutation.isPending}
                            onCheckedChange={(v) => handleToggle(tax, v)}
                          />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-5">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Rate (%)</Label>
                          <div className="relative">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              className="pr-10 h-11 rounded-xl text-base font-semibold"
                              value={draft}
                              onChange={e => setPctDraft(prev => ({ ...prev, [tax.code]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') handleSaveRate(tax); }}
                            />
                            <span className="absolute right-3 top-2.5 text-muted-foreground font-medium">%</span>
                          </div>
                        </div>
                        <Button
                          className="h-11 rounded-xl gap-1.5"
                          onClick={() => handleSaveRate(tax)}
                          disabled={!isDirty || updateMutation.isPending}
                        >
                          <Save size={14} />
                          Save Rate
                        </Button>
                      </div>
                      {!tax.enabled && (
                        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
                          <AlertTriangle size={12} className="text-amber-500" />
                          This tax is currently <strong>disabled</strong> — saving the rate will not affect orders until you toggle it on.
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Rationale box */}
          <Card className="rounded-2xl border-0 shadow-sm bg-amber-50/40">
            <CardContent className="p-5 text-sm text-amber-900">
              <p className="font-semibold mb-1">Tip — early-stage rollout</p>
              <p className="text-xs text-amber-800">
                Many platforms keep taxes off until they hit the GRA registration threshold or want to formalize their tax position. You can keep all three off, turn on one at a time, or adjust the rates if Ghana's tax structure changes — every change takes effect on the next order placed.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
