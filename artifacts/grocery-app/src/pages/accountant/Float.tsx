import { useState, useRef } from 'react';
import { AccountantSidebar } from '@/components/layout/AccountantSidebar';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Wallet, CheckCircle, AlertTriangle, Plus, Image, Loader2 } from 'lucide-react';
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

export default function AccountantFloat() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [issueDialog, setIssueDialog] = useState(false);
  const [reconcileDialog, setReconcileDialog] = useState<any>(null);
  const [issueForm, setIssueForm] = useState({ riderId: '', amount: '', issueDate: todayStr(), notes: '' });
  const [reconcileForm, setReconcileForm] = useState({ notes: '', receiptUrl: '' });
  const [reconcilePreview, setReconcilePreview] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: floats = [] } = useQuery<any[]>({
    queryKey: ['floats'],
    queryFn: () => apiFetch('/float'),
  });

  const { data: riders = [] } = useQuery<any[]>({
    queryKey: ['riders-list'],
    queryFn: () => apiFetch('/riders'),
  });

  const issueMutation = useMutation({
    mutationFn: (body: any) => apiFetch('/float', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floats'] });
      toast({ title: 'Float issued' });
      setIssueDialog(false);
      setIssueForm({ riderId: '', amount: '', issueDate: todayStr(), notes: '' });
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
  });

  const reconcileMutation = useMutation({
    mutationFn: ({ id, body }: any) => apiFetch(`/float/${id}/reconcile`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floats'] });
      toast({ title: 'Float reconciled' });
      setReconcileDialog(null);
      setReconcileForm({ notes: '', receiptUrl: '' });
      setReconcilePreview('');
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Error', description: e.message }),
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
      setReconcileForm(f => ({ ...f, receiptUrl: urlRes.objectPath }));
      setReconcilePreview(URL.createObjectURL(file));
      toast({ title: 'Receipt uploaded' });
    } catch {
      toast({ variant: 'destructive', title: 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const handleIssue = (e: React.FormEvent) => {
    e.preventDefault();
    issueMutation.mutate({ riderId: parseInt(issueForm.riderId), amount: parseFloat(issueForm.amount), issueDate: issueForm.issueDate, notes: issueForm.notes || undefined });
  };

  const handleReconcile = (e: React.FormEvent) => {
    e.preventDefault();
    reconcileMutation.mutate({ id: reconcileDialog.id, body: { receiptUrl: reconcileForm.receiptUrl || undefined, notes: reconcileForm.notes || undefined } });
  };

  const openIssues = floats.filter((f: any) => !f.reconciled);
  const closedIssues = floats.filter((f: any) => f.reconciled);
  const totalOpen = openIssues.reduce((sum: number, f: any) => sum + f.amount, 0);

  return (
    <div className="flex min-h-screen bg-background">
      <AccountantSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold font-display">Float Management</h1>
              <p className="text-muted-foreground text-sm mt-0.5">Issue and reconcile rider cash floats</p>
            </div>
            <Button className="rounded-xl" onClick={() => setIssueDialog(true)}>
              <Plus size={16} className="mr-1.5" /> Issue Float
            </Button>
          </div>

          {openIssues.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle size={16} className="shrink-0" />
              <span><strong>{openIssues.length} unreconciled float{openIssues.length > 1 ? 's' : ''}</strong> totalling {fmt(totalOpen)}</span>
            </div>
          )}

          <div className="space-y-4">
            {openIssues.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Pending Reconciliation</h2>
                <div className="grid gap-3">
                  {openIssues.map((f: any) => (
                    <Card key={f.id} className="rounded-2xl border-0 shadow-sm border-l-4 border-l-amber-400">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{f.riderName}</span>
                            <Badge variant="destructive" className="text-xs">Unreconciled</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{f.issueDate} · {f.riderPhone}</p>
                          {f.notes && <p className="text-xs text-muted-foreground">{f.notes}</p>}
                        </div>
                        <span className="font-bold text-amber-700 shrink-0">{fmt(f.amount)}</span>
                        <Button size="sm" variant="outline" className="rounded-xl shrink-0" onClick={() => { setReconcileDialog(f); setReconcileForm({ notes: '', receiptUrl: '' }); setReconcilePreview(''); }}>
                          <CheckCircle size={14} className="mr-1.5" /> Reconcile
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {closedIssues.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Reconciled</h2>
                <div className="grid gap-2">
                  {[...closedIssues].reverse().slice(0, 10).map((f: any) => (
                    <Card key={f.id} className="rounded-2xl border-0 shadow-sm opacity-70">
                      <CardContent className="p-3 flex items-center gap-3">
                        <CheckCircle size={16} className="text-green-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="font-medium text-sm">{f.riderName}</span>
                          <span className="text-xs text-muted-foreground ml-2">{f.issueDate}</span>
                        </div>
                        <span className="font-semibold text-sm">{fmt(f.amount)}</span>
                        {f.receiptUrl && <img src={`${BASE}/api/storage/file?path=${encodeURIComponent(f.receiptUrl)}`} alt="receipt" className="h-8 w-8 object-cover rounded-lg border shrink-0" />}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {floats.length === 0 && (
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardContent className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                  <Wallet size={40} className="opacity-30" />
                  <p>No floats issued yet.</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      <Dialog open={issueDialog} onOpenChange={setIssueDialog}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Issue Float to Rider</DialogTitle></DialogHeader>
          <form onSubmit={handleIssue} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Rider</Label>
              <Select value={issueForm.riderId} onValueChange={v => setIssueForm({ ...issueForm, riderId: v })}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Select rider" /></SelectTrigger>
                <SelectContent>
                  {(riders as any[]).map((r: any) => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount (GH₵)</Label>
              <Input required type="number" min="0.01" step="0.01" className="rounded-xl" value={issueForm.amount} onChange={e => setIssueForm({ ...issueForm, amount: e.target.value })} placeholder="100.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input required type="date" className="rounded-xl" value={issueForm.issueDate} onChange={e => setIssueForm({ ...issueForm, issueDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input className="rounded-xl" value={issueForm.notes} onChange={e => setIssueForm({ ...issueForm, notes: e.target.value })} placeholder="Daily float, fuel, etc." />
            </div>
            <Button type="submit" className="w-full rounded-xl" disabled={issueMutation.isPending || !issueForm.riderId}>
              {issueMutation.isPending ? 'Issuing...' : 'Issue Float'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reconcileDialog} onOpenChange={v => !v && setReconcileDialog(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader><DialogTitle>Reconcile Float — {reconcileDialog?.riderName}</DialogTitle></DialogHeader>
          <form onSubmit={handleReconcile} className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">Confirming receipt of {reconcileDialog ? fmt(reconcileDialog.amount) : ''} issued on {reconcileDialog?.issueDate}.</p>
            <div className="space-y-1.5">
              <Label>Receipt Photo</Label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
              <div className="flex gap-3 items-center">
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => fileRef.current?.click()} disabled={uploading}>
                  {uploading ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Image size={14} className="mr-1.5" />}
                  {uploading ? 'Uploading...' : 'Upload Receipt'}
                </Button>
                {reconcilePreview && <img src={reconcilePreview} alt="receipt" className="h-10 w-10 object-cover rounded-lg border" />}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input className="rounded-xl" value={reconcileForm.notes} onChange={e => setReconcileForm({ ...reconcileForm, notes: e.target.value })} placeholder="Any remarks" />
            </div>
            <Button type="submit" className="w-full rounded-xl bg-green-600 hover:bg-green-700" disabled={reconcileMutation.isPending}>
              {reconcileMutation.isPending ? 'Closing...' : 'Mark as Reconciled'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
