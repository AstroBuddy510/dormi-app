import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth, useCart } from '@/store';
import { useGetPricing, useCreateOrder, CreateOrderRequestPaymentMethod } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, MapPin, Receipt, CheckCircle, Smartphone, Loader2, ShieldCheck, Banknote } from 'lucide-react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface DeliveryTown { id: number; name: string; zoneId: number | null; zoneName: string | null; feeCedis: number | null; }

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: any) => { openIframe: () => void };
    };
  }
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { getCartTotal, getCartItems, clearCart } = useCart();

  const { data: pricing, isLoading: isPricingLoading } = useGetPricing();
  const { data: gateway } = useQuery<{ publicKey: string; mode: string }>({
    queryKey: ['/api/settings/gateway-public'],
    queryFn: () => fetch(`${BASE}/api/settings/gateway`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });
  const { data: towns = [] } = useQuery<DeliveryTown[]>({
    queryKey: ['/api/finance/towns'],
    queryFn: () => fetch(`${BASE}/api/finance/towns`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
  });

  const [paymentMethod, setPaymentMethod] = useState<CreateOrderRequestPaymentMethod>(
    CreateOrderRequestPaymentMethod.cash_on_delivery,
  );
  const [paystackLoading, setPaystackLoading] = useState(false);
  const [selectedTownId, setSelectedTownId] = useState<string>('');

  const cartItems = getCartItems();
  const subtotal = getCartTotal();
  const serviceFee = pricing ? (subtotal * (pricing.serviceMarkupPercent / 100)) : 0;
  const selectedTown = towns.find(t => String(t.id) === selectedTownId);
  const deliveryFee = selectedTown?.feeCedis != null
    ? selectedTown.feeCedis
    : pricing ? pricing.deliveryFee : 0;
  const total = subtotal + serviceFee + deliveryFee;
  const totalPesewas = Math.round(total * 100);

  const createOrderMutation = useCreateOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        toast({ title: 'Order Placed!', description: 'We are preparing your fresh groceries.' });
        clearCart();
        setLocation('/history');
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? 'Something went wrong. Please try again.';
        toast({ variant: 'destructive', title: 'Order Failed', description: msg });
      },
    },
  });

  const submitOrder = (paystackReference?: string) => {
    if (!user) return;
    const payload: any = {
      residentId: user.id,
      paymentMethod,
      isSubscription: false,
      items: cartItems.map(i => ({ itemId: i.id, quantity: i.quantity, unitPrice: i.price })),
    };
    if (paystackReference) payload.paystackReference = paystackReference;
    if (selectedTownId) payload.deliveryTownId = parseInt(selectedTownId);
    createOrderMutation.mutate({ data: payload });
  };

  const openPaystackPopup = () => {
    const PAYSTACK_PUBLIC_KEY = gateway?.publicKey;
    if (!PAYSTACK_PUBLIC_KEY) {
      toast({ variant: 'destructive', title: 'Payment not configured', description: 'Paystack public key is missing. Ask your admin to configure it in Settings.' });
      return;
    }
    if (!window.PaystackPop) {
      toast({ variant: 'destructive', title: 'Payment unavailable', description: 'Paystack could not load. Please check your internet.' });
      return;
    }

    setPaystackLoading(true);

    const email = `${user?.phone?.replace(/\D/g, '')}@grocerease.com`;
    const reference = `GE-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const handler = window.PaystackPop.setup({
      key: PAYSTACK_PUBLIC_KEY,
      email,
      amount: totalPesewas,
      currency: 'GHS',
      ref: reference,
      label: `Dormi — ${user?.name}`,
      channels: ['mobile_money', 'card', 'bank'],
      metadata: {
        resident_name: user?.name,
        resident_phone: user?.phone,
        items_count: cartItems.length,
      },
      onClose: () => {
        setPaystackLoading(false);
        toast({ title: 'Payment cancelled', description: 'You closed the payment window.' });
      },
      callback: (response: { reference: string }) => {
        setPaystackLoading(false);
        submitOrder(response.reference);
      },
    });

    handler.openIframe();
  };

  const handlePlaceOrder = () => {
    if (paymentMethod === CreateOrderRequestPaymentMethod.paystack) {
      openPaystackPopup();
    } else {
      submitOrder();
    }
  };

  if (cartItems.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <Receipt className="w-16 h-16 text-gray-300 mb-4" />
        <h2 className="text-2xl font-bold text-gray-700">Your cart is empty</h2>
        <Button onClick={() => setLocation('/order')} className="mt-6">Go Shopping</Button>
      </div>
    );
  }

  const isProcessing = createOrderMutation.isPending || paystackLoading;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-4 h-16 flex items-center gap-4 sticky top-0 z-40 border-b border-border shadow-sm">
        <button onClick={() => setLocation('/order')} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-display font-bold">Checkout</h1>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-5 mt-2">

        {/* Delivery Details */}
        <Card className="rounded-2xl border-0 shadow-sm overflow-hidden">
          <div className="bg-primary/10 px-4 py-3 border-b border-primary/10 flex items-center gap-2">
            <MapPin className="text-primary w-5 h-5" />
            <h3 className="font-bold text-primary">Delivery Details</h3>
          </div>
          <CardContent className="p-4 space-y-4">
            <div>
              <p className="font-bold text-foreground">{user?.name}</p>
              <p className="text-muted-foreground text-sm mt-0.5">{user?.phone}</p>
              <p className="text-muted-foreground text-sm mt-0.5">To your registered estate address.</p>
            </div>
            {towns.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-foreground">Your Town / Area</p>
                <Select value={selectedTownId} onValueChange={setSelectedTownId}>
                  <SelectTrigger className="rounded-xl border-border">
                    <SelectValue placeholder="Select your town or area…" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {towns.map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        {t.name}{t.zoneName ? ` (${t.zoneName})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedTownId && (
                  <p className="text-xs text-amber-600">Select your town so we can apply the correct delivery fee.</p>
                )}
                {selectedTown && (
                  <p className="text-xs text-green-700 font-medium">
                    {selectedTown.zoneName ? `${selectedTown.zoneName} zone` : selectedTown.name} · Delivery: GH₵{deliveryFee.toFixed(2)}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <div className="px-4 py-4 border-b border-border">
            <h3 className="font-bold text-foreground">Order Summary ({cartItems.length} item{cartItems.length !== 1 ? 's' : ''})</h3>
          </div>
          <CardContent className="p-0">
            <div className="max-h-52 overflow-y-auto p-4 space-y-3">
              {cartItems.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm text-foreground">{item.quantity}× {item.name}</p>
                    {item.selectedBrand && <p className="text-xs font-medium text-primary/80">Brand: {item.selectedBrand}</p>}
                    <p className="text-xs text-muted-foreground">GH₵{item.price.toFixed(2)} each</p>
                  </div>
                  <p className="font-bold text-sm">GH₵{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>
            <div className="bg-gray-50 p-4 space-y-2 border-t border-border">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>GH₵{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Service Fee ({pricing?.serviceMarkupPercent || 0}%)</span>
                <span>GH₵{serviceFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Delivery Fee{selectedTown ? ` (${selectedTown.name})` : ''}</span>
                <span>GH₵{deliveryFee.toFixed(2)}</span>
              </div>
              <div className="pt-2 mt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="font-bold text-lg text-foreground">Total</span>
                <span className="font-bold text-xl text-primary tracking-tight">GH₵{total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Payment Method */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <div className="px-4 py-4 border-b border-border">
            <h3 className="font-bold text-foreground">Payment Method</h3>
          </div>
          <CardContent className="p-4 space-y-3">

            {/* Paystack — Mobile Money / Card */}
            <div
              className={cn(
                'p-4 rounded-xl border-2 cursor-pointer transition-all',
                paymentMethod === 'paystack'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40',
              )}
              onClick={() => setPaymentMethod(CreateOrderRequestPaymentMethod.paystack)}
            >
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-xl', paymentMethod === 'paystack' ? 'bg-primary/15' : 'bg-gray-100')}>
                  <Smartphone size={20} className={paymentMethod === 'paystack' ? 'text-primary' : 'text-muted-foreground'} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">Mobile Money / Card</p>
                  <p className="text-xs text-muted-foreground">MTN, Vodafone, AirtelTigo, Visa, Mastercard</p>
                </div>
                {paymentMethod === 'paystack' && <CheckCircle className="text-primary w-5 h-5 shrink-0" />}
              </div>
              {paymentMethod === 'paystack' && (
                <div className="mt-3 pt-3 border-t border-primary/20 flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck size={13} className="text-green-600" />
                  <span>Secured & verified by <span className="font-bold text-green-700">Paystack</span></span>
                </div>
              )}
            </div>

            {/* Cash on Delivery */}
            <div
              className={cn(
                'p-4 rounded-xl border-2 cursor-pointer transition-all',
                paymentMethod === 'cash_on_delivery'
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/40',
              )}
              onClick={() => setPaymentMethod(CreateOrderRequestPaymentMethod.cash_on_delivery)}
            >
              <div className="flex items-center gap-3">
                <div className={cn('p-2 rounded-xl', paymentMethod === 'cash_on_delivery' ? 'bg-primary/15' : 'bg-gray-100')}>
                  <Banknote size={20} className={paymentMethod === 'cash_on_delivery' ? 'text-primary' : 'text-muted-foreground'} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm">Cash on Delivery</p>
                  <p className="text-xs text-muted-foreground">Pay cash when your order arrives</p>
                </div>
                {paymentMethod === 'cash_on_delivery' && <CheckCircle className="text-primary w-5 h-5 shrink-0" />}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Place Order Button */}
        <Button
          className="w-full h-14 rounded-xl text-base font-bold shadow-lg shadow-primary/25 mt-2 gap-2"
          onClick={handlePlaceOrder}
          disabled={isProcessing || isPricingLoading}
        >
          {isProcessing ? (
            <>
              <Loader2 size={18} className="animate-spin" />
              {paystackLoading ? 'Opening payment…' : 'Verifying payment…'}
            </>
          ) : paymentMethod === 'paystack' ? (
            <>
              <ShieldCheck size={18} />
              Pay GH₵{total.toFixed(2)} with Paystack
            </>
          ) : (
            <>
              <Banknote size={18} />
              Place Order · GH₵{total.toFixed(2)}
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground pb-2">
          {paymentMethod === 'paystack'
            ? 'You will be taken to a secure Paystack page to complete payment.'
            : 'Your rider will collect payment on delivery.'}
        </p>
      </div>
    </div>
  );
}
