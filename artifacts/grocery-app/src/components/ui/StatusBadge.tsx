import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const STATUS_LABEL: Record<string, string> = {
  pending:    'Pending',
  accepted:   'Accepted - Preparing',
  ready:      'Ready for Pickup',
  in_transit: 'On the Way',
  delivered:  'Delivered',
  cancelled:  'Cancelled',
  vendor_declined: 'Finding New Vendor',
};

const STATUS_COLOR: Record<string, string> = {
  pending:    'bg-amber-50 text-amber-700 border-amber-200',
  accepted:   'bg-blue-50 text-blue-700 border-blue-200',
  ready:      'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_transit: 'bg-purple-50 text-purple-700 border-purple-200',
  delivered:  'bg-green-50 text-green-700 border-green-200',
  cancelled:  'bg-red-50 text-red-600 border-red-200',
  vendor_declined: 'bg-orange-50 text-orange-700 border-orange-200',
};

export function StatusBadge({ status, className, label: customLabel }: { status: string; className?: string; label?: string }) {
  const label = customLabel ?? (STATUS_LABEL[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
  const color = STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-700 border-gray-200';
  return (
    <Badge variant="outline" className={cn('font-medium px-2.5 py-0.5', color, className)}>
      {label}
    </Badge>
  );
}
