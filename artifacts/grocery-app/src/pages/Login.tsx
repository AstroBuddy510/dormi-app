import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/store';
import { useLogin, LoginRequestRole } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Phone, Lock } from 'lucide-react';
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
          if (role === 'resident' && err.message?.includes('not found')) {
            toast({ title: "Account not found", description: "Please sign up first." });
            setLocation('/signup');
          } else {
            toast({ variant: "destructive", title: "Login failed", description: "Invalid credentials" });
          }
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #f0fdf4 0%, #dcfce7 40%, #f8fafc 100%)' }}
    >
      <div className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(22,163,74,0.08) 0%, transparent 60%), radial-gradient(circle at 80% 80%, rgba(22,163,74,0.05) 0%, transparent 50%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-sm relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.05 }}
            className="mb-5"
          >
            <img
              src={`${BASE}/images/dormi-logo.png`}
              alt="Dormi"
              className="w-24 h-24 rounded-3xl shadow-2xl"
              style={{ boxShadow: '0 20px 50px rgba(22,163,74,0.25), 0 8px 16px rgba(0,0,0,0.08)' }}
            />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
            className="text-5xl font-display font-extrabold tracking-tight text-gray-900"
          >
            Dormi
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25, duration: 0.4 }}
            className="mt-2 text-sm text-gray-500 font-medium text-center"
          >
            Fresh groceries delivered to your estate
          </motion.p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="bg-white rounded-3xl shadow-xl shadow-black/[0.06] border border-gray-100 px-6 py-8"
        >
          <div className="mb-7">
            <h2 className="text-xl font-bold text-gray-900">Welcome back</h2>
            <p className="text-sm text-gray-500 mt-0.5">Sign in to your account to continue</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="phone" className="text-sm font-semibold text-gray-700">Phone Number</Label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-gray-400" size={17} />
                <Input
                  id="phone"
                  placeholder="024 123 4567"
                  className="pl-10 h-12 bg-gray-50 border-gray-200 rounded-xl text-base focus:bg-white transition-colors"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="role" className="text-sm font-semibold text-gray-700">I am a...</Label>
              <Select value={role} onValueChange={(val: any) => setRole(val)}>
                <SelectTrigger className="h-12 rounded-xl bg-gray-50 border-gray-200 text-base focus:bg-white">
                  <SelectValue placeholder="Select your role" />
                </SelectTrigger>
                <SelectContent className="rounded-xl" position="popper" sideOffset={4}>
                  <SelectItem value="resident"    className="text-base py-3">Resident</SelectItem>
                  <SelectItem value="vendor"      className="text-base py-3">Vendor</SelectItem>
                  <SelectItem value="rider"       className="text-base py-3">Rider</SelectItem>
                  <SelectItem value="admin"       className="text-base py-3">Admin</SelectItem>
                  <SelectItem value="accountant"  className="text-base py-3">Accountant</SelectItem>
                  <SelectItem value="agent"       className="text-base py-3">Call Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {role !== 'resident' && (
              <div className="space-y-1.5">
                <Label htmlFor="pin" className="text-sm font-semibold text-gray-700">Access PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                  <Input
                    id="pin"
                    type="password"
                    placeholder="••••"
                    className="pl-10 h-12 rounded-xl bg-gray-50 border-gray-200 text-center tracking-[0.4em] text-lg font-bold focus:bg-white transition-colors"
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-13 rounded-xl text-base font-bold mt-1 shadow-md shadow-primary/20 transition-all hover:shadow-lg hover:shadow-primary/25 hover:scale-[1.01] active:scale-[0.98]"
              style={{ height: '52px' }}
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in…" : "Sign In"}
            </Button>

            {role === 'resident' && (
              <p className="text-center text-sm text-gray-500 pt-1">
                New here?{' '}
                <Link href="/signup" className="text-primary font-semibold hover:underline">
                  Create an account
                </Link>
              </p>
            )}
          </form>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center text-xs text-gray-400 mt-8"
        >
          © {new Date().getFullYear()} Dormi. All rights reserved.
        </motion.p>
      </motion.div>
    </div>
  );
}
