import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import {
  useCreateRider,
  useResidentSignup,
  useCreateVendor,
  ResidentSignupRequestEstate,
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, AlertCircle } from 'lucide-react';

type Tab = 'rider' | 'residence' | 'vendor' | 'agent';

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
    estate: ResidentSignupRequestEstate.Airport_Hills,
    blockNumber: '',
    houseNumber: '',
    ghanaGpsAddress: '',
  };
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState<{ success?: string; error?: string }>({});
  const mutation = useResidentSignup();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStatus({});
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
        <Select
          value={form.estate}
          onValueChange={(val: any) => setForm({ ...form, estate: val })}
        >
          <SelectTrigger className="h-12 rounded-xl">
            <SelectValue placeholder="Select estate" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ResidentSignupRequestEstate.Airport_Hills}>Airport Hills</SelectItem>
            <SelectItem value={ResidentSignupRequestEstate.East_Legon_Hills}>East Legon Hills</SelectItem>
            <SelectItem value={ResidentSignupRequestEstate.Trassaco_Valley}>Trassaco Valley</SelectItem>
          </SelectContent>
        </Select>
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

export default function AdminSettings() {
  const [activeTab, setActiveTab] = useState<Tab>('rider');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'rider', label: 'Create Rider' },
    { id: 'residence', label: 'Add Residence' },
    { id: 'vendor', label: 'Add Vendor' },
    { id: 'agent', label: 'Add Agent' },
  ];

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8">Settings</h1>

        <div className="max-w-xl">
          <div className="flex gap-1 mb-6 bg-muted/50 p-1 rounded-xl border border-border/50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200 ${
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
          </Card>
        </div>
      </div>
    </div>
  );
}
