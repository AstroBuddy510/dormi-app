import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, X, Package, ShoppingCart, Tag } from 'lucide-react';

export const UNITS = [
  'Piece(s)', 'Kg', 'Grams', 'Litres', 'ml',
  'Pounds (lbs)', 'Cartons', 'Crates', 'Bags',
  'Bunches', 'Trays', 'Packs', 'Tins',
  'Bottles', 'Boxes', 'Loaves', 'Rolls', 'Whole',
];

export interface OrderItem {
  _id: number;
  name: string;
  brand: string;
  qty: number;
  unit: string;
  unitPrice: number;
}

export interface ItemsBuilderProps {
  onChange: (rawItems: string) => void;
  color?: 'green' | 'blue';
}

export function toRawItems(items: OrderItem[]): string {
  return items
    .map(i => {
      const displayName = i.brand ? `${i.brand} ${i.name}` : i.name;
      const label = i.unit && i.unit !== 'Piece(s)' ? `${displayName} (${i.unit})` : displayName;
      return `${label}, ${i.qty}, ${i.unitPrice}`;
    })
    .join('\n');
}

interface Draft { name: string; brand: string; qty: number; unit: string; unitPrice: number; }
const BLANK_DRAFT: Draft = { name: '', brand: '', qty: 1, unit: 'Piece(s)', unitPrice: 0 };

function guessUnit(invUnit: string): string {
  if (!invUnit) return 'Piece(s)';
  const u = invUnit.toLowerCase();
  if (u.includes('5kg') || u.includes('1kg') || u.includes('kg') || u.includes('kilo')) return 'Kg';
  if (u.includes('litre') || u.includes('liter') || u.includes('1l') || u.includes('1l ')) return 'Litres';
  if (u.includes('ml') || u.includes('millil')) return 'ml';
  if (u.includes('500g') || u.includes('400g') || u.includes('200g') || u.includes('gram')) return 'Grams';
  if (u.includes('pound') || u.includes(' lb')) return 'Pounds (lbs)';
  if (u.includes('carton')) return 'Cartons';
  if (u.includes('crate')) return 'Crates';
  if (u.includes('bag')) return 'Bags';
  if (u.includes('bunch')) return 'Bunches';
  if (u.includes('tray')) return 'Trays';
  if (u.includes('pack')) return 'Packs';
  if (u.includes('tin')) return 'Tins';
  if (u.includes('bottle')) return 'Bottles';
  if (u.includes('box')) return 'Boxes';
  if (u.includes('loaf') || u.includes('loaves')) return 'Loaves';
  if (u.includes('roll')) return 'Rolls';
  if (u.includes('whole')) return 'Whole';
  return 'Piece(s)';
}

export function ItemsBuilder({ onChange, color = 'green' }: ItemsBuilderProps) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [draft, setDraft] = useState<Draft>({ ...BLANK_DRAFT });
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: inventory = [] } = useQuery<any[]>({
    queryKey: ['inventory-items'],
    queryFn: () => fetch('/api/items').then(r => r.json()),
  });

  const suggestions = query.length > 0
    ? inventory.filter(i =>
        i.name.toLowerCase().includes(query.toLowerCase()) ||
        (i.category && i.category.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 9)
    : inventory.slice(0, 9);

  const pick = (inv: any) => {
    setDraft(prev => ({ ...prev, name: inv.name, unit: guessUnit(inv.unit), unitPrice: inv.price }));
    setQuery(inv.name);
    setOpen(false);
  };

  const addItem = () => {
    const name = (draft.name || query).trim();
    if (!name || draft.qty <= 0) return;
    const newItems: OrderItem[] = [
      ...items,
      { _id: Date.now(), name, brand: draft.brand.trim(), qty: draft.qty, unit: draft.unit, unitPrice: draft.unitPrice },
    ];
    setItems(newItems);
    onChange(toRawItems(newItems));
    setDraft({ ...BLANK_DRAFT });
    setQuery('');
  };

  const removeItem = (id: number) => {
    const newItems = items.filter(i => i._id !== id);
    setItems(newItems);
    onChange(toRawItems(newItems));
  };

  const draftSubtotal = draft.qty * draft.unitPrice;
  const itemsSubtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const accentText = color === 'blue' ? 'text-blue-600' : 'text-green-600';
  const accentBg = color === 'blue' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700';
  const accentBorder = color === 'blue' ? 'border-blue-200' : 'border-green-200';
  const accentRowBg = color === 'blue' ? 'bg-blue-50/40' : 'bg-green-50/40';

  const COL = 'grid gap-2 items-center';
  const COLS_TEMPLATE = { gridTemplateColumns: '1fr 68px 130px 100px 88px 30px' };

  return (
    <div className="space-y-2">
      {/* ── Column headers ─────────────────────────────── */}
      <div
        className={`${COL} px-3 py-1.5 rounded-lg bg-gray-100 text-[11px] font-semibold text-gray-400 uppercase tracking-wider`}
        style={COLS_TEMPLATE}
      >
        <span>Item Name</span>
        <span>Qty</span>
        <span>Unit</span>
        <span>Unit Price (₵)</span>
        <span>Subtotal</span>
        <span />
      </div>

      {/* ── Added items ──────────────────────────────────── */}
      {items.length > 0 && (
        <div className={`border ${accentBorder} rounded-xl overflow-hidden`}>
          {items.map((item, idx) => (
            <div
              key={item._id}
              className={`${COL} px-3 py-2.5 text-sm ${idx % 2 === 0 ? 'bg-white' : accentRowBg} ${idx < items.length - 1 ? 'border-b border-gray-100' : ''}`}
              style={COLS_TEMPLATE}
            >
              <div className="min-w-0">
                <div className="font-medium text-gray-800 truncate" title={item.name}>{item.name}</div>
                {item.brand && (
                  <div className="flex items-center gap-1 text-[11px] text-gray-400 italic truncate mt-0.5">
                    <Tag size={9} className="shrink-0" />{item.brand}
                  </div>
                )}
              </div>
              <span className="font-mono text-gray-700 text-center">{item.qty}</span>
              <span>
                <Badge variant="outline" className="text-[11px] font-normal border-gray-200 text-gray-500 px-1.5">
                  {item.unit}
                </Badge>
              </span>
              <span className="font-mono text-gray-600">₵{item.unitPrice.toFixed(2)}</span>
              <span className={`font-bold ${accentText}`}>₵{(item.qty * item.unitPrice).toFixed(2)}</span>
              <button
                onClick={() => removeItem(item._id)}
                title="Remove"
                className="text-red-300 hover:text-red-600 hover:bg-red-50 rounded p-0.5 transition-colors flex items-center justify-center"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Add-item panel ───────────────────────────────── */}
      <div className="border border-dashed border-gray-200 rounded-xl bg-gray-50/60 p-3 space-y-3">
        {/* Search + Brand row */}
        <div className="grid gap-2" style={{ gridTemplateColumns: '3fr 2fr' }} ref={wrapperRef}>
          {/* Item search / Name */}
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Item</label>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <Input
                placeholder="Search inventory or type item name…"
                className="pl-9 h-9 rounded-lg text-sm bg-white"
                value={query}
                onFocus={() => setOpen(true)}
                onChange={e => {
                  const v = e.target.value;
                  setQuery(v);
                  setDraft(prev => ({ ...prev, name: v }));
                  setOpen(true);
                }}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
              />

              {/* Suggestions dropdown */}
              {open && suggestions.length > 0 && (
                <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider border-b bg-gray-50">
                    {query ? 'Matching items' : 'All inventory'}
                  </div>
                  {suggestions.map((inv: any) => (
                    <button
                      key={inv.id}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 active:bg-gray-100 text-left gap-3 transition-colors"
                      onMouseDown={e => { e.preventDefault(); pick(inv); }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Package size={12} className="text-gray-300 shrink-0" />
                        <span className="font-medium text-gray-800 truncate">{inv.name}</span>
                        <span className="text-[11px] text-gray-400 shrink-0 bg-gray-100 px-1.5 py-0.5 rounded">
                          {inv.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-gray-400">
                        <span>{inv.unit}</span>
                        <span className={`font-semibold ${accentText}`}>₵{inv.price}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Brand / Supplier */}
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide flex items-center gap-1">
              <Tag size={10} /> Brand / Supplier
              <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <Input
              placeholder="e.g. Nescafé, Heinz, Nestle…"
              className="h-9 rounded-lg text-sm bg-white"
              value={draft.brand}
              onChange={e => setDraft(prev => ({ ...prev, brand: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
            />
          </div>
        </div>

        {/* Qty / Unit / Price / Add row */}
        <div className="grid gap-2 items-end" style={{ gridTemplateColumns: '72px 1fr 1fr auto' }}>
          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Qty</label>
            <Input
              type="number"
              min={0.01}
              step={0.01}
              value={draft.qty}
              onChange={e => setDraft(prev => ({ ...prev, qty: parseFloat(e.target.value) || 1 }))}
              className="h-9 rounded-lg text-sm font-mono text-center bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">Unit</label>
            <Select value={draft.unit} onValueChange={v => setDraft(prev => ({ ...prev, unit: v }))}>
              <SelectTrigger className="h-9 rounded-lg text-sm bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide">
              Unit Price (₵){draftSubtotal > 0 && (
                <span className={`ml-1.5 normal-case font-normal ${accentText}`}>
                  = ₵{draftSubtotal.toFixed(2)}
                </span>
              )}
            </label>
            <Input
              type="number"
              min={0}
              step={0.01}
              value={draft.unitPrice === 0 ? '' : draft.unitPrice}
              placeholder="0.00"
              onChange={e => setDraft(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
              className="h-9 rounded-lg text-sm font-mono bg-white"
            />
          </div>

          <Button
            onClick={addItem}
            disabled={!(draft.name || query).trim() || draft.qty <= 0}
            className={`h-9 px-5 rounded-lg gap-1.5 text-sm font-bold self-end ${accentBg} text-white`}
          >
            <Plus size={14} /> Add
          </Button>
        </div>
      </div>

      {/* ── Empty hint ──────────────────────────────────── */}
      {items.length === 0 && (
        <div className="flex items-center gap-2 px-2">
          <ShoppingCart size={13} className="text-gray-300" />
          <span className="text-xs text-gray-400">No items yet — search or type above, then click Add.</span>
        </div>
      )}

      {/* ── Items subtotal ──────────────────────────────── */}
      {items.length > 0 && (
        <div className={`flex items-center justify-between px-3 py-2 rounded-lg border ${accentBorder} ${accentRowBg} text-sm`}>
          <span className="text-gray-500">{items.length} item{items.length !== 1 ? 's' : ''} in list</span>
          <span className={`font-bold text-base ${accentText}`}>Items total: ₵{itemsSubtotal.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}
