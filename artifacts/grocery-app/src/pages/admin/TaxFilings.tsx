import { useState } from 'react';
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
import { Receipt, Calendar, FileCheck, BadgeDollarSign, AlertTriangle, Download, Save, Send, Coins } from 'lucide-react';

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
    ...init, headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Request failed');
  return body as T;
}

const fmt = (n: number) => `₵${Number(n).toFixed(2)}`;

const FILING_TYPES = [
  { value: 'vat_nhil_getfund', label: 'VAT / NHIL / GETFund', icon: Receipt },
  { value: 'paye',             label: 'PAYE',                  icon: BadgeDollarSign },
  { value: 'ssnit',            label: 'SSNIT',                 icon: Coins },
  { value: 'wht',              label: 'WHT (track-only)',      icon: AlertTriangle },
] as const;

type FilingType = typeof FILING_TYPES[number]['value'];

interface Filing {
  id: number;
  type: FilingType;
  periodYear: number;
  periodMonth: number;
  computedAmounts: any;
  amountPayable: string;
  amountPaid: string;
  status: 'draft' | 'filed' | 'paid' | 'cancelled';
  filingReference: string | null;
  graReceiptNumber: string | null;
  filedAt: string | null;
  filedByName: string | null;
  paidAt: string | null;
  paidByName: string | null;
  remittanceTransactionId: string | null;
  notes: string | null;
}

interface BankAccount { id: number; name: string; glAccountCode: string; type: string; }

const statusColor = (s: string) => ({
  draft:     'bg-gray-100 text-gray-700',
  filed:     'bg-blue-100 text-blue-700',
  paid:      'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
} as Record<string, string>)[s] ?? 'bg-gray-100';

export default function TaxFilingsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const now = new Date();
  // Default to last completed month
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(lastMonth.getFullYear());
  const [month, setMonth] = useState(lastMonth.getMonth() + 1);
  const [type, setType] = useState<FilingType>('vat_nhil_getfund');
  const [detailFiling, setDetailFiling] = useState<Filing | null>(null);

  const { data: filings = [], isLoading } = useQuery<Filing[]>({
    queryKey: ['tax-filings'],
    queryFn: () => api('/tax-filings'),
  });

  const { data: draft } = useQuery<any>({
    queryKey: ['tax-draft', type, year, month],
    queryFn: () => api(`/tax-filings/draft?type=${type}&year=${year}&month=${month}`),
  });

  const saveDraftMutation = useMutation({
    mutationFn: () => api('/tax-filings', {
      method: 'POST',
      body: JSON.stringify({
        type, periodYear: year, periodMonth: month,
        computedAmounts: draft, amountPayable: draft?.amountPayable,
      }),
    }),
    onSuccess: () => { toast({ title: 'Draft saved' }); qc.invalidateQueries({ queryKey: ['tax-filings'] }); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  return (
    <div className="flex">
      <AdminSidebar />
      <main className="flex-1 p-6 max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Tax Filings (GRA)</h1>
          <p className="text-muted-foreground text-sm">Compute, file, and pay GRA monthly returns. Payments auto-post a remittance journal that clears the relevant payable account.</p>
        </div>

        <Card className="mb-6">
          <CardHeader><CardTitle>Compute a draft</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-4 gap-3">
            <div>
              <Label>Tax type</Label>
              <Select value={type} onValueChange={v => setType(v as FilingType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FILING_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Year</Label><Input type="number" value={year} onChange={e => setYear(parseInt(e.target.value) || year)} /></div>
            <div>
              <Label>Month</Label>
              <Select value={String(month)} onValueChange={v => setMonth(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <SelectItem key={i+1} value={String(i+1)}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => saveDraftMutation.mutate()} disabled={!draft || saveDraftMutation.isPending}>
                <Save className="h-4 w-4 mr-2" /> {saveDraftMutation.isPending ? 'Saving…' : 'Save as draft'}
              </Button>
            </div>
          </CardContent>
          <CardContent>
            {draft && <DraftPreview type={type} draft={draft} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Filings</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? <p className="p-6 text-muted-foreground">Loading…</p> : filings.length === 0 ? <p className="p-6 text-muted-foreground">No filings yet — compute a draft above and save it.</p> : (
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Period</th>
                    <th className="text-right p-3">Payable</th>
                    <th className="text-right p-3">Paid</th>
                    <th className="text-center p-3">Status</th>
                    <th className="text-left p-3">Reference</th>
                    <th className="text-center p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filings.map(f => (
                    <tr key={f.id} className="border-t">
                      <td className="p-3"><Badge variant="outline">{FILING_TYPES.find(t => t.value === f.type)?.label ?? f.type}</Badge></td>
                      <td className="p-3">{f.periodYear}-{String(f.periodMonth).padStart(2, '0')}</td>
                      <td className="p-3 text-right font-mono">{fmt(Number(f.amountPayable))}</td>
                      <td className="p-3 text-right font-mono">{Number(f.amountPaid) > 0 ? fmt(Number(f.amountPaid)) : '—'}</td>
                      <td className="p-3 text-center"><Badge className={statusColor(f.status)}>{f.status}</Badge></td>
                      <td className="p-3 text-xs font-mono truncate max-w-[140px]">{f.filingReference ?? '—'}</td>
                      <td className="p-3 text-center">
                        <Button size="sm" variant="outline" onClick={() => setDetailFiling(f)}>Details</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {detailFiling && (
          <FilingDetailDialog filing={detailFiling} onClose={() => setDetailFiling(null)} onChange={() => {
            qc.invalidateQueries({ queryKey: ['tax-filings'] });
          }} />
        )}
      </main>
    </div>
  );
}

// ─── Draft preview ────────────────────────────────────────────────────────

function DraftPreview({ type, draft }: { type: FilingType; draft: any }) {
  if (!draft) return null;
  return (
    <div className="border rounded p-4 bg-muted/20">
      {type === 'vat_nhil_getfund' && <VatPreview d={draft} />}
      {type === 'paye' && <PayePreview d={draft} />}
      {type === 'ssnit' && <SsnitPreview d={draft} />}
      {type === 'wht' && <WhtPreview d={draft} />}
      <p className="text-xs text-muted-foreground italic mt-3">{draft.notes}</p>
      <div className="mt-2 text-right">
        <span className="text-sm text-muted-foreground mr-2">Total payable:</span>
        <span className="text-2xl font-mono font-bold">{fmt(draft.amountPayable)}</span>
      </div>
    </div>
  );
}

function VatPreview({ d }: { d: any }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left"><th className="p-2">Tax</th><th className="text-right p-2">Output</th><th className="text-right p-2">Input</th><th className="text-right p-2">Net</th></tr></thead>
      <tbody>
        <tr className="border-t"><td className="p-2">VAT (15%)</td><td className="p-2 text-right font-mono">{fmt(d.output.vat)}</td><td className="p-2 text-right font-mono">{fmt(d.input.vat)}</td><td className="p-2 text-right font-mono">{fmt(d.net.vat)}</td></tr>
        <tr className="border-t"><td className="p-2">NHIL (2.5%)</td><td className="p-2 text-right font-mono">{fmt(d.output.nhil)}</td><td className="p-2 text-right font-mono">{fmt(d.input.nhil)}</td><td className="p-2 text-right font-mono">{fmt(d.net.nhil)}</td></tr>
        <tr className="border-t"><td className="p-2">GETFund (2.5%)</td><td className="p-2 text-right font-mono">{fmt(d.output.getfund)}</td><td className="p-2 text-right font-mono">{fmt(d.input.getfund)}</td><td className="p-2 text-right font-mono">{fmt(d.net.getfund)}</td></tr>
        <tr className="border-t-2 font-bold"><td className="p-2">Total</td><td className="p-2 text-right font-mono">{fmt(d.output.total)}</td><td className="p-2 text-right font-mono">{fmt(d.input.total)}</td><td className="p-2 text-right font-mono">{fmt(d.net.total)}</td></tr>
      </tbody>
    </table>
  );
}

function PayePreview({ d }: { d: any }) {
  if (d.employees.length === 0) return <p className="text-muted-foreground text-sm">No payroll payments in this period.</p>;
  return (
    <table className="w-full text-sm">
      <thead><tr className="text-left"><th className="p-2">Employee</th><th className="text-right p-2">Gross</th><th className="text-right p-2">PAYE</th></tr></thead>
      <tbody>
        {d.employees.map((e: any) => (
          <tr key={e.employeeId} className="border-t"><td className="p-2">{e.name}</td><td className="p-2 text-right font-mono">{fmt(e.gross)}</td><td className="p-2 text-right font-mono">{fmt(e.paye)}</td></tr>
        ))}
        <tr className="border-t-2 font-bold"><td className="p-2">Totals</td><td className="p-2 text-right font-mono">{fmt(d.totals.gross)}</td><td className="p-2 text-right font-mono">{fmt(d.totals.paye)}</td></tr>
      </tbody>
    </table>
  );
}

function SsnitPreview({ d }: { d: any }) {
  if (d.employees.length === 0) return <p className="text-muted-foreground text-sm">No payroll in this period.</p>;
  return (
    <>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className="p-2">Employee</th><th className="text-right p-2">Basic</th><th className="text-right p-2">Tier 1 (13.5%)</th><th className="text-right p-2">Tier 2 (5%)</th><th className="text-right p-2">Total</th></tr></thead>
        <tbody>
          {d.employees.map((e: any) => (
            <tr key={e.employeeId} className="border-t"><td className="p-2">{e.name}</td><td className="p-2 text-right font-mono">{fmt(e.basic)}</td><td className="p-2 text-right font-mono">{fmt(e.tier1)}</td><td className="p-2 text-right font-mono">{fmt(e.tier2)}</td><td className="p-2 text-right font-mono">{fmt(e.total)}</td></tr>
          ))}
          <tr className="border-t-2 font-bold"><td className="p-2">Totals</td><td className="p-2 text-right font-mono">{fmt(d.totals.basic)}</td><td className="p-2 text-right font-mono">{fmt(d.totals.tier1)}</td><td className="p-2 text-right font-mono">{fmt(d.totals.tier2)}</td><td className="p-2 text-right font-mono">{fmt(d.totals.total)}</td></tr>
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">Employer share: {fmt(d.totals.employer)} · Employee share: {fmt(d.totals.employee)}</p>
    </>
  );
}

function WhtPreview({ d }: { d: any }) {
  if (d.payouts.length === 0) return <p className="text-muted-foreground text-sm">No paid payouts in this period.</p>;
  return (
    <>
      <p className="text-sm mb-2">{d.totals.payoutCount} payouts totaling {fmt(d.totals.grossPaid)} · estimated WHT exposure: {fmt(d.totals.estimatedWht)}</p>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th className="p-2">Payout</th><th className="text-right p-2">Gross</th><th className="text-right p-2">WHT %</th><th className="text-right p-2">WHT</th></tr></thead>
        <tbody>
          {d.payouts.map((p: any) => (
            <tr key={p.payoutId} className="border-t"><td className="p-2">#{p.payoutId} (vendor {p.vendorId})</td><td className="p-2 text-right font-mono">{fmt(p.totalAmount)}</td><td className="p-2 text-right font-mono">{p.whtRate.toFixed(1)}%</td><td className="p-2 text-right font-mono">{p.whtAmount > 0 ? fmt(p.whtAmount) : '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ─── Detail dialog (mark filed / paid / cancel + PDF export) ──────────────

function FilingDetailDialog({ filing, onClose, onChange }: { filing: Filing; onClose: () => void; onChange: () => void }) {
  const { toast } = useToast();
  const [filingRef, setFilingRef] = useState(filing.filingReference ?? '');
  const [graReceipt, setGraReceipt] = useState(filing.graReceiptNumber ?? '');

  const { data: bankAccounts = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: () => api('/bank-accounts'),
  });
  const payableFrom = bankAccounts.filter(b => ['1100-CASH','1110-MOMO-MTN','1111-MOMO-TELECEL','1112-MOMO-AT','1200-BANK'].includes(b.glAccountCode));
  const [paidFrom, setPaidFrom] = useState<number>(payableFrom[0]?.id ?? 0);

  const fileMutation = useMutation({
    mutationFn: () => api(`/tax-filings/${filing.id}/mark-filed`, {
      method: 'POST', body: JSON.stringify({ filingReference: filingRef, graReceiptNumber: graReceipt }),
    }),
    onSuccess: () => { toast({ title: 'Marked filed' }); onChange(); onClose(); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const payMutation = useMutation({
    mutationFn: () => api(`/tax-filings/${filing.id}/mark-paid`, {
      method: 'POST', body: JSON.stringify({ paidFromBankAccountId: paidFrom, graReceiptNumber: graReceipt }),
    }),
    onSuccess: () => { toast({ title: 'Marked paid; remittance journal posted' }); onChange(); onClose(); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api(`/tax-filings/${filing.id}/cancel`, { method: 'POST' }),
    onSuccess: () => { toast({ title: 'Cancelled' }); onChange(); onClose(); },
    onError: (e: any) => toast({ title: 'Failed', description: e.message, variant: 'destructive' }),
  });

  const exportPdf = async () => {
    const [{ default: jsPDF }, autoTable] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable').then(m => m.default),
    ]);
    const doc = new jsPDF();
    doc.setFontSize(16);
    const typeLabel = FILING_TYPES.find(t => t.value === filing.type)?.label ?? filing.type;
    doc.text(`${typeLabel} — ${filing.periodYear}-${String(filing.periodMonth).padStart(2, '0')}`, 14, 18);
    doc.setFontSize(10);
    doc.text(`Status: ${filing.status} · Generated: ${new Date().toLocaleString()}`, 14, 26);
    doc.text(`Total payable: ₵${Number(filing.amountPayable).toFixed(2)}`, 14, 32);
    if (filing.filingReference) doc.text(`Filing reference: ${filing.filingReference}`, 14, 38);

    // Build a flat table from computedAmounts
    const ca = filing.computedAmounts || {};
    const rows: string[][] = [];
    if (filing.type === 'vat_nhil_getfund' && ca.output) {
      rows.push(['VAT (output / input / net)', `₵${ca.output.vat}`, `₵${ca.input.vat}`, `₵${ca.net.vat}`]);
      rows.push(['NHIL (output / input / net)', `₵${ca.output.nhil}`, `₵${ca.input.nhil}`, `₵${ca.net.nhil}`]);
      rows.push(['GETFund (output / input / net)', `₵${ca.output.getfund}`, `₵${ca.input.getfund}`, `₵${ca.net.getfund}`]);
      rows.push(['Total', `₵${ca.output.total}`, `₵${ca.input.total}`, `₵${ca.net.total}`]);
    } else if (filing.type === 'paye' && ca.employees) {
      ca.employees.forEach((e: any) => rows.push([e.name, '', `₵${e.gross}`, `₵${e.paye}`]));
      rows.push(['Totals', '', `₵${ca.totals.gross}`, `₵${ca.totals.paye}`]);
    } else if (filing.type === 'ssnit' && ca.employees) {
      ca.employees.forEach((e: any) => rows.push([e.name, `₵${e.basic}`, `₵${e.tier1}`, `₵${e.tier2}`]));
      rows.push(['Totals', `₵${ca.totals.basic}`, `₵${ca.totals.tier1}`, `₵${ca.totals.tier2}`]);
    } else if (filing.type === 'wht' && ca.payouts) {
      ca.payouts.forEach((p: any) => rows.push([`Payout #${p.payoutId}`, `Vendor ${p.vendorId}`, `₵${p.totalAmount}`, `₵${p.whtAmount}`]));
      rows.push(['Totals', '', `₵${ca.totals.grossPaid}`, `₵${ca.totals.estimatedWht}`]);
    }
    autoTable(doc, { head: [['Item', 'Col 1', 'Col 2', 'Col 3']], body: rows, startY: 46 });
    doc.save(`${filing.type}_${filing.periodYear}_${String(filing.periodMonth).padStart(2,'0')}.pdf`);
  };

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {FILING_TYPES.find(t => t.value === filing.type)?.label ?? filing.type} — {filing.periodYear}-{String(filing.periodMonth).padStart(2, '0')}
          </DialogTitle>
          <DialogDescription>
            <Badge className={statusColor(filing.status)}>{filing.status}</Badge>
            {filing.filedByName && <span className="ml-2 text-xs">filed by {filing.filedByName} on {filing.filedAt?.slice(0, 10)}</span>}
            {filing.paidByName && <span className="ml-2 text-xs">paid by {filing.paidByName} on {filing.paidAt?.slice(0, 10)}</span>}
          </DialogDescription>
        </DialogHeader>

        <DraftPreview type={filing.type} draft={filing.computedAmounts} />

        <div className="space-y-3 mt-4">
          {filing.status !== 'paid' && filing.status !== 'cancelled' && (
            <>
              <div>
                <Label>Filing reference (GRA submission #)</Label>
                <Input value={filingRef} onChange={e => setFilingRef(e.target.value)} placeholder="e.g. VAT-2026-04-12345" />
              </div>
              <div>
                <Label>GRA receipt number</Label>
                <Input value={graReceipt} onChange={e => setGraReceipt(e.target.value)} placeholder="From GRA after payment" />
              </div>
            </>
          )}
          {filing.status === 'filed' && (
            <div>
              <Label>Pay from</Label>
              <Select value={String(paidFrom)} onValueChange={v => setPaidFrom(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {payableFrom.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {filing.remittanceTransactionId && (
            <div className="text-xs text-muted-foreground">
              Remittance journal: <code>{filing.remittanceTransactionId}</code>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={exportPdf}><Download className="h-4 w-4 mr-2" /> Export PDF</Button>
          {filing.status === 'draft' && (
            <Button onClick={() => fileMutation.mutate()} disabled={fileMutation.isPending}>
              <Send className="h-4 w-4 mr-2" /> {fileMutation.isPending ? 'Marking…' : 'Mark filed'}
            </Button>
          )}
          {filing.status === 'filed' && (
            <Button onClick={() => payMutation.mutate()} disabled={!paidFrom || payMutation.isPending}>
              <FileCheck className="h-4 w-4 mr-2" /> {payMutation.isPending ? 'Posting…' : 'Mark paid (post remittance)'}
            </Button>
          )}
          {filing.status !== 'paid' && filing.status !== 'cancelled' && (
            <Button variant="ghost" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} className="text-red-600">Cancel filing</Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
