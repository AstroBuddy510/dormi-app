import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { format } from 'date-fns';
import {
  Receipt, MapPin, User, Phone, Store, Bike, Clock,
  CreditCard, Package, Camera, FileText,
} from 'lucide-react';

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

interface OrderDetailModalProps {
  order: any | null;
  open: boolean;
  onClose: () => void;
}

export function OrderDetailModal({ order, open, onClose }: OrderDetailModalProps) {
  if (!order) return null;

  const paymentLabel = (order.paymentMethod as string)?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? '—';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[90vh] overflow-y-auto p-0">
        {/* Header band */}
        <div className="sticky top-0 bg-white border-b border-border px-5 pt-5 pb-4 rounded-t-2xl z-10">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Receipt size={18} className="text-primary" />
                <span className="text-lg font-bold">Order #{order.id}</span>
              </div>
              <StatusBadge status={order.status} />
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-1 pl-6">
            {format(new Date(order.createdAt), 'EEEE, MMM d yyyy • h:mm a')}
          </p>
        </div>

        <div className="px-5 py-4 space-y-5">

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
              {!order.vendorName && !order.riderName && !order.deliveryPartnerName && !order.eta && (
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
