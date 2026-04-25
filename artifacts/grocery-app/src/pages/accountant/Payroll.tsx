import { useState } from 'react';
import { AccountantSidebar } from '@/components/layout/AccountantSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreditCard, CheckCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

function EmployeeCard({ emp, paid, thisPay, lastPay, onPay }: {
  emp: any; paid: boolean; thisPay: any; lastPay: any; monthLabel: string; onPay: (emp: any) => void;
}) {
  const calcSalary = emp.salaryType === 'daily' ? emp.salaryAmount * 26 : emp.salaryAmount;
  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  return (
    <Card className={`rounded-2xl border-0 shadow-sm ${paid ? 'opacity-70' : ''}`}>
      <CardContent className="p-4 flex items-center gap-4">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${paid ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-600'}`}>
          {emp.name.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{emp.name}</span>
            <Badge variant="secondary" className="text-xs">{emp.role}</Badge>
            {paid && (
              <Badge className="text-xs bg-green-100 text-green-700 border-green-200">
                <CheckCircle size={10} className="mr-1" /> Paid {monthLabel}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">{emp.phone}</p>
          {emp.bankMomoDetails && <p className="text-xs text-muted-foreground">{emp.bankMomoDetails}</p>}
          {paid && thisPay && (
            <p className="text-xs text-green-600 mt-0.5">
              {fmt(thisPay.amount)} paid on {thisPay.paidAt.slice(0, 10)} via {thisPay.paymentMethod}
              {thisPay.reference ? ` · Ref: ${thisPay.reference}` : ''}
            </p>
          )}
          {!paid && lastPay && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Last paid {fmt(lastPay.amount)} on {lastPay.paidAt.slice(0, 10)}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold">{fmt(calcSalary)}</p>
          <p className="text-xs text-muted-foreground">{emp.salaryType === 'daily' ? `GH₵${emp.salaryAmount}/day × 26` : 'Monthly'}</p>
        </div>
        {!paid && (
          <Button size="sm" className="rounded-xl shrink-0" onClick={() => onPay(emp)}>
            <CreditCard size={14} className="mr-1.5" /> Pay Now
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).message ?? 'Request failed');
    return r.json();
  });
}

function fmt(n: number) { return `GH₵ ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`; }

export default function AccountantPayroll() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [payDialog, setPayDialog] = useState<any>(null);
  const [payForm, setPayForm] = useState({ amount: '', paymentMethod: 'Momo', reference: '', periodStart: monthStart(), periodEnd: todayStr(), notes: '' });

  const { data: employees = [] } = useQuery<any[]>({
    queryKey: ['employees'],
    queryFn: () => apiFetch('/employees'),
  });

  const { data: payroll = [] } = useQuery<any[]>({
    queryKey: ['payroll'],
    queryFn: () => apiFetch('/payroll'),
  });

  const payMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/payroll', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payroll'] });
      toast({ title: 'Payment logged successfully' });
      setPayDialog(null);
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const openPay = (emp: any) => {
    const calcSalary = emp.salaryType === 'daily'
      ? emp.salaryAmount * 26
      : emp.salaryAmount;
    setPayForm({ amount: calcSalary.toFixed(2), paymentMethod: 'Momo', reference: '', periodStart: monthStart(), periodEnd: todayStr(), notes: '' });
    setPayDialog(emp);
  };

  const handlePay = (e: React.FormEvent) => {
    e.preventDefault();
    payMutation.mutate({
      employeeId: payDialog.id,
      amount: parseFloat(payForm.amount),
      paymentMethod: payForm.paymentMethod,
      reference: payForm.reference || undefined,
      periodStart: payForm.periodStart,
      periodEnd: payForm.periodEnd,
      notes: payForm.notes || undefined,
    });
  };

  const activeEmployees = employees.filter((e: any) => e.isActive);

  // Determine the current month/year to know who's already been paid this cycle
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  function paidThisMonth(emp: any) {
    return payroll.some((p: any) => {
      if (p.employeeId !== emp.id) return false;
      const d = new Date(p.paidAt);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }

  function lastPayThisMonth(emp: any) {
    return [...payroll]
      .reverse()
      .find((p: any) => {
        if (p.employeeId !== emp.id) return false;
        const d = new Date(p.paidAt);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
      });
  }

  const unpaidEmployees = activeEmployees.filter(e => !paidThisMonth(e));
  const paidEmployees = activeEmployees.filter(e => paidThisMonth(e));

  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });

  function renderCard(emp: any, paid: boolean) {
    const thisPay = paid ? lastPayThisMonth(emp) : null;
    const allPays = payroll.filter((p: any) => p.employeeId === emp.id);
    const lastPay = allPays.length > 0 ? allPays[allPays.length - 1] : null;
    return (
      <EmployeeCard
        key={emp.id}
        emp={emp}
        paid={paid}
        thisPay={thisPay}
        lastPay={lastPay}
        monthLabel={monthLabel}
        onPay={openPay}
      />
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AccountantSidebar />
      <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold font-display">Payroll</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Pay staff and log payment records</p>
          </div>

          {/* Unpaid this month */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Unpaid — {monthLabel}</h2>
              {unpaidEmployees.length > 0 && (
                <Badge variant="destructive" className="text-xs">{unpaidEmployees.length} pending</Badge>
              )}
            </div>
            {activeEmployees.length === 0 ? (
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="text-center py-16 text-muted-foreground">
                  No employees found. Ask admin to add staff first.
                </CardContent>
              </Card>
            ) : unpaidEmployees.length === 0 ? (
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="flex flex-col items-center py-10 gap-2 text-center">
                  <CheckCircle size={32} className="text-green-500" />
                  <p className="font-semibold text-green-700">All staff paid for {monthLabel}!</p>
                  <p className="text-xs text-muted-foreground">They will reappear here on 1st of next month.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3">
                {unpaidEmployees.map(emp => renderCard(emp, false))}
              </div>
            )}
          </div>

          {/* Already paid this month */}
          {paidEmployees.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-foreground">Already Paid — {monthLabel}</h2>
              <div className="grid gap-3">
                {paidEmployees.map(emp => renderCard(emp, true))}
              </div>
            </div>
          )}


          {payroll.length > 0 && (
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Payments</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {[...payroll].reverse().slice(0, 10).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                    <div>
                      <span className="font-medium">{p.employeeName}</span>
                      <span className="text-muted-foreground ml-2 text-xs">({p.employeeRole})</span>
                      {p.reference && <span className="text-muted-foreground text-xs ml-2">Ref: {p.reference}</span>}
                    </div>
                    <div className="text-right">
                      <span className="font-semibold">{fmt(p.amount)}</span>
                      <span className="text-xs text-muted-foreground ml-2">{p.paymentMethod}</span>
                      <p className="text-xs text-muted-foreground">{p.paidAt.slice(0, 10)}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={!!payDialog} onOpenChange={v => !v && setPayDialog(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Pay {payDialog?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePay} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Amount (GH₵)</Label>
              <Input required type="number" min="0.01" step="0.01" className="rounded-xl" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={payForm.paymentMethod} onValueChange={v => setPayForm({ ...payForm, paymentMethod: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Momo">MTN MoMo</SelectItem>
                  <SelectItem value="Bank">Bank Transfer</SelectItem>
                  <SelectItem value="Cash">Cash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Reference / Transaction ID</Label>
              <Input className="rounded-xl" value={payForm.reference} onChange={e => setPayForm({ ...payForm, reference: e.target.value })} placeholder="e.g. GH23456789" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Period Start</Label>
                <Input required type="date" className="rounded-xl" value={payForm.periodStart} onChange={e => setPayForm({ ...payForm, periodStart: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Period End</Label>
                <Input required type="date" className="rounded-xl" value={payForm.periodEnd} onChange={e => setPayForm({ ...payForm, periodEnd: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Input className="rounded-xl" value={payForm.notes} onChange={e => setPayForm({ ...payForm, notes: e.target.value })} placeholder="Bonus, deductions, etc." />
            </div>
            <Button type="submit" className="w-full rounded-xl" disabled={payMutation.isPending}>
              {payMutation.isPending ? 'Logging...' : 'Confirm Payment'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
