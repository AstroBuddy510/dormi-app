import React from 'react';
import { Badge } from '@/components/ui/badge';
import { OrderStatus } from '@workspace/api-client-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function StatusBadge({ status, className }: { status: string, className?: string }) {
  const getStatusColor = (s: string) => {
    switch (s) {
      case OrderStatus.pending:
        return 'bg-red-100 text-red-800 hover:bg-red-200 border-red-200';
      case OrderStatus.accepted:
        return 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200';
      case OrderStatus.ready:
        return 'bg-green-100 text-green-800 hover:bg-green-200 border-green-200';
      case OrderStatus.in_transit:
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200 border-blue-200';
      case OrderStatus.delivered:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-200';
      case OrderStatus.cancelled:
        return 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200 border-zinc-200';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (s: string) => {
    return s.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Badge variant="outline" className={cn("font-medium px-2.5 py-0.5", getStatusColor(status), className)}>
      {getStatusText(status)}
    </Badge>
  );
}
