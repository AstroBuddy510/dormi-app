import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { format, parseISO } from 'date-fns';
import {
  MapPin, Phone, User, Package, ChevronDown, ChevronRight,
  Boxes, Calendar, Hash, Receipt,
} from 'lucide-react';
import { useState } from 'react';

interface BulkGroupDetailModalProps {
  group: any;
  open: boolean;
  onClose: () => void;
}

function SubOrderRow({ order }: { order: any }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-50 flex items-center justify-center">
            <User size={13} className="text-indigo-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{order.residentName || '—'}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin size={10} />
              {order.residentAddress || '—'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:block">
            {Array.isArray(order.items) ? `${order.items.length} item${order.items.length !== 1 ? 's' : ''}` : ''}
          </span>
          <span className="font-bold text-sm text-green-700">₵{order.total.toFixed(2)}</span>
          {expanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-3 pt-1 bg-muted/20 border-t border-border/40 space-y-2">
          {order.residentPhone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Phone size={11} />
              {order.residentPhone}
            </p>
          )}
          {Array.isArray(order.items) && order.items.length > 0 && (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Items</p>
              <div className="space-y-1">
                {order.items.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-foreground">{item.itemName} <span className="text-muted-foreground">×{item.quantity}</span></span>
                    <span className="font-medium text-green-700">₵{item.totalPrice?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-xs pt-1 border-t border-border/40">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">₵{order.subtotal?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Service Fee</span>
                <span>₵{order.serviceFee?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Delivery Fee</span>
                <span>₵{order.deliveryFee?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold border-t border-border/40 pt-1">
                <span>Total</span>
                <span className="text-green-700">₵{order.total?.toFixed(2)}</span>
              </div>
            </div>
          )}
          {order.notes && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1">Note: {order.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function BulkGroupDetailModal({ group, open, onClose }: BulkGroupDetailModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['/api/block-groups', group?.id, 'orders'],
    queryFn: () => fetch(`/api/block-groups/${group.id}/orders`).then(r => r.json()),
    enabled: open && !!group?.id,
  });

  if (!group) return null;

  const orders: any[] = data?.orders ?? [];
  const groupData = data?.group ?? group;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl rounded-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="p-1.5 rounded-lg bg-indigo-100">
              <Boxes size={16} className="text-indigo-600" />
            </div>
            Bulk Order
            <Badge className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full ml-1">
              {groupData.totalOrders} orders
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Group summary card */}
          <div className="bg-muted/40 rounded-xl p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-2">
                <Hash size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Batch #</p>
                  <p className="text-sm font-mono font-bold">{groupData.batchNumber || `BLK-${groupData.id}`}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <MapPin size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Estate</p>
                  <p className="text-sm font-medium">{groupData.estate}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Package size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Status</p>
                  <StatusBadge status={groupData.status} />
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Receipt size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Total Value</p>
                  <p className="text-sm font-bold text-green-700">₵{groupData.totalAmount?.toFixed(2)}</p>
                </div>
              </div>
              {groupData.riderName && (
                <div className="flex items-start gap-2">
                  <User size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Rider</p>
                    <p className="text-sm font-medium">{groupData.riderName}</p>
                  </div>
                </div>
              )}
              {groupData.scheduledDate && (
                <div className="flex items-start gap-2">
                  <Calendar size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Scheduled</p>
                    <p className="text-sm font-medium">{format(parseISO(groupData.scheduledDate), 'dd MMM yyyy')}</p>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Calendar size={13} className="text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-semibold">Created</p>
                  <p className="text-sm font-medium">{format(parseISO(groupData.createdAt), 'dd MMM yyyy, HH:mm')}</p>
                </div>
              </div>
            </div>
            {groupData.notes && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                📝 {groupData.notes}
              </p>
            )}
          </div>

          {/* Individual orders */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Individual Orders ({orders.length})
            </p>
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Loading orders…</div>
            ) : orders.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No orders found in this group.</div>
            ) : (
              <div className="space-y-2">
                {orders.map((order: any) => (
                  <SubOrderRow key={order.id} order={order} />
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
