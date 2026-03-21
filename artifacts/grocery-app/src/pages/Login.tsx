import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/store';
import { useLogin, LoginRequestRole } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Phone } from 'lucide-react';
import { motion } from 'framer-motion';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function Login() {
  const [, setLocation] = useLocation();
  const { login } = useAuth();
  const { toast } = useToast();
  const loginMutation = useLogin();

  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<LoginRequestRole>(LoginRequestRole.resident);
  const [pin, setPin] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(
      { data: { phone, role, pin: role !== 'resident' ? pin : undefined } },
      {
        onSuccess: (data) => {
          login(data.user, data.role, data.token);
          toast({ title: "Welcome back!", description: `Logged in as ${data.user.name}` });
          setLocation('/');
        },
        onError: (err: any) => {
          // Check if resident needs to signup
          if (role === 'resident' && err.message?.includes('not found')) {
            toast({ title: "Account not found", description: "Please sign up first." });
            setLocation('/signup');
          } else {
            toast({ variant: "destructive", title: "Login failed", description: "Invalid credentials" });
          }
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary flex flex-col justify-center items-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-primary text-primary-foreground rounded-3xl shadow-xl shadow-primary/20 mb-4">
            <img src={`${BASE}/images/dormi-logo.png`} alt="Dormi Logo" className="w-10 h-10 object-contain" />
          </div>
          <h1 className="text-4xl font-display font-extrabold text-foreground tracking-tight">Dormi</h1>
          <p className="text-muted-foreground mt-2 font-medium">Fresh groceries delivered to your estate.</p>
        </div>

        <Card className="shadow-2xl shadow-black/5 border-0 bg-white/70 backdrop-blur-xl rounded-3xl">
          <CardHeader>
            <CardTitle className="text-2xl font-display">Welcome</CardTitle>
            <CardDescription>Sign in to continue</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                  <Input 
                    id="phone" 
                    placeholder="024 123 4567" 
                    className="pl-10 h-12 bg-background border-border rounded-xl text-lg"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">I am a...</Label>
                <Select value={role} onValueChange={(val: any) => setRole(val)}>
                  <SelectTrigger className="h-12 rounded-xl text-base">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl" position="popper" sideOffset={4}>
                    <SelectItem value="resident" className="text-base py-3">Resident</SelectItem>
                    <SelectItem value="vendor" className="text-base py-3">Vendor</SelectItem>
                    <SelectItem value="rider" className="text-base py-3">Rider</SelectItem>
                    <SelectItem value="admin" className="text-base py-3">Admin</SelectItem>
                    <SelectItem value="accountant" className="text-base py-3">Accountant</SelectItem>
                    <SelectItem value="agent" className="text-base py-3">Call Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {role !== 'resident' && (
                <div className="space-y-2">
                  <Label htmlFor="pin">Access PIN</Label>
                  <Input 
                    id="pin" 
                    type="password"
                    placeholder="Enter your PIN" 
                    className="h-12 rounded-xl text-center tracking-[0.5em] text-lg font-bold"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                  />
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-14 rounded-xl text-lg font-bold shadow-lg shadow-primary/25 transition-all hover:scale-[1.02] active:scale-95"
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Authenticating..." : "Sign In"}
              </Button>

              {role === 'resident' && (
                <p className="text-center text-sm text-muted-foreground mt-4">
                  New resident? <Link href="/signup" className="text-primary font-bold hover:underline">Sign up here</Link>
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
