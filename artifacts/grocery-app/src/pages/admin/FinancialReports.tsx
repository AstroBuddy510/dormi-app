import { useState } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Download, FileText, Sheet as SheetIcon, FileBarChart, BookOpen, Scale, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

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
async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, { headers: { ...authHeaders() } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? body.error ?? 'Request failed');
  return body as T;
}

const fmt = (n: number) => `₵${n.toFixed(2)}`;
const deltaClass = (n: number) => n > 0 ? 'text-green-700' : n < 0 ? 'text-red-700' : 'text-muted-foreground';

export default function FinancialReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [tab, setTab] = useState('pnl');
  const [glAccount, setGlAccount] = useState('1100-CASH');

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Financial Reports</h1>
          <p className="text-muted-foreground text-sm">P&L, balance sheet, cash flow, trial balance, and GL detail — all derived from the ledger.</p>
        </div>

        <Card className="mb-6">
          <CardContent className="grid md:grid-cols-3 gap-3 pt-6">
            <div><Label>From</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
            <div><Label>To / As of</Label><Input type="date" value={to} onChange={e => { setTo(e.target.value); setAsOf(e.target.value); }} /></div>
            <div className="flex items-end text-xs text-muted-foreground">Period reports use From→To. Balance Sheet + Trial Balance use the To date as "as of".</div>
          </CardContent>
        </Card>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-5 mb-4">
            <TabsTrigger value="pnl"><TrendingUp className="h-4 w-4 mr-2" /> P&L</TabsTrigger>
            <TabsTrigger value="bs"><Scale className="h-4 w-4 mr-2" /> Balance Sheet</TabsTrigger>
            <TabsTrigger value="cf"><FileBarChart className="h-4 w-4 mr-2" /> Cash Flow</TabsTrigger>
            <TabsTrigger value="tb"><BookOpen className="h-4 w-4 mr-2" /> Trial Balance</TabsTrigger>
            <TabsTrigger value="gl"><FileText className="h-4 w-4 mr-2" /> GL Detail</TabsTrigger>
          </TabsList>

          <TabsContent value="pnl"><PnlPanel from={from} to={to} /></TabsContent>
          <TabsContent value="bs"><BsPanel asOf={asOf} /></TabsContent>
          <TabsContent value="cf"><CfPanel from={from} to={to} /></TabsContent>
          <TabsContent value="tb"><TbPanel asOf={asOf} /></TabsContent>
          <TabsContent value="gl">
            <GlPanel from={from} to={to} accountCode={glAccount} setAccountCode={setGlAccount} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ─── PDF / CSV export helpers ─────────────────────────────────────────────

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(r => r.map(c => {
    const s = String(c ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function downloadPdf(title: string, headers: string[], rows: (string | number)[][], summary: { label: string; value: string }[] = []) {
  const [{ default: jsPDF }, autoTable] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable').then(m => m.default),
  ]);
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleString()}`, 14, 26);
  let startY = 32;
  if (summary.length > 0) {
    summary.forEach((s, i) => {
      doc.text(`${s.label}: ${s.value}`, 14, startY + i * 6);
    });
    startY += summary.length * 6 + 6;
  }
  autoTable(doc, { head: [headers], body: rows.map(r => r.map(c => String(c ?? ''))), startY });
  doc.save(`${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
}

// ─── Panels ────────────────────────────────────────────────────────────────

function PnlPanel({ from, to }: { from: string; to: string }) {
  const { data, isLoading, error } = useQuery<any>({
    queryKey: ['pnl', from, to],
    queryFn: () => api(`/financial-reports/pnl?from=${from}&to=${to}`),
  });
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (error || !data) return <p className="text-red-600">Failed to load.</p>;

  const exportRows = () => {
    const rows: (string | number)[][] = [['Section', 'Account', 'Name', 'Current', 'Prior', 'Δ']];
    for (const sec of [data.revenue, data.directCosts, data.operatingExpenses]) {
      sec.lines.forEach((l: any) => rows.push([sec.heading, l.accountCode, l.name, l.current, l.prior, l.delta]));
      rows.push([sec.heading, '', 'Total', sec.total.current, sec.total.prior, sec.total.delta]);
    }
    rows.push(['', '', 'Gross Profit', data.grossProfit.current, data.grossProfit.prior, data.grossProfit.delta]);
    rows.push(['', '', 'Net Income', data.netIncome.current, data.netIncome.prior, data.netIncome.delta]);
    return rows;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle>Profit & Loss</CardTitle>
            <p className="text-xs text-muted-foreground">{data.range.from} → {data.range.to} · prior: {data.priorRange.from} → {data.priorRange.to}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadCsv(`pnl_${from}_to_${to}.csv`, exportRows())}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => downloadPdf(`Profit & Loss ${from} to ${to}`,
              ['Section', 'Account', 'Name', 'Current', 'Prior', 'Δ'],
              exportRows().slice(1),
              [{ label: 'Net Income', value: fmt(data.netIncome.current) }],
            )}><Download className="h-3.5 w-3.5 mr-1" /> PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <PnlTable data={data} />
      </CardContent>
    </Card>
  );
}

function PnlTable({ data }: { data: any }) {
  return (
    <table className="w-full text-sm">
      <thead className="bg-muted">
        <tr>
          <th className="text-left p-3">Account</th>
          <th className="text-right p-3">Current</th>
          <th className="text-right p-3">Prior</th>
          <th className="text-right p-3">Δ</th>
        </tr>
      </thead>
      <tbody>
        <SectionRows section={data.revenue} />
        <SectionRows section={data.directCosts} />
        <SubtotalRow label="Gross Profit" v={data.grossProfit} bold />
        <SectionRows section={data.operatingExpenses} />
        <SubtotalRow label="Net Income" v={data.netIncome} bold highlight />
      </tbody>
    </table>
  );
}

function SectionRows({ section }: { section: any }) {
  return (
    <>
      <tr className="bg-muted/40 border-t"><td colSpan={4} className="p-2 font-semibold">{section.heading}</td></tr>
      {section.lines.map((l: any) => (
        <tr key={l.accountCode} className="border-t">
          <td className="p-2 pl-6"><code className="text-xs mr-2 text-muted-foreground">{l.accountCode}</code> {l.name}</td>
          <td className="p-2 text-right font-mono">{fmt(l.current)}</td>
          <td className="p-2 text-right font-mono text-muted-foreground">{fmt(l.prior)}</td>
          <td className={`p-2 text-right font-mono ${deltaClass(l.delta)}`}>{fmt(l.delta)}</td>
        </tr>
      ))}
      <SubtotalRow label={`Total ${section.heading}`} v={section.total} />
    </>
  );
}

function SubtotalRow({ label, v, bold, highlight }: { label: string; v: { current: number; prior: number; delta: number }; bold?: boolean; highlight?: boolean }) {
  return (
    <tr className={`border-t ${bold ? 'font-bold' : 'font-semibold'} ${highlight ? 'bg-amber-50' : 'bg-muted/20'}`}>
      <td className="p-2 pl-3">{label}</td>
      <td className="p-2 text-right font-mono">{fmt(v.current)}</td>
      <td className="p-2 text-right font-mono text-muted-foreground">{fmt(v.prior)}</td>
      <td className={`p-2 text-right font-mono ${deltaClass(v.delta)}`}>{fmt(v.delta)}</td>
    </tr>
  );
}

function BsPanel({ asOf }: { asOf: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['bs', asOf],
    queryFn: () => api(`/financial-reports/balance-sheet?asOf=${asOf}`),
  });
  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;

  const balanced = Math.abs(data.balanceCheck.current) < 0.005;
  const exportRows = () => {
    const rows: (string|number)[][] = [['Section', 'Account', 'Name', 'Current', 'Prior', 'Δ']];
    for (const sec of [data.assets, data.liabilities, data.equity]) {
      sec.lines.forEach((l: any) => rows.push([sec.heading, l.accountCode, l.name, l.current, l.prior, l.delta]));
      rows.push([sec.heading, '', `Total ${sec.heading}`, sec.total.current, sec.total.prior, sec.total.delta]);
    }
    rows.push(['', '', 'Total Liabilities + Equity', data.totalLiabAndEquity.current, data.totalLiabAndEquity.prior, data.totalLiabAndEquity.delta]);
    rows.push(['', '', 'Balance check (assets − L&E)', data.balanceCheck.current, data.balanceCheck.prior, '']);
    return rows;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Balance Sheet</CardTitle>
            <p className="text-xs text-muted-foreground">As of {data.asOf} · prior: {data.priorAsOf}</p>
          </div>
          <div className="flex gap-2 items-center">
            <Badge className={balanced ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
              {balanced ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" /> Balanced</> : <><AlertTriangle className="h-3 w-3 mr-1 inline" /> Off by {fmt(data.balanceCheck.current)}</>}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => downloadCsv(`balance_sheet_${asOf}.csv`, exportRows())}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => downloadPdf(`Balance Sheet — ${asOf}`,
              ['Section', 'Account', 'Name', 'Current', 'Prior', 'Δ'],
              exportRows().slice(1),
              [{ label: 'Balanced', value: balanced ? 'Yes' : `Off by ${fmt(data.balanceCheck.current)}` }],
            )}><Download className="h-3.5 w-3.5 mr-1" /> PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr><th className="text-left p-3">Account</th><th className="text-right p-3">Current</th><th className="text-right p-3">Prior (1y ago)</th><th className="text-right p-3">Δ</th></tr>
          </thead>
          <tbody>
            <SectionRows section={data.assets} />
            <SubtotalRow label="Total Assets" v={data.assets.total} bold highlight />
            <SectionRows section={data.liabilities} />
            <SubtotalRow label="Total Liabilities" v={data.liabilities.total} />
            <SectionRows section={data.equity} />
            <SubtotalRow label="Total Equity" v={data.equity.total} />
            <SubtotalRow label="Total Liabilities + Equity" v={data.totalLiabAndEquity} bold highlight />
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function CfPanel({ from, to }: { from: string; to: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['cf', from, to],
    queryFn: () => api(`/financial-reports/cash-flow?from=${from}&to=${to}`),
  });
  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;

  const exportRows = () => {
    const rows: (string|number)[][] = [['Type', 'Account', 'Name', 'Inflow', 'Outflow', 'Net']];
    rows.push(['HEADER', '', 'Cash channels (opening → closing)', '', '', '']);
    data.channels.forEach((c: any) => rows.push(['Channel', c.accountCode, c.name, c.openingBalance, c.closingBalance, c.netChange]));
    rows.push(['HEADER', '', 'Inflows by category', '', '', '']);
    data.inflowsByCategory.forEach((l: any) => rows.push(['Inflow', l.accountCode, l.name, l.inflow, '', l.inflow]));
    rows.push(['HEADER', '', 'Outflows by category', '', '', '']);
    data.outflowsByCategory.forEach((l: any) => rows.push(['Outflow', l.accountCode, l.name, '', l.outflow, -l.outflow]));
    rows.push(['', '', 'Total inflow', data.totals.totalInflow, '', '']);
    rows.push(['', '', 'Total outflow', '', data.totals.totalOutflow, '']);
    rows.push(['', '', 'Net cash change', '', '', data.totals.netCashChange]);
    return rows;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle>Cash Flow (Direct)</CardTitle>
            <p className="text-xs text-muted-foreground">{data.range.from} → {data.range.to}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadCsv(`cash_flow_${from}_to_${to}.csv`, exportRows())}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => downloadPdf(`Cash Flow ${from} to ${to}`,
              ['Type','Account','Name','Inflow','Outflow','Net'],
              exportRows().slice(1),
              [
                { label: 'Net cash change', value: fmt(data.totals.netCashChange) },
                { label: 'Prior period', value: fmt(data.totals.priorNetCashChange) },
              ],
            )}><Download className="h-3.5 w-3.5 mr-1" /> PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr><th className="text-left p-3">Channel / Counterparty</th><th className="text-right p-3">Opening / Inflow</th><th className="text-right p-3">Closing / Outflow</th><th className="text-right p-3">Net</th></tr>
          </thead>
          <tbody>
            <tr className="bg-muted/40 border-t"><td colSpan={4} className="p-2 font-semibold">Cash channels — opening → closing</td></tr>
            {data.channels.map((c: any) => (
              <tr key={c.accountCode} className="border-t">
                <td className="p-2 pl-6"><code className="text-xs mr-2 text-muted-foreground">{c.accountCode}</code> {c.name}</td>
                <td className="p-2 text-right font-mono">{fmt(c.openingBalance)}</td>
                <td className="p-2 text-right font-mono">{fmt(c.closingBalance)}</td>
                <td className={`p-2 text-right font-mono ${deltaClass(c.netChange)}`}>{fmt(c.netChange)}</td>
              </tr>
            ))}
            <tr className="bg-muted/40 border-t"><td colSpan={4} className="p-2 font-semibold">Cash inflows (by counterparty)</td></tr>
            {data.inflowsByCategory.map((l: any) => (
              <tr key={`in-${l.accountCode}`} className="border-t">
                <td className="p-2 pl-6"><code className="text-xs mr-2 text-muted-foreground">{l.accountCode}</code> {l.name}</td>
                <td className="p-2 text-right font-mono text-green-700">{fmt(l.inflow)}</td>
                <td className="p-2"></td>
                <td className="p-2 text-right font-mono">{fmt(l.inflow)}</td>
              </tr>
            ))}
            <tr className="bg-muted/40 border-t"><td colSpan={4} className="p-2 font-semibold">Cash outflows (by counterparty)</td></tr>
            {data.outflowsByCategory.map((l: any) => (
              <tr key={`out-${l.accountCode}`} className="border-t">
                <td className="p-2 pl-6"><code className="text-xs mr-2 text-muted-foreground">{l.accountCode}</code> {l.name}</td>
                <td className="p-2"></td>
                <td className="p-2 text-right font-mono text-red-700">{fmt(l.outflow)}</td>
                <td className="p-2 text-right font-mono">{fmt(-l.outflow)}</td>
              </tr>
            ))}
            <tr className="font-bold bg-amber-50 border-t-2">
              <td className="p-2">Net cash change</td>
              <td className="p-2 text-right font-mono">{fmt(data.totals.totalInflow)}</td>
              <td className="p-2 text-right font-mono">{fmt(data.totals.totalOutflow)}</td>
              <td className={`p-2 text-right font-mono ${deltaClass(data.totals.netCashChange)}`}>{fmt(data.totals.netCashChange)}</td>
            </tr>
            <tr className="text-xs text-muted-foreground">
              <td className="p-2 pl-3" colSpan={4}>Prior period net change: {fmt(data.totals.priorNetCashChange)}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function TbPanel({ asOf }: { asOf: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['tb', asOf],
    queryFn: () => api(`/financial-reports/trial-balance?asOf=${asOf}`),
  });
  if (isLoading || !data) return <p className="text-muted-foreground">Loading…</p>;

  const balanced = Math.abs(data.totals.difference) < 0.005;
  const exportRows = () => {
    const rows: (string|number)[][] = [['Account', 'Name', 'Type', 'Debit', 'Credit']];
    data.lines.forEach((l: any) => rows.push([l.accountCode, l.name, l.type, l.debit, l.credit]));
    rows.push(['', 'Totals', '', data.totals.debit, data.totals.credit]);
    return rows;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between">
          <div>
            <CardTitle>Trial Balance</CardTitle>
            <p className="text-xs text-muted-foreground">As of {data.asOf}</p>
          </div>
          <div className="flex gap-2 items-center">
            <Badge className={balanced ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}>
              {balanced ? <><CheckCircle2 className="h-3 w-3 mr-1 inline" /> Balanced</> : `Off by ${fmt(data.totals.difference)}`}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => downloadCsv(`trial_balance_${asOf}.csv`, exportRows())}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => downloadPdf(`Trial Balance — ${asOf}`,
              ['Account','Name','Type','Debit','Credit'],
              exportRows().slice(1),
              [{ label: 'Total debits', value: fmt(data.totals.debit) }, { label: 'Total credits', value: fmt(data.totals.credit) }],
            )}><Download className="h-3.5 w-3.5 mr-1" /> PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr><th className="text-left p-3">Account</th><th className="text-left p-3">Name</th><th className="text-left p-3">Type</th><th className="text-right p-3">Debit</th><th className="text-right p-3">Credit</th></tr>
          </thead>
          <tbody>
            {data.lines.map((l: any) => (
              <tr key={l.accountCode} className="border-t">
                <td className="p-2"><code className="text-xs">{l.accountCode}</code></td>
                <td className="p-2">{l.name}</td>
                <td className="p-2 text-muted-foreground"><Badge variant="outline">{l.type}</Badge></td>
                <td className="p-2 text-right font-mono">{l.debit > 0 ? fmt(l.debit) : ''}</td>
                <td className="p-2 text-right font-mono">{l.credit > 0 ? fmt(l.credit) : ''}</td>
              </tr>
            ))}
            <tr className="font-bold bg-amber-50 border-t-2">
              <td className="p-2" colSpan={3}>Totals</td>
              <td className="p-2 text-right font-mono">{fmt(data.totals.debit)}</td>
              <td className="p-2 text-right font-mono">{fmt(data.totals.credit)}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function GlPanel({ from, to, accountCode, setAccountCode }: { from: string; to: string; accountCode: string; setAccountCode: (s: string) => void }) {
  const { data: glCodes = [] } = useQuery<{ code: string; name: string; type: string }[]>({
    queryKey: ['gl-codes'],
    queryFn: () => api('/bank-accounts/gl-codes'),
  });
  const { data, isLoading } = useQuery<any>({
    queryKey: ['gl', accountCode, from, to],
    queryFn: () => api(`/financial-reports/gl-detail?accountCode=${accountCode}&from=${from}&to=${to}`),
    enabled: !!accountCode,
  });

  const exportRows = () => {
    if (!data) return [];
    const rows: (string|number)[][] = [['Date', 'Tx', 'Description', 'Source', 'Debit', 'Credit', 'Running']];
    rows.push(['Opening', '', '', '', '', '', data.openingBalance]);
    data.rows.forEach((r: any) => rows.push([r.postedAt.slice(0, 10), r.transactionId.slice(0, 8), r.description ?? '', `${r.sourceType}${r.sourceId ? `#${r.sourceId}`:''}`, r.debit || '', r.credit || '', r.runningBalance]));
    rows.push(['Closing', '', '', '', '', '', data.closingBalance]);
    return rows;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-end gap-3 flex-wrap">
          <div>
            <CardTitle>GL Detail</CardTitle>
            <p className="text-xs text-muted-foreground">{data ? `${data.accountName} · ${from} → ${to}` : 'Pick an account'}</p>
          </div>
          <div className="flex gap-2 items-end">
            <div>
              <Label className="text-xs">Account</Label>
              <Select value={accountCode} onValueChange={setAccountCode}>
                <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-72">
                  {glCodes.map(c => (
                    <SelectItem key={c.code} value={c.code}><code className="text-xs mr-2">{c.code}</code> {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {data && <>
              <Button size="sm" variant="outline" onClick={() => downloadCsv(`gl_${accountCode}_${from}_to_${to}.csv`, exportRows())}><Download className="h-3.5 w-3.5 mr-1" /> CSV</Button>
              <Button size="sm" variant="outline" onClick={() => downloadPdf(`GL ${accountCode} ${from} to ${to}`,
                ['Date','Tx','Description','Source','Debit','Credit','Running'],
                exportRows().slice(1),
                [{ label: 'Opening', value: fmt(data.openingBalance) }, { label: 'Closing', value: fmt(data.closingBalance) }],
              )}><Download className="h-3.5 w-3.5 mr-1" /> PDF</Button>
            </>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading || !data ? (<p className="text-muted-foreground p-6">Loading…</p>) : (
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Description</th><th className="text-left p-3">Source</th><th className="text-right p-3">Debit</th><th className="text-right p-3">Credit</th><th className="text-right p-3">Running</th></tr>
            </thead>
            <tbody>
              <tr className="bg-muted/30 border-t"><td className="p-2" colSpan={5}>Opening balance</td><td className="p-2 text-right font-mono">{fmt(data.openingBalance)}</td></tr>
              {data.rows.map((r: any) => (
                <tr key={r.id} className="border-t">
                  <td className="p-2">{r.postedAt.slice(0, 10)}</td>
                  <td className="p-2 max-w-md truncate">{r.description ?? '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.sourceType}{r.sourceId ? `#${r.sourceId}`:''}</td>
                  <td className="p-2 text-right font-mono">{r.debit > 0 ? fmt(r.debit) : ''}</td>
                  <td className="p-2 text-right font-mono">{r.credit > 0 ? fmt(r.credit) : ''}</td>
                  <td className="p-2 text-right font-mono">{fmt(r.runningBalance)}</td>
                </tr>
              ))}
              <tr className="bg-amber-50 font-bold border-t-2"><td className="p-2" colSpan={5}>Closing balance</td><td className="p-2 text-right font-mono">{fmt(data.closingBalance)}</td></tr>
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
