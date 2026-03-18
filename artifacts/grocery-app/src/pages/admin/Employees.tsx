import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pencil, Trash2, Plus, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).message ?? 'Request failed');
    return r.json();
  });
}

const ROLES = ['Agent', 'Rider', 'Cleaner', 'Security', 'Driver', 'Accountant', 'Other'];
const EMPTY_FORM = { name: '', role: '', phone: '', bankMomoDetails: '', salaryType: 'monthly', salaryAmount: '', dailyFloat: '' };

export default function AdminEmployees() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: employees = [], isLoading } = useQuery<any[]>({
    queryKey: ['employees'],
    queryFn: () => apiFetch('/employees'),
  });

  const saveMutation = useMutation({
    mutationFn: (body: any) => editing
      ? apiFetch(`/employees/${editing.id}`, { method: 'PUT', body: JSON.stringify(body) })
      : apiFetch('/employees', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: editing ? 'Employee updated' : 'Employee added' });
      setDialogOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/employees/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); toast({ title: 'Employee removed' }); },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (emp: any) => {
    setEditing(emp);
    setForm({ name: emp.name, role: emp.role, phone: emp.phone, bankMomoDetails: emp.bankMomoDetails ?? '', salaryType: emp.salaryType, salaryAmount: emp.salaryAmount.toString(), dailyFloat: emp.dailyFloat.toString() });
    setDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.role) { toast({ variant: 'destructive', title: 'Please select a role' }); return; }
    saveMutation.mutate({ ...form, salaryAmount: parseFloat(form.salaryAmount) || 0, dailyFloat: parseFloat(form.dailyFloat) || 0 });
  };

  const isRider = form.role === 'Rider';

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-display">Employees</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Manage staff, salaries and daily floats</p>
            </div>
            <Button className="rounded-xl" onClick={openAdd}><Plus size={16} className="mr-1.5" /> Add Employee</Button>
          </div>

          {isLoading ? (
            <div className="text-center text-muted-foreground py-20">Loading employees...</div>
          ) : employees.length === 0 ? (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                <Users size={40} className="opacity-30" />
                <p>No employees yet. Add your first staff member.</p>
                <Button variant="outline" className="rounded-xl mt-2" onClick={openAdd}><Plus size={14} className="mr-1.5" /> Add Employee</Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {employees.map((emp: any) => (
                <Card key={emp.id} className="rounded-2xl border-0 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                      {emp.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{emp.name}</span>
                        <Badge variant="secondary" className="text-xs">{emp.role}</Badge>
                        {!emp.isActive && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{emp.phone}</p>
                      {emp.bankMomoDetails && <p className="text-xs text-muted-foreground">{emp.bankMomoDetails}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold">GH₵ {emp.salaryAmount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground capitalize">{emp.salaryType}</p>
                      {emp.role === 'Rider' && emp.dailyFloat > 0 && (
                        <p className="text-xs text-blue-600 mt-0.5">Float: GH₵ {emp.dailyFloat}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg" onClick={() => openEdit(emp)}><Pencil size={14} /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:text-destructive" onClick={() => { if (confirm('Remove this employee?')) deleteMutation.mutate(emp.id); }}><Trash2 size={14} /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Full Name</Label>
              <Input required className="rounded-xl" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Kwame Mensah" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>{ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input required className="rounded-xl" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="024 123 4567" />
            </div>
            <div className="space-y-1.5">
              <Label>Bank / MoMo Details</Label>
              <Input className="rounded-xl" value={form.bankMomoDetails} onChange={e => setForm({ ...form, bankMomoDetails: e.target.value })} placeholder="MTN MoMo 024-xxx-xxxx" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Salary Type</Label>
                <Select value={form.salaryType} onValueChange={v => setForm({ ...form, salaryType: v })}>
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="daily">Daily Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Salary Amount (GH₵)</Label>
                <Input type="number" min="0" className="rounded-xl" value={form.salaryAmount} onChange={e => setForm({ ...form, salaryAmount: e.target.value })} placeholder="0.00" />
              </div>
            </div>
            {isRider && (
              <div className="space-y-1.5">
                <Label>Daily Cash Float for Rider (GH₵)</Label>
                <Input type="number" min="0" className="rounded-xl" value={form.dailyFloat} onChange={e => setForm({ ...form, dailyFloat: e.target.value })} placeholder="100.00" />
              </div>
            )}
            <Button type="submit" className="w-full rounded-xl" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving...' : editing ? 'Save Changes' : 'Add Employee'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
