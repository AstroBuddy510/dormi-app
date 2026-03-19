import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import {
  useCreateRider,
  useResidentSignup,
  useCreateVendor,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Truck, Phone, Mail, MapPin, Edit2, Trash2, XCircle, PlusCircle, ChevronsUpDown, CreditCard, Eye, EyeOff, RefreshCw, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

type Tab = 'rider' | 'residence' | 'vendor' | 'agent' | 'delivery-partner' | 'payment-gateway';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || 'Request failed');
  }
  return res.json();
}

function FormStatus({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-medium">
        <CheckCircle size={16} />
        {success}
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
        <AlertCircle size={16} />
        {error}
      </div>
    );
  }
  return null;
}

function CreateRiderForm() {
  const [form, setForm] = useState({ name: '', phone: '', pin: '' });
  const [status, setStatus] = useState<{ success?: string; error?: string }>({});
  const mutation = useCreateRider();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({});
    mutation.mutate(
      { data: { name: form.name, phone: form.phone, pin: form.pin || undefined } },
      {
        onSuccess: () => {
          setStatus({ success: 'Rider account created successfully.' });
          setForm({ name: '', phone: '', pin: '' });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to create rider.';
          setStatus({ error: msg });
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="rider-name">Full Name</Label>
        <Input
          id="rider-name"
          required
          className="h-12 rounded-xl"
          placeholder="e.g. Kofi Boateng"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rider-phone">Phone Number</Label>
        <Input
          id="rider-phone"
          required
          type="tel"
          className="h-12 rounded-xl"
          placeholder="024 123 4567"
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="rider-pin">PIN (optional)</Label>
        <Input
          id="rider-pin"
          type="password"
          className="h-12 rounded-xl"
          placeholder="4-digit PIN"
          value={form.pin}
          onChange={e => setForm({ ...form, pin: e.target.value })}
        />
      </div>
      <FormStatus {...status} />
      <Button
        type="submit"
        className="w-full h-12 text-base font-bold rounded-xl"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Creating...' : 'Create Rider Account'}
      </Button>
    </form>
  );
}

function AddResidenceForm() {
  const initialForm = {
    fullName: '',
    phone: '',
    estate: '',
    blockNumber: '',
    houseNumber: '',
    ghanaGpsAddress: '',
  };
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<{ success?: string; error?: string }>({});
  const mutation = useResidentSignup();

  const [estateOpen, setEstateOpen] = useState(false);
  const [estateInput, setEstateInput] = useState('');
  const { data: existingEstates = [] } = useQuery<string[]>({
    queryKey: ['estates'],
    queryFn: () => apiFetch('/residents/estates'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({});
    if (!form.estate.trim()) {
      setStatus({ error: 'Please select or type an estate name.' });
      return;
    }
    mutation.mutate(
      { data: form },
      {
        onSuccess: () => {
          setStatus({ success: 'Residence added successfully.' });
          setForm(initialForm);
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to add residence.';
          setStatus({ error: msg });
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="res-name">Full Name</Label>
        <Input
          id="res-name"
          required
          className="h-12 rounded-xl"
          placeholder="Kwame Mensah"
          value={form.fullName}
          onChange={e => setForm({ ...form, fullName: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="res-phone">Phone Number</Label>
        <Input
          id="res-phone"
          required
          type="tel"
          className="h-12 rounded-xl"
          placeholder="024 123 4567"
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label>Estate</Label>
        <Popover open={estateOpen} onOpenChange={setEstateOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={estateOpen}
              className="w-full h-12 rounded-xl justify-between font-normal"
            >
              <span className={form.estate ? '' : 'text-muted-foreground'}>
                {form.estate || 'Select or type an estate'}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search or type new estate..."
                value={estateInput}
                onValueChange={setEstateInput}
              />
              <CommandList>
                <CommandEmpty>
                  {estateInput.trim() ? (
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded-sm"
                      onClick={() => {
                        const val = estateInput.trim();
                        setForm({ ...form, estate: val });
                        setEstateInput('');
                        setEstateOpen(false);
                      }}
                    >
                      Use &quot;{estateInput.trim()}&quot;
                    </button>
                  ) : (
                    'No estates found.'
                  )}
                </CommandEmpty>
                <CommandGroup>
                  {existingEstates.map((estate) => (
                    <CommandItem
                      key={estate}
                      value={estate}
                      onSelect={(val) => {
                        setForm({ ...form, estate: val });
                        setEstateInput('');
                        setEstateOpen(false);
                      }}
                    >
                      {estate}
                    </CommandItem>
                  ))}
                  {estateInput.trim() && !existingEstates.includes(estateInput.trim()) && (
                    <CommandItem
                      value={estateInput.trim()}
                      onSelect={(val) => {
                        setForm({ ...form, estate: val });
                        setEstateInput('');
                        setEstateOpen(false);
                      }}
                    >
                      Use &quot;{estateInput.trim()}&quot;
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="res-block">Block / Street</Label>
          <Input
            id="res-block"
            required
            className="h-12 rounded-xl"
            placeholder="e.g. Block A"
            value={form.blockNumber}
            onChange={e => setForm({ ...form, blockNumber: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="res-house">House Number</Label>
          <Input
            id="res-house"
            required
            className="h-12 rounded-xl"
            placeholder="e.g. 42"
            value={form.houseNumber}
            onChange={e => setForm({ ...form, houseNumber: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="res-gps">Ghana GPS (Optional)</Label>
        <Input
          id="res-gps"
          className="h-12 rounded-xl"
          placeholder="GA-123-4567"
          value={form.ghanaGpsAddress}
          onChange={e => setForm({ ...form, ghanaGpsAddress: e.target.value })}
        />
      </div>
      <FormStatus {...status} />
      <Button
        type="submit"
        className="w-full h-12 text-base font-bold rounded-xl"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Adding...' : 'Add Residence'}
      </Button>
    </form>
  );
}

function AddVendorForm() {
  const [form, setForm] = useState({ name: '', phone: '', description: '' });
  const [status, setStatus] = useState<{ success?: string; error?: string }>({});
  const mutation = useCreateVendor();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({});
    mutation.mutate(
      { data: { name: form.name, phone: form.phone, description: form.description || undefined } },
      {
        onSuccess: () => {
          setStatus({ success: 'Vendor added successfully.' });
          setForm({ name: '', phone: '', description: '' });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to add vendor.';
          setStatus({ error: msg });
        },
      }
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="vendor-name">Vendor Name</Label>
        <Input
          id="vendor-name"
          required
          className="h-12 rounded-xl"
          placeholder="e.g. Fresh Farms Ltd"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vendor-phone">Phone Number (optional)</Label>
        <Input
          id="vendor-phone"
          type="tel"
          className="h-12 rounded-xl"
          placeholder="024 123 4567"
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="vendor-description">Location / Description (optional)</Label>
        <Input
          id="vendor-description"
          className="h-12 rounded-xl"
          placeholder="e.g. East Legon, near the mall"
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
        />
      </div>
      <FormStatus {...status} />
      <Button
        type="submit"
        className="w-full h-12 text-base font-bold rounded-xl"
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Adding...' : 'Add Vendor'}
      </Button>
    </form>
  );
}

function AddAgentForm() {
  const [form, setForm] = useState({ name: '', phone: '', pin: '' });
  const [status, setStatus] = useState<{ success?: string; error?: string }>({});
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({});
    setLoading(true);
    try {
      await apiFetch('/agents', {
        method: 'POST',
        body: JSON.stringify({ name: form.name, phone: form.phone, pin: form.pin || undefined }),
      });
      setStatus({ success: 'Call agent account created successfully.' });
      setForm({ name: '', phone: '', pin: '' });
    } catch (err: any) {
      setStatus({ error: err.message ?? 'Failed to create agent.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="agent-name">Full Name</Label>
        <Input
          id="agent-name"
          required
          className="h-12 rounded-xl"
          placeholder="e.g. Akosua Frimpong"
          value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agent-phone">Phone Number</Label>
        <Input
          id="agent-phone"
          required
          type="tel"
          className="h-12 rounded-xl"
          placeholder="024 123 4567"
          value={form.phone}
          onChange={e => setForm({ ...form, phone: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="agent-pin">PIN (optional)</Label>
        <Input
          id="agent-pin"
          type="password"
          inputMode="numeric"
          maxLength={8}
          className="h-12 rounded-xl font-mono tracking-widest"
          placeholder="4-digit PIN"
          value={form.pin}
          onChange={e => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
        />
      </div>
      <FormStatus {...status} />
      <Button
        type="submit"
        className="w-full h-12 text-base font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700"
        disabled={loading}
      >
        {loading ? 'Creating...' : 'Create Agent Account'}
      </Button>
    </form>
  );
}

const EMPTY_PARTNER = { name: '', contactPerson: '', phone: '', email: '', address: '', commissionPercent: '10' };

function DeliveryPartnersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_PARTNER);
  const set = (k: keyof typeof EMPTY_PARTNER) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const { data: partners = [], isLoading } = useQuery<any[]>({
    queryKey: ['delivery-partners'],
    queryFn: () => apiFetch('/delivery-partners'),
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof EMPTY_PARTNER) =>
      apiFetch('/delivery-partners', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Delivery partner registered!' });
      qc.invalidateQueries({ queryKey: ['delivery-partners'] });
      setShowForm(false);
      setForm(EMPTY_PARTNER);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof EMPTY_PARTNER }) =>
      apiFetch(`/delivery-partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      toast({ title: 'Partner updated!' });
      qc.invalidateQueries({ queryKey: ['delivery-partners'] });
      setEditId(null);
      setForm(EMPTY_PARTNER);
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/delivery-partners/${id}`, { method: 'PUT', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-partners'] }),
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/delivery-partners/${id}`, { method: 'DELETE' }),
    onSuccess: () => { toast({ title: 'Partner removed' }); qc.invalidateQueries({ queryKey: ['delivery-partners'] }); },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function startEdit(p: any) {
    setEditId(p.id);
    setForm({ name: p.name, contactPerson: p.contactPerson, phone: p.phone, email: p.email ?? '', address: p.address ?? '', commissionPercent: String(p.commissionPercent) });
    setShowForm(true);
  }

  function cancelForm() {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_PARTNER);
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (editId !== null) {
      updateMutation.mutate({ id: editId, data: form });
    } else {
      createMutation.mutate(form);
    }
  }

  return (
    <div className="space-y-5">
      {!showForm ? (
        <Button
          className="w-full h-11 rounded-xl gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold"
          onClick={() => { cancelForm(); setShowForm(true); }}
        >
          <PlusCircle size={17} /> Register New Delivery Company
        </Button>
      ) : (
        <form onSubmit={handleSave} className="space-y-4 border border-green-100 rounded-xl p-4 bg-green-50/40">
          <p className="text-sm font-semibold text-gray-700">
            {editId !== null ? 'Edit Delivery Company' : 'New Delivery Company'}
          </p>
          <div className="space-y-1">
            <Label>Company Name *</Label>
            <Input required value={form.name} onChange={set('name')} className="h-11 rounded-xl" placeholder="e.g. GIG Logistics" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Contact Person *</Label>
              <Input required value={form.contactPerson} onChange={set('contactPerson')} className="h-11 rounded-xl" placeholder="Full name" />
            </div>
            <div className="space-y-1">
              <Label>Phone *</Label>
              <Input required value={form.phone} onChange={set('phone')} className="h-11 rounded-xl" placeholder="024XXXXXXX" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Email (optional)</Label>
              <Input value={form.email} onChange={set('email')} className="h-11 rounded-xl" placeholder="info@company.com" />
            </div>
            <div className="space-y-1">
              <Label>Commission Rate (%)</Label>
              <Input type="number" min="0" max="100" value={form.commissionPercent} onChange={set('commissionPercent')} className="h-11 rounded-xl" placeholder="10" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Address (optional)</Label>
            <Input value={form.address} onChange={set('address')} className="h-11 rounded-xl" placeholder="e.g. East Legon, Accra" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1 h-11 rounded-xl bg-green-600 hover:bg-green-700 font-semibold" disabled={isSaving}>
              {isSaving ? 'Saving...' : editId !== null ? 'Save Changes' : 'Register Company'}
            </Button>
            <Button type="button" variant="outline" className="h-11 rounded-xl px-5" onClick={cancelForm}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-center py-6 text-gray-400 text-sm">Loading...</div>
      ) : partners.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Truck className="w-9 h-9 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No delivery companies registered yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {partners.map((p: any) => (
            <div
              key={p.id}
              className={`rounded-xl border p-4 bg-white space-y-2 ${!p.isActive ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Truck className="w-4 h-4 text-green-600 shrink-0" />
                  <span className="font-semibold text-sm text-gray-800 truncate">{p.name}</span>
                  {p.isActive
                    ? <Badge className="bg-green-100 text-green-700 text-xs shrink-0">Active</Badge>
                    : <Badge variant="outline" className="text-gray-400 text-xs shrink-0">Suspended</Badge>
                  }
                </div>
                <span className="text-xs text-gray-400 shrink-0">{p.commissionPercent}% commission</span>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" /> {p.contactPerson} · {p.phone}</div>
                {p.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3" /> {p.email}</div>}
                {p.address && <div className="flex items-center gap-1.5"><MapPin className="w-3 h-3" /> {p.address}</div>}
              </div>
              <div className="flex gap-2 pt-0.5">
                <button
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  onClick={() => startEdit(p)}
                >
                  <Edit2 size={11} /> Edit
                </button>
                <button
                  className={`text-xs flex items-center gap-1 ${p.isActive ? 'text-orange-500 hover:underline' : 'text-green-600 hover:underline'}`}
                  onClick={() => toggleMutation.mutate({ id: p.id, isActive: !p.isActive })}
                >
                  {p.isActive ? <><XCircle size={11} /> Suspend</> : <><CheckCircle size={11} /> Activate</>}
                </button>
                <button
                  className="text-xs text-red-500 hover:underline flex items-center gap-1 ml-auto"
                  onClick={() => { if (confirm(`Remove ${p.name}?`)) deleteMutation.mutate(p.id); }}
                >
                  <Trash2 size={11} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentGatewayTab() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ publicKey: '', secretKey: '', mode: 'test' });
  const [showSecret, setShowSecret] = useState(false);
  const [status, setStatus] = useState<{ success?: string; error?: string }>({});

  const { data: current, isLoading } = useQuery({
    queryKey: ['/api/settings/gateway'],
    queryFn: () => apiFetch('/settings/gateway'),
  });

  const saveMutation = useMutation({
    mutationFn: (payload: object) => apiFetch('/settings/gateway', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/gateway'] });
      queryClient.invalidateQueries({ queryKey: ['/api/settings/gateway-public'] });
      setStatus({ success: 'Gateway settings saved successfully.' });
      setForm(f => ({ ...f, secretKey: '' }));
    },
    onError: (err: any) => {
      setStatus({ error: err?.message ?? 'Failed to save settings.' });
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({});
    const payload: any = { mode: form.mode };
    if (form.publicKey.trim()) payload.publicKey = form.publicKey.trim();
    if (form.secretKey.trim()) payload.secretKey = form.secretKey.trim();
    saveMutation.mutate(payload);
  };

  const modeLabel = current?.mode === 'live' ? 'Live' : 'Test';
  const modeColor = current?.mode === 'live' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700';

  return (
    <form onSubmit={handleSave} className="space-y-6">

      {/* Current status */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw size={14} className="animate-spin" /> Loading current settings…
        </div>
      ) : current ? (
        <div className="rounded-xl border border-border bg-gray-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-green-600" />
              <span className="font-semibold text-sm">Paystack</span>
            </div>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${modeColor}`}>{modeLabel} Mode</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Public Key</span>
              <span className="font-mono text-gray-600 truncate max-w-[240px]">{current.publicKey || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Secret Key</span>
              <span className="font-mono text-gray-600">{current.maskedSecretKey || '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Last Updated</span>
              <span>{current.updatedAt ? new Date(current.updatedAt).toLocaleString() : '—'}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="border-t border-border pt-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          Enter your new API keys below. Leave <span className="font-semibold">Secret Key</span> blank to keep the existing one.
          Switch to <span className="font-semibold">Live Mode</span> when you're ready for real transactions.
        </p>

        {/* Mode selector */}
        <div className="space-y-2">
          <Label>Mode</Label>
          <Select
            value={form.mode}
            onValueChange={v => setForm(f => ({ ...f, mode: v }))}
          >
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="test">🧪 Test Mode — use test keys</SelectItem>
              <SelectItem value="live">🟢 Live Mode — real transactions</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Public key */}
        <div className="space-y-2">
          <Label htmlFor="gw-pub">Public Key <span className="text-xs text-muted-foreground">(pk_test_... or pk_live_...)</span></Label>
          <Input
            id="gw-pub"
            className="h-12 rounded-xl font-mono text-sm"
            placeholder="pk_test_xxxxxxxxxxxxxxxx  or  pk_live_xxxxxxxxxxxxxxxx"
            value={form.publicKey}
            onChange={e => setForm(f => ({ ...f, publicKey: e.target.value }))}
          />
        </div>

        {/* Secret key */}
        <div className="space-y-2">
          <Label htmlFor="gw-sec">Secret Key <span className="text-xs text-muted-foreground">(sk_test_... or sk_live_...)</span></Label>
          <div className="relative">
            <Input
              id="gw-sec"
              type={showSecret ? 'text' : 'password'}
              className="h-12 rounded-xl font-mono text-sm pr-11"
              placeholder="Leave blank to keep the existing key"
              value={form.secretKey}
              onChange={e => setForm(f => ({ ...f, secretKey: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>
        </div>

        <FormStatus {...status} />

        {form.mode === 'live' && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span>You are switching to <strong>Live Mode</strong>. Real money will be charged to customers. Ensure your keys are from the Paystack live dashboard.</span>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-12 text-base font-bold rounded-xl gap-2"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? (
            <><RefreshCw size={16} className="animate-spin" /> Saving…</>
          ) : (
            <><CreditCard size={16} /> Save Gateway Settings</>
          )}
        </Button>
      </div>
    </form>
  );
}

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('rider');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rider', label: 'Create Rider' },
    { id: 'residence', label: 'Add Residence' },
    { id: 'vendor', label: 'Add Vendor' },
    { id: 'agent', label: 'Add Agent' },
    { id: 'delivery-partner', label: 'Delivery Companies' },
    { id: 'payment-gateway', label: '💳 Payment Gateway' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 overflow-auto flex flex-col py-8 px-12">
        <div className="w-full">
          <h1 className="text-3xl font-display font-bold text-foreground mb-8 text-center">Settings</h1>

          <div className="w-full">
            <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-xl border border-border/50 flex-wrap">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    activeTab === tab.id
                      ? 'bg-white text-foreground shadow-sm border border-border/50'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <Card className="rounded-2xl shadow-sm border-border/50">
              {activeTab === 'rider' && (
                <>
                  <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
                    <CardTitle>Create Rider Account</CardTitle>
                    <CardDescription>Add a new rider who can accept and fulfil deliveries.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <CreateRiderForm />
                  </CardContent>
                </>
              )}

              {activeTab === 'residence' && (
                <>
                  <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
                    <CardTitle>Add Residence</CardTitle>
                    <CardDescription>Register a resident's address for delivery.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <AddResidenceForm />
                  </CardContent>
                </>
              )}

              {activeTab === 'vendor' && (
                <>
                  <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
                    <CardTitle>Add Vendor</CardTitle>
                    <CardDescription>Register a new vendor available for orders.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <AddVendorForm />
                  </CardContent>
                </>
              )}

              {activeTab === 'agent' && (
                <>
                  <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
                    <CardTitle>Add Call Agent</CardTitle>
                    <CardDescription>Create a call center agent account for logging resident complaints and placing orders.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <AddAgentForm />
                  </CardContent>
                </>
              )}

              {activeTab === 'delivery-partner' && (
                <>
                  <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
                    <CardTitle>Third-Party Delivery Companies</CardTitle>
                    <CardDescription>Register and manage the external delivery companies you work with, set their commission rates, and control their active status.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-6">
                    <DeliveryPartnersTab />
                  </CardContent>
                </>
              )}

              {activeTab === 'payment-gateway' && (
                <>
                  <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
                    <div className="flex items-center gap-2">
                      <CreditCard size={20} className="text-primary" />
                      <div>
                        <CardTitle>Payment Gateway — Paystack</CardTitle>
                        <CardDescription>
                          Update your Paystack API keys and switch between Test and Live mode. Use test keys while developing, then switch to your live keys for real transactions.
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <PaymentGatewayTab />
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
