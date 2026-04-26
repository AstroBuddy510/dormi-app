import { useState } from 'react';
import { Link } from 'wouter';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Banknote, CreditCard, Smartphone, Wallet, Plus, Edit2, ExternalLink, LayoutGrid, List } from 'lucide-react';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function authHeaders(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    const a = window.localStorage.getItem('grocerease-auth');
    if (!a) return {};
    const t = JSON.parse(a)?.state?.token;
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch { return {}; }
}

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Request failed');
  return body as T;
}

interface BankAccount {
  id: number;
  name: string;
  type: 'paystack' | 'momo' | 'bank' | 'cash_float';
  provider: string | null;
  accountNumber: string | null;
  currency: string;
  glAccountCode: string;
  ownerType: string | null;
  ownerName: string | null;
  openingBalance: string;
  notes: string | null;
  isActive: boolean;
  lineCount: number;
  unmatchedCount: number;
  ledgerBalance: number;
}

interface GlCode { code: string; name: string; type: string; }

const typeIcons = {
  paystack: <CreditCard className="h-4 w-4" />,
  momo: <Smartphone className="h-4 w-4" />,
  bank: <Banknote className="h-4 w-4" />,
  cash_float: <Wallet className="h-4 w-4" />,
};

const typeLabels = {
  paystack: 'Paystack',
  momo: 'Mobile Money',
  bank: 'Bank',
  cash_float: 'Cash Float',
};

type ViewMode = 'grid' | 'list';
const VIEW_MODE_KEY = 'dormi-bank-accounts-view';

export default function BankAccountsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [creating, setCreating] = useState(false);
  // Restore the last view choice so it sticks across reloads.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    return saved === 'list' ? 'list' : 'grid';
  });
  const updateViewMode = (m: ViewMode) => {
    setViewMode(m);
    if (typeof window !== 'undefined') window.localStorage.setItem(VIEW_MODE_KEY, m);
  };

  const { data: accounts = [], isLoading } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api('/bank-accounts?includeInactive=true'),
  });

  const { data: glCodes = [] } = useQuery<GlCode[]>({
    queryKey: ['bank-accounts-gl'],
    queryFn: () => api('/bank-accounts/gl-codes'),
  });

  const saveMutation = useMutation({
    mutationFn: (input: Partial<BankAccount> & { id?: number }) => {
      const path = input.id ? `/bank-accounts/${input.id}` : '/bank-accounts';
      const method = input.id ? 'PATCH' : 'POST';
      const { id, lineCount, unmatchedCount, ledgerBalance, ...payload } = input;
      return api(path, { method, body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      toast({ title: 'Saved' });
      setEditing(null);
      setCreating(false);
    },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Bank Accounts</h1>
            <p className="text-muted-foreground text-sm">Every channel where money flows in or out — Paystack, MoMo wallets, bank accounts, cash floats.</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Grid / List view toggle */}
            <div className="inline-flex rounded-md border border-border bg-white p-0.5">
              <button
                type="button"
                onClick={() => updateViewMode('grid')}
                aria-pressed={viewMode === 'grid'}
                title="Grid view"
                className={`px-2.5 py-1.5 rounded-[5px] text-sm flex items-center gap-1.5 transition-colors ${
                  viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-gray-50'
                }`}
                data-testid="btn-view-grid"
              >
                <LayoutGrid className="h-4 w-4" /> Grid
              </button>
              <button
                type="button"
                onClick={() => updateViewMode('list')}
                aria-pressed={viewMode === 'list'}
                title="List view"
                className={`px-2.5 py-1.5 rounded-[5px] text-sm flex items-center gap-1.5 transition-colors ${
                  viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-muted-foreground hover:bg-gray-50'
                }`}
                data-testid="btn-view-list"
              >
                <List className="h-4 w-4" /> List
              </button>
            </div>
            <Button onClick={() => setCreating(true)} data-testid="btn-new-account">
              <Plus className="h-4 w-4 mr-2" /> New account
            </Button>
          </div>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : viewMode === 'grid' ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map(a => (
              <Card key={a.id} className={!a.isActive ? 'opacity-60' : ''}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="flex items-center gap-2">
                      {typeIcons[a.type]} {a.name}
                    </span>
                    {!a.isActive && <Badge variant="outline">Inactive</Badge>}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{typeLabels[a.type]} · {a.provider ?? '—'}</p>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">GL account</span><code className="text-xs">{a.glAccountCode}</code></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Ledger balance</span><span className="font-mono font-semibold">₵{a.ledgerBalance.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Statement lines</span><span>{a.lineCount} {a.unmatchedCount > 0 && <Badge variant="destructive" className="ml-1">{a.unmatchedCount} unmatched</Badge>}</span></div>
                  <div className="flex gap-2 pt-2">
                    <Button asChild size="sm" variant="default" className="flex-1">
                      <Link href={`/bank-statements?account=${a.id}`}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Statements</Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Edit2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Account</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Provider</th>
                    <th className="text-left p-3">GL code</th>
                    <th className="text-right p-3">Ledger balance</th>
                    <th className="text-right p-3">Lines</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-center p-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.id} className={`border-t ${!a.isActive ? 'opacity-60' : ''}`}>
                      <td className="p-3">
                        <span className="flex items-center gap-2 font-medium">{typeIcons[a.type]} {a.name}</span>
                      </td>
                      <td className="p-3 text-muted-foreground">{typeLabels[a.type]}</td>
                      <td className="p-3 text-muted-foreground">{a.provider ?? '—'}</td>
                      <td className="p-3"><code className="text-xs">{a.glAccountCode}</code></td>
                      <td className="p-3 text-right font-mono font-semibold">₵{a.ledgerBalance.toFixed(2)}</td>
                      <td className="p-3 text-right">
                        {a.lineCount}
                        {a.unmatchedCount > 0 && <Badge variant="destructive" className="ml-1">{a.unmatchedCount}</Badge>}
                      </td>
                      <td className="p-3 text-center">
                        {a.isActive ? <Badge variant="outline" className="text-green-700 border-green-200 bg-green-50">Active</Badge> : <Badge variant="outline">Inactive</Badge>}
                      </td>
                      <td className="p-3">
                        <div className="flex justify-center gap-2">
                          <Button asChild size="sm" variant="default">
                            <Link href={`/bank-statements?account=${a.id}`}><ExternalLink className="h-3.5 w-3.5 mr-1" /> Statements</Link>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditing(a)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {accounts.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No bank accounts yet.</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <BankAccountDialog
          open={creating || editing !== null}
          onClose={() => { setCreating(false); setEditing(null); }}
          initial={editing}
          glCodes={glCodes}
          onSave={input => saveMutation.mutate(input)}
          saving={saveMutation.isPending}
        />
      </main>
    </div>
  );
}

function BankAccountDialog({
  open, onClose, initial, glCodes, onSave, saving,
}: {
  open: boolean;
  onClose: () => void;
  initial: BankAccount | null;
  glCodes: GlCode[];
  onSave: (input: Partial<BankAccount> & { id?: number }) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<Partial<BankAccount>>(initial ?? {
    type: 'bank', currency: 'GHS', openingBalance: '0.00', isActive: true, ownerType: 'office',
  });

  // Sync form when dialog opens with new initial
  useState(() => {
    if (initial) setForm(initial);
  });

  const handleSubmit = () => {
    if (!form.name || !form.type || !form.glAccountCode) return;
    onSave({ ...(initial ? { id: initial.id } : {}), ...form });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit account' : 'New bank account'}</DialogTitle>
          <DialogDescription>Channels reconcile against a chart-of-accounts GL code.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. GCB Operations" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Type</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank">Bank</SelectItem>
                  <SelectItem value="momo">Mobile Money</SelectItem>
                  <SelectItem value="paystack">Paystack</SelectItem>
                  <SelectItem value="cash_float">Cash Float</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Currency</Label>
              <Input value={form.currency ?? 'GHS'} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Provider</Label>
            <Input value={form.provider ?? ''} onChange={e => setForm(f => ({ ...f, provider: e.target.value }))} placeholder="GCB / Ecobank / MTN MoMo / etc." />
          </div>
          <div>
            <Label>Account number</Label>
            <Input value={form.accountNumber ?? ''} onChange={e => setForm(f => ({ ...f, accountNumber: e.target.value }))} />
          </div>
          <div>
            <Label>GL account code</Label>
            <Select value={form.glAccountCode} onValueChange={v => setForm(f => ({ ...f, glAccountCode: v }))}>
              <SelectTrigger><SelectValue placeholder="Pick a chart-of-accounts code" /></SelectTrigger>
              <SelectContent className="max-h-64">
                {glCodes.filter(c => c.type === 'asset').map(c => (
                  <SelectItem key={c.code} value={c.code}><code className="text-xs mr-2">{c.code}</code> {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Owner type</Label>
              <Select value={form.ownerType ?? 'office'} onValueChange={v => setForm(f => ({ ...f, ownerType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="office">Office</SelectItem>
                  <SelectItem value="rider">Rider</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Owner name</Label>
              <Input value={form.ownerName ?? ''} onChange={e => setForm(f => ({ ...f, ownerName: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Opening balance</Label>
            <Input value={form.openingBalance ?? '0.00'} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
