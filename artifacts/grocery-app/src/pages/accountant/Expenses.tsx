import { useState, useRef } from 'react';
import { AccountantSidebar } from '@/components/layout/AccountantSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Receipt, Plus, Trash2, Image, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).message ?? 'Request failed');
    return r.json();
  });
}

function fmt(n: number) { return `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2 })}`; }
function todayStr() { return new Date().toISOString().slice(0, 10); }

const EXPENSE_TYPES: Record<string, string[]> = {
  operations: ['Fuel', 'Vehicle Service', 'Supplies', 'Rider Lunch', 'Other Operations'],
  utilities: ['Electricity', 'Water', 'Internet', 'Phone Credit', 'Other Utilities'],
  admin: ['Office Supplies', 'Printing', 'Transport', 'Miscellaneous'],
};

const ALL_TYPES = Object.values(EXPENSE_TYPES).flat();

const EMPTY_FORM = { type: '', category: 'operations', amount: '', expenseDate: todayStr(), notes: '', photoUrl: '' };

export default function AccountantExpenses() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [preview, setPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filterCat, setFilterCat] = useState('all');

  const { data: expenses = [] } = useQuery<any[]>({
    queryKey: ['expenses'],
    queryFn: () => apiFetch('/expenses'),
  });

  const addMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/expenses', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      toast({ title: 'Expense recorded' });
      setForm(EMPTY_FORM);
      setPreview('');
      setShowForm(false);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); toast({ title: 'Expense deleted' }); },
  });

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const urlRes = await fetch(`${BASE}/api/storage/uploads/request-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      }).then(r => r.json());
      await fetch(urlRes.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      setForm(f => ({ ...f, photoUrl: urlRes.objectPath }));
      setPreview(URL.createObjectURL(file));
      toast({ title: 'Photo uploaded' });
    } catch {
      toast({ variant: 'destructive', title: 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.type) { toast({ variant: 'destructive', title: 'Please select expense type' }); return; }
    addMutation.mutate({ ...form, amount: parseFloat(form.amount), createdByRole: 'accountant' });
  };

  const catLabel: Record<string, string> = { operations: '⚙️ Operations', utilities: '💡 Utilities', admin: '📋 Admin', all: 'All' };
  const filtered = filterCat === 'all' ? expenses : expenses.filter((e: any) => e.category === filterCat);
  const total = filtered.reduce((sum: number, e: any) => sum + e.amount, 0);

  return (
    <div className="flex min-h-screen bg-background">
      <AccountantSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-display">Expenses</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Record and track all business expenses</p>
            </div>
            <Button className="rounded-xl" onClick={() => setShowForm(!showForm)}>
              <Plus size={16} className="mr-1.5" /> Add Expense
            </Button>
          </div>

          {showForm && (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">New Expense</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Category</Label>
                      <Select value={form.category} onValueChange={v => setForm({ ...form, category: v, type: '' })}>
                        <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="operations">Operations</SelectItem>
                          <SelectItem value="utilities">Utilities</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Type</Label>
                      <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                        <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          {(EXPENSE_TYPES[form.category] ?? ALL_TYPES).map(t => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label>Amount (GH₵)</Label>
                      <Input required type="number" min="0.01" step="0.01" className="rounded-xl" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="0.00" />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Date</Label>
                      <Input required type="date" className="rounded-xl" value={form.expenseDate} onChange={e => setForm({ ...form, expenseDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Notes (optional)</Label>
                    <Input className="rounded-xl" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Brief description" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Receipt Photo (optional)</Label>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
                    <div className="flex gap-3 items-center">
                      <Button type="button" variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()} disabled={uploading}>
                        {uploading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Image size={14} className="mr-1.5" />}
                        {uploading ? 'Uploading...' : 'Attach Photo'}
                      </Button>
                      {preview && <img src={preview} alt="receipt" className="h-10 w-10 object-cover rounded-lg border" />}
                    </div>
                  </div>
                  <Button type="submit" className="w-full rounded-xl" disabled={addMutation.isPending || uploading}>
                    {addMutation.isPending ? 'Saving...' : 'Record Expense'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {['all', 'operations', 'utilities', 'admin'].map(cat => (
              <Button key={cat} size="sm" variant={filterCat === cat ? 'default' : 'outline'} className="rounded-xl" onClick={() => setFilterCat(cat)}>
                {catLabel[cat]}
              </Button>
            ))}
            <span className="ml-auto text-sm font-semibold">Total: {fmt(total)}</span>
          </div>

          {filtered.length === 0 ? (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                <Receipt size={40} className="opacity-30" />
                <p>No expenses recorded yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {[...filtered].reverse().map((exp: any) => (
                <Card key={exp.id} className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{exp.type}</span>
                        <Badge variant={exp.category === 'utilities' ? 'default' : 'secondary'} className="text-xs capitalize">{exp.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{exp.expenseDate} {exp.notes && `· ${exp.notes}`}</p>
                    </div>
                    {exp.photoUrl && <img src={`${BASE}/api/storage/file?path=${encodeURIComponent(exp.photoUrl)}`} alt="receipt" className="h-10 w-10 object-cover rounded-lg border shrink-0" />}
                    <span className="font-bold text-red-600 shrink-0">{fmt(exp.amount)}</span>
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive shrink-0" onClick={() => { if (confirm('Delete this expense?')) deleteMutation.mutate(exp.id); }}>
                      <Trash2 size={14} />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
