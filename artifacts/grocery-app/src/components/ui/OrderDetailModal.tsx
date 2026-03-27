import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { DeliveryTimer } from '@/components/ui/DeliveryTimer';
import { format } from 'date-fns';
import {
  Receipt, MapPin, User, Phone, Store, Bike, Clock,
  CreditCard, Package, Camera, FileText, Printer, X,
  ShoppingBag, CheckCheck, UtensilsCrossed, Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CATEGORY_EMOJI: Record<string, string> = {
  Vegetables: '🥦', Fruits: '🍎', Meat: '🥩', Dairy: '🥛',
  Bakery: '🍞', Beverages: '🧃', 'Grains & Cereals': '🌾',
  Condiments: '🧴', Snacks: '🍿', Household: '🧹',
};

function emoji(category?: string) {
  return category ? (CATEGORY_EMOJI[category] || '📦') : '📦';
}

function Section({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon size={14} className="text-primary" />
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ── Order Progress Tracker ──────────────────────────────────────────────────

const PROGRESS_STEPS = [
  { key: 'pending',    label: 'Order Placed',    Icon: ShoppingBag },
  { key: 'accepted',   label: 'Order Received',  Icon: CheckCheck },
  { key: 'ready',      label: 'Being Prepared',  Icon: UtensilsCrossed },
  { key: 'in_transit', label: 'On the Way',      Icon: Bike },
  { key: 'delivered',  label: 'Delivered',       Icon: Home },
] as const;

const STEP_ORDER = PROGRESS_STEPS.map(s => s.key);

function getStepIndex(status: string): number {
  const idx = STEP_ORDER.indexOf(status as typeof STEP_ORDER[number]);
  return idx === -1 ? 0 : idx;
}

function OrderProgressTracker({ status }: { status: string }) {
  const cancelled = status === 'cancelled';
  const currentIdx = cancelled ? -1 : getStepIndex(status);

  return (
    <div className="bg-white rounded-2xl border border-border/60 px-4 pt-4 pb-5 shadow-sm">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
        Order Status
      </p>

      {cancelled ? (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <span className="text-red-500 text-lg">✕</span>
          <div>
            <p className="font-semibold text-red-700 text-sm">Order Cancelled</p>
            <p className="text-xs text-red-400">This order was cancelled.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-1">
          {PROGRESS_STEPS.map((step, idx) => {
            const done    = idx < currentIdx;
            const active  = idx === currentIdx;
            const future  = idx > currentIdx;

            return (
              <div key={step.key} className="flex flex-col items-center flex-1 relative">
                {/* Connector line – left half */}
                {idx > 0 && (
                  <div
                    className={cn(
                      'absolute left-0 top-4 w-1/2 h-0.5 -translate-y-1/2',
                      done || active ? 'bg-primary' : 'bg-gray-200',
                    )}
                  />
                )}
                {/* Connector line – right half */}
                {idx < PROGRESS_STEPS.length - 1 && (
                  <div
                    className={cn(
                      'absolute right-0 top-4 w-1/2 h-0.5 -translate-y-1/2',
                      done ? 'bg-primary' : 'bg-gray-200',
                    )}
                  />
                )}

                {/* Circle icon */}
                <div
                  className={cn(
                    'relative z-10 flex items-center justify-center rounded-full w-8 h-8 shrink-0 transition-all',
                    done   && 'bg-primary text-white shadow-sm',
                    active && 'bg-primary text-white shadow-md ring-4 ring-primary/20',
                    future && 'bg-gray-100 text-gray-400',
                  )}
                >
                  <step.Icon size={14} />
                  {active && (
                    <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
                  )}
                </div>

                {/* Label */}
                <p
                  className={cn(
                    'mt-2 text-center leading-tight',
                    done || active ? 'text-primary font-semibold' : 'text-gray-400 font-medium',
                    'text-[9px]',
                  )}
                >
                  {step.label}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────

interface OrderDetailModalProps {
  order: any | null;
  open: boolean;
  onClose: () => void;
}

export function OrderDetailModal({ order, open, onClose }: OrderDetailModalProps) {
  const printRef = useRef<HTMLDivElement>(null);

  if (!order) return null;

  const paymentLabel = (order.paymentMethod as string)?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? '—';

  const handlePrint = () => {
    const items = (order.items ?? []).map((item: any) =>
      `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;">${emoji(item.category)} ${item.itemName}${item.selectedBrand ? ` <span style="color:#16a34a;font-size:11px;">(${item.selectedBrand})</span>` : ''}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">GHs ${Number(item.unitPrice ?? 0).toFixed(2)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600;">GHs ${Number(item.totalPrice ?? (item.unitPrice * item.quantity) ?? 0).toFixed(2)}</td>
      </tr>`
    ).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Order Receipt #${order.id}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #111; padding: 24px; max-width: 600px; margin: 0 auto; }
    .header { text-align: center; border-bottom: 2px solid #16a34a; padding-bottom: 14px; margin-bottom: 16px; }
    .brand { font-size: 22px; font-weight: 800; color: #16a34a; letter-spacing: -0.5px; }
    .brand span { color: #111; }
    .subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
    .order-id { font-size: 18px; font-weight: 700; margin-top: 8px; }
    .date { font-size: 11px; color: #6b7280; margin-top: 3px; }
    .section { margin-bottom: 14px; }
    .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 6px; }
    .info-box { background: #f9fafb; border-radius: 8px; padding: 10px 12px; }
    .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 12px; }
    .info-row:last-child { margin-bottom: 0; }
    .info-label { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; }
    thead { background: #f3f4f6; }
    th { padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #6b7280; font-weight: 600; }
    th:last-child, td:last-child { text-align: right; }
    th:nth-child(2), td:nth-child(2) { text-align: center; }
    .totals { margin-top: 10px; }
    .total-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; color: #6b7280; }
    .total-final { font-size: 15px; font-weight: 800; color: #16a34a; border-top: 2px solid #e5e7eb; padding-top: 8px; margin-top: 6px; display: flex; justify-content: space-between; }
    .notes { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 8px 12px; font-size: 12px; }
    .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 12px; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 100px; font-size: 11px; font-weight: 600; background: #dcfce7; color: #15803d; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">Dormi</div>
    <div class="subtitle">Fresh groceries delivered to your estate</div>
    <div class="order-id">Order Receipt #${order.id} &nbsp;<span class="status-badge">${order.status}</span></div>
    <div class="date">${format(new Date(order.createdAt), 'EEEE, MMMM d yyyy • h:mm a')}</div>
  </div>

  <div class="section">
    <div class="section-title">Customer</div>
    <div class="info-box">
      <div class="info-row"><span class="info-label">Name</span><span>${order.residentName || '—'}</span></div>
      <div class="info-row"><span class="info-label">Phone</span><span>${order.residentPhone || '—'}</span></div>
      <div class="info-row"><span class="info-label">Address</span><span style="max-width:280px;text-align:right;">${order.residentAddress || '—'}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Items (${order.items?.length ?? 0})</div>
    <table>
      <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>GHs ${Number(order.subtotal ?? 0).toFixed(2)}</span></div>
      ${order.serviceFee ? `<div class="total-row"><span>Service Fee</span><span>GHs ${Number(order.serviceFee).toFixed(2)}</span></div>` : ''}
      ${order.deliveryFee ? `<div class="total-row"><span>Delivery Fee</span><span>GHs ${Number(order.deliveryFee).toFixed(2)}</span></div>` : ''}
      <div class="total-final"><span>Total</span><span>GHs ${Number(order.total ?? 0).toFixed(2)}</span></div>
      <div class="total-row" style="font-size:11px;color:#9ca3af;"><span>Payment Method</span><span>${paymentLabel}</span></div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">Delivery</div>
    <div class="info-box">
      ${order.vendorName ? `<div class="info-row"><span class="info-label">Vendor</span><span>${order.vendorName}</span></div>` : ''}
      ${order.riderName ? `<div class="info-row"><span class="info-label">Rider</span><span>${order.riderName}</span></div>` : ''}
      ${order.deliveryPartnerName ? `<div class="info-row"><span class="info-label">Delivery Co.</span><span>${order.deliveryPartnerName}</span></div>` : ''}
      ${order.eta ? `<div class="info-row"><span class="info-label">ETA</span><span>${order.eta}</span></div>` : ''}
    </div>
  </div>

  ${order.notes ? `<div class="section"><div class="section-title">Notes</div><div class="notes">${order.notes}</div></div>` : ''}

  <div class="footer">
    Dormi &bull; Printed ${format(new Date(), 'dd MMM yyyy, HH:mm')} &bull; Thank you for your order!
  </div>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=680,height=900');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto p-0 [&>button]:hidden">
        {/* Header band */}
        <div className="sticky top-0 bg-white border-b border-border px-5 pt-4 pb-4 rounded-t-2xl z-10 shadow-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Receipt size={18} className="text-primary shrink-0" />
                <span className="text-base font-bold truncate">Order #{order.id}</span>
                <StatusBadge status={order.status} />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs rounded-xl gap-1 border-primary/30 text-primary hover:bg-primary/10 px-2.5"
                  onClick={handlePrint}
                >
                  <Printer size={12} /> Print
                </Button>
                <DialogClose asChild>
                  <button
                    onClick={onClose}
                    className="h-8 w-8 rounded-xl flex items-center justify-center border border-border bg-gray-50 hover:bg-red-50 hover:border-red-200 hover:text-red-600 text-muted-foreground transition-all"
                    aria-label="Close"
                  >
                    <X size={15} />
                  </button>
                </DialogClose>
              </div>
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-1.5 pl-6">
            {format(new Date(order.createdAt), 'EEEE, MMM d yyyy • h:mm a')}
          </p>
        </div>

        <div className="px-5 py-4 space-y-5">

          {/* Progress tracker */}
          <OrderProgressTracker status={order.status} />

          {/* Resident Info */}
          <Section title="Customer" icon={User}>
            <div className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <User size={13} className="text-muted-foreground shrink-0" />
                <span className="font-semibold text-sm">{order.residentName || '—'}</span>
              </div>
              {order.residentPhone && (
                <div className="flex items-center gap-2">
                  <Phone size={13} className="text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">{order.residentPhone}</span>
                </div>
              )}
              {order.residentAddress && (
                <div className="flex items-start gap-2">
                  <MapPin size={13} className="text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-sm text-muted-foreground leading-snug">{order.residentAddress}</span>
                </div>
              )}
            </div>
          </Section>

          {/* Items Table */}
          <Section title={`Items (${order.items?.length ?? 0})`} icon={Package}>
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground">Item</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center">Qty</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Unit Price</th>
                    <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {(order.items ?? []).map((item: any, i: number) => (
                    <tr key={i} className="bg-white">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-base leading-none">{emoji(item.category)}</span>
                          <div>
                            <p className="font-medium leading-tight">{item.itemName}</p>
                            {item.selectedBrand && (
                              <p className="text-xs text-primary/70 font-medium">Brand: {item.selectedBrand}</p>
                            )}
                            {item.category && (
                              <p className="text-xs text-muted-foreground">{item.category}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold">{item.quantity}</td>
                      <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">
                        ₵{Number(item.unitPrice ?? 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono font-semibold">
                        ₵{Number(item.totalPrice ?? (item.unitPrice * item.quantity) ?? 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Pricing Breakdown */}
          <Section title="Pricing Breakdown" icon={Receipt}>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">₵{Number(order.subtotal ?? 0).toFixed(2)}</span>
              </div>
              {order.serviceFee !== undefined && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Service Fee</span>
                  <span className="font-mono">₵{Number(order.serviceFee ?? 0).toFixed(2)}</span>
                </div>
              )}
              {order.deliveryFee !== undefined && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Delivery Fee</span>
                  <span className="font-mono">₵{Number(order.deliveryFee ?? 0).toFixed(2)}</span>
                </div>
              )}
              <div className="pt-2 border-t border-border flex justify-between items-center">
                <span className="font-bold text-foreground">Total</span>
                <span className="font-bold text-primary font-mono text-base">₵{Number(order.total ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                <CreditCard size={12} className="text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{paymentLabel}</span>
              </div>
            </div>
          </Section>

          {/* Delivery Info */}
          <Section title="Delivery" icon={Bike}>
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              {order.vendorName && (
                <div className="flex items-center gap-2 text-sm">
                  <Store size={13} className="text-muted-foreground" />
                  <span className="text-muted-foreground">Vendor:</span>
                  <span className="font-medium">{order.vendorName}</span>
                </div>
              )}
              {(order.riderName || order.deliveryPartnerName) && (
                <div className="flex items-center gap-2 text-sm">
                  <Bike size={13} className="text-muted-foreground" />
                  <span className="text-muted-foreground">{order.riderName ? 'Rider' : 'Delivery Co.'}:</span>
                  <span className="font-medium">{order.riderName ?? order.deliveryPartnerName}</span>
                </div>
              )}
              {order.eta && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock size={13} className="text-muted-foreground" />
                  <span className="text-muted-foreground">ETA:</span>
                  <span className="font-medium">{order.eta}</span>
                </div>
              )}
              {(order as any).riderAcceptedAt && (
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-0.5 text-xs font-medium">
                    ✓ Rider Accepted
                  </span>
                </div>
              )}
              {(order as any).pickedUpAt && (
                <div className="pt-1">
                  <DeliveryTimer
                    pickedUpAt={(order as any).pickedUpAt}
                    deliveredAt={(order as any).deliveredAt}
                  />
                </div>
              )}
              {!order.vendorName && !order.riderName && !order.deliveryPartnerName && !order.eta && !(order as any).riderAcceptedAt && (
                <p className="text-xs text-muted-foreground italic">No delivery details yet.</p>
              )}
            </div>
          </Section>

          {/* Notes */}
          {order.notes && (
            <Section title="Notes" icon={FileText}>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-900">
                {order.notes}
              </div>
            </Section>
          )}

          {/* Photos */}
          {(order.photoUrl || order.deliveryPhotoUrl) && (
            <Section title="Photos" icon={Camera}>
              <div className="grid grid-cols-2 gap-3">
                {order.photoUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Pickup Photo</p>
                    <a href={order.photoUrl} target="_blank" rel="noopener noreferrer">
                      <img src={order.photoUrl} alt="Pickup" className="rounded-xl w-full aspect-square object-cover border border-border hover:opacity-90 transition-opacity" />
                    </a>
                  </div>
                )}
                {order.deliveryPhotoUrl && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Delivery Photo</p>
                    <a href={order.deliveryPhotoUrl} target="_blank" rel="noopener noreferrer">
                      <img src={order.deliveryPhotoUrl} alt="Delivery" className="rounded-xl w-full aspect-square object-cover border border-border hover:opacity-90 transition-opacity" />
                    </a>
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* Print CTA */}
          <div className="flex justify-center pt-1 pb-2">
            <Button
              variant="outline"
              className="gap-2 rounded-xl text-primary border-primary/30 hover:bg-primary/10"
              onClick={handlePrint}
            >
              <Printer size={15} /> Print Rider Copy
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
