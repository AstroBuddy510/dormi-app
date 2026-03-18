import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth, useCart } from '@/store';
import { useGetPricing, useCreateOrder, CreateOrderRequestPaymentMethod } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, MapPin, Receipt, CheckCircle, Smartphone } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

export default function CheckoutPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { items: cartItemsMap, getCartTotal, getCartItems, clearCart } = useCart();
  
  const { data: pricing, isLoading: isPricingLoading } = useGetPricing();
  
  const [paymentMethod, setPaymentMethod] = useState<CreateOrderRequestPaymentMethod>(CreateOrderRequestPaymentMethod.cash_on_delivery);
  
  const cartItems = getCartItems();
  const subtotal = getCartTotal();
  const serviceFee = pricing ? (subtotal * (pricing.serviceMarkupPercent / 100)) : 0;
  const deliveryFee = pricing ? pricing.deliveryFee : 0;
  const total = subtotal + serviceFee + deliveryFee;

  const createOrderMutation = useCreateOrder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
        toast({ title: "Order Placed Successfully!", description: "We are preparing your fresh groceries." });
        clearCart();
        setLocation('/history');
      },
      onError: () => {
        toast({ variant: "destructive", title: "Order Failed", description: "Something went wrong. Please try again." });
      }
    }
  });

  const handlePlaceOrder = () => {
    if (!user) return;
    createOrderMutation.mutate({
      data: {
        residentId: user.id,
        paymentMethod: paymentMethod,
        isSubscription: false,
        items: cartItems.map(i => ({
          itemId: i.id,
          quantity: i.quantity,
          unitPrice: i.price
        }))
      }
    });
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

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-white px-4 h-16 flex items-center gap-4 sticky top-0 z-40 border-b border-border shadow-sm">
        <button onClick={() => setLocation('/order')} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-xl font-display font-bold">Checkout</h1>
      </div>

      <div className="p-4 max-w-md mx-auto space-y-6 mt-2">
        {/* Delivery Details */}
        <Card className="rounded-2xl border-0 shadow-sm overflow-hidden">
          <div className="bg-primary/10 px-4 py-3 border-b border-primary/10 flex items-center gap-2">
            <MapPin className="text-primary w-5 h-5" />
            <h3 className="font-bold text-primary">Delivery Address</h3>
          </div>
          <CardContent className="p-4">
            <p className="font-bold text-foreground">{user?.name}</p>
            <p className="text-muted-foreground text-sm mt-1">{user?.phone}</p>
            <p className="text-muted-foreground text-sm mt-1">To your registered estate address.</p>
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card className="rounded-2xl border-0 shadow-sm">
          <div className="px-4 py-4 border-b border-border">
            <h3 className="font-bold text-foreground">Order Summary ({cartItems.length} items)</h3>
          </div>
          <CardContent className="p-0">
            <div className="max-h-60 overflow-y-auto p-4 space-y-4">
              {cartItems.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-sm text-foreground">{item.quantity}x {item.name}</p>
                    {item.selectedBrand && (
                      <p className="text-xs font-medium text-primary/80">Brand: {item.selectedBrand}</p>
                    )}
                    <p className="text-xs text-muted-foreground">₵{item.price.toFixed(2)} each</p>
                  </div>
                  <p className="font-bold text-sm">₵{(item.price * item.quantity).toFixed(2)}</p>
                </div>
              ))}
            </div>
            
            <div className="bg-gray-50 p-4 space-y-2 border-t border-border">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span>₵{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Service Fee ({pricing?.serviceMarkupPercent || 0}%)</span>
                <span>₵{serviceFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Delivery Fee</span>
                <span>₵{deliveryFee.toFixed(2)}</span>
              </div>
              <div className="pt-2 mt-2 border-t border-gray-200 flex justify-between items-center">
                <span className="font-bold text-lg text-foreground">Total</span>
                <span className="font-bold text-xl text-primary tracking-tight">₵{total.toFixed(2)}</span>
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
            <div 
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${paymentMethod === 'paystack' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
              onClick={() => setPaymentMethod(CreateOrderRequestPaymentMethod.paystack)}
            >
              <Smartphone className={paymentMethod === 'paystack' ? 'text-primary' : 'text-muted-foreground'} />
              <div className="flex-1">
                <p className="font-bold text-sm">Mobile Money (Paystack)</p>
                <p className="text-xs text-muted-foreground">Pay securely online</p>
              </div>
              {paymentMethod === 'paystack' && <CheckCircle className="text-primary w-5 h-5" />}
            </div>
            
            <div 
              className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-center gap-3 ${paymentMethod === 'cash_on_delivery' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
              onClick={() => setPaymentMethod(CreateOrderRequestPaymentMethod.cash_on_delivery)}
            >
              <Receipt className={paymentMethod === 'cash_on_delivery' ? 'text-primary' : 'text-muted-foreground'} />
              <div className="flex-1">
                <p className="font-bold text-sm">Cash on Delivery</p>
                <p className="text-xs text-muted-foreground">Pay when it arrives</p>
              </div>
              {paymentMethod === 'cash_on_delivery' && <CheckCircle className="text-primary w-5 h-5" />}
            </div>
          </CardContent>
        </Card>

        <Button 
          className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/25 mt-4"
          onClick={handlePlaceOrder}
          disabled={createOrderMutation.isPending || isPricingLoading}
        >
          {createOrderMutation.isPending ? "Processing..." : `Place Order (₵${total.toFixed(2)})`}
        </Button>
      </div>
    </div>
  );
}
