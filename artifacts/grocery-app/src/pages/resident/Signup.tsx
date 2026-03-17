import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useResidentSignup, ResidentSignupRequestEstate } from '@workspace/api-client-react';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const signupMutation = useResidentSignup();

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    estate: ResidentSignupRequestEstate.Airport_Hills,
    blockNumber: '',
    houseNumber: '',
    ghanaGpsAddress: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    signupMutation.mutate(
      { data: formData },
      {
        onSuccess: () => {
          toast({ title: "Account created!", description: "You can now log in." });
          setLocation('/login');
        },
        onError: () => {
          toast({ variant: "destructive", title: "Signup failed", description: "Please check your details and try again." });
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <Link href="/login" className="inline-flex items-center text-muted-foreground hover:text-primary mb-6 transition-colors font-medium">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Login
        </Link>
        
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="rounded-3xl shadow-xl shadow-black/5 border-0">
            <CardHeader className="pb-4">
              <CardTitle className="text-3xl font-display text-foreground">Create Account</CardTitle>
              <p className="text-muted-foreground">Join GrocerEase for fast estate delivery.</p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input 
                    required 
                    className="h-12 rounded-xl"
                    placeholder="Kwame Mensah"
                    value={formData.fullName}
                    onChange={e => setFormData({...formData, fullName: e.target.value})}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Phone Number</Label>
                  <Input 
                    required 
                    type="tel"
                    className="h-12 rounded-xl"
                    placeholder="024 123 4567"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Estate</Label>
                  <Select 
                    value={formData.estate} 
                    onValueChange={(val: any) => setFormData({...formData, estate: val})}
                  >
                    <SelectTrigger className="h-12 rounded-xl">
                      <SelectValue placeholder="Select your estate" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ResidentSignupRequestEstate.Airport_Hills}>Airport Hills</SelectItem>
                      <SelectItem value={ResidentSignupRequestEstate.East_Legon_Hills}>East Legon Hills</SelectItem>
                      <SelectItem value={ResidentSignupRequestEstate.Trassaco_Valley}>Trassaco Valley</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Block / Street</Label>
                    <Input 
                      required 
                      className="h-12 rounded-xl"
                      placeholder="e.g. Block A"
                      value={formData.blockNumber}
                      onChange={e => setFormData({...formData, blockNumber: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>House Number</Label>
                    <Input 
                      required 
                      className="h-12 rounded-xl"
                      placeholder="e.g. 42"
                      value={formData.houseNumber}
                      onChange={e => setFormData({...formData, houseNumber: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Ghana GPS (Optional)</Label>
                  <Input 
                    className="h-12 rounded-xl"
                    placeholder="GA-123-4567"
                    value={formData.ghanaGpsAddress}
                    onChange={e => setFormData({...formData, ghanaGpsAddress: e.target.value})}
                  />
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-lg font-bold mt-6 shadow-lg shadow-primary/20 hover:-translate-y-0.5 transition-all"
                  disabled={signupMutation.isPending}
                >
                  {signupMutation.isPending ? "Creating..." : "Sign Up"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
