import { useState, useEffect } from 'react';
import { AdminSidebar } from '@/components/layout/AdminSidebar';
import { useGetPricing, useUpdatePricing } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';

export default function AdminPricing() {
  const { data: pricing, isLoading } = useGetPricing();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [deliveryFee, setDeliveryFee] = useState('');
  const [markup, setMarkup] = useState('');

  useEffect(() => {
    if (pricing) {
      setDeliveryFee(pricing.deliveryFee.toString());
      setMarkup(pricing.serviceMarkupPercent.toString());
    }
  }, [pricing]);

  const updateMutation = useUpdatePricing({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/pricing'] });
        toast({ title: "Pricing Updated", description: "Changes will reflect on new orders immediately." });
      }
    }
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      data: {
        deliveryFee: parseFloat(deliveryFee),
        serviceMarkupPercent: parseFloat(markup)
      }
    });
  };

  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AdminSidebar />
      <div className="flex-1 p-8">
        <h1 className="text-3xl font-display font-bold text-foreground mb-8">Pricing Configuration</h1>

        <div className="max-w-xl">
          <Card className="rounded-2xl shadow-sm border-border/50">
            <CardHeader className="bg-white rounded-t-2xl border-b border-border/50">
              <CardTitle>Global Fees</CardTitle>
              <CardDescription>Adjust the base delivery fee and service markup percentage applied to subtotal.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              {isLoading ? <p>Loading...</p> : (
                <form onSubmit={handleSave} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="delivery">Flat Delivery Fee (GHS)</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-3 text-muted-foreground font-medium">₵</span>
                      <Input 
                        id="delivery" 
                        type="number" 
                        step="0.01" 
                        className="pl-8 h-12 rounded-xl text-lg"
                        value={deliveryFee}
                        onChange={(e) => setDeliveryFee(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="markup">Service Markup (%)</Label>
                    <div className="relative">
                      <Input 
                        id="markup" 
                        type="number" 
                        step="0.1" 
                        className="pr-8 h-12 rounded-xl text-lg"
                        value={markup}
                        onChange={(e) => setMarkup(e.target.value)}
                        required
                      />
                      <span className="absolute right-3 top-3 text-muted-foreground font-medium">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">This percentage is added to the subtotal of the items.</p>
                  </div>

                  <Button 
                    type="submit" 
                    className="w-full h-12 text-base font-bold rounded-xl bg-primary hover:bg-primary/90"
                    disabled={updateMutation.isPending}
                  >
                    <Save className="mr-2 h-5 w-5" /> 
                    {updateMutation.isPending ? "Saving..." : "Save Pricing Settings"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
