import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useResidentSignup } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, ChevronsUpDown } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Signup() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const signupMutation = useResidentSignup();

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    estate: '',
    blockNumber: '',
    houseNumber: '',
    ghanaGpsAddress: ''
  });
  const [estateOpen, setEstateOpen] = useState(false);
  const [estateInput, setEstateInput] = useState('');
  const [estateError, setEstateError] = useState('');

  const { data: existingEstates = [] } = useQuery<string[]>({
    queryKey: ['estates'],
    queryFn: () => fetch('/api/residents/estates').then(r => r.json()),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.estate.trim()) {
      setEstateError('Please select or type your estate name.');
      return;
    }
    setEstateError('');
    signupMutation.mutate(
      { data: formData as any },
      {
        onSuccess: () => {
          toast({ title: "Account created!", description: "You can now log in." });
          setLocation('/login');
        },
        onError: (err: any) => {
          const msg = err?.data?.message ?? err?.message ?? 'Please check your details and try again.';
          toast({ variant: "destructive", title: "Signup failed", description: msg });
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
                  <Popover open={estateOpen} onOpenChange={setEstateOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={estateOpen}
                        className={`w-full h-12 rounded-xl justify-between font-normal ${estateError ? 'border-red-400' : ''}`}
                      >
                        <span className={formData.estate ? '' : 'text-muted-foreground'}>
                          {formData.estate || 'Select or type your estate'}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search or type estate name..."
                          value={estateInput}
                          onValueChange={setEstateInput}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {estateInput.trim() ? (
                              <button
                                type="button"
                                className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent rounded-sm"
                                onClick={() => {
                                  const val = estateInput.trim();
                                  setFormData({ ...formData, estate: val });
                                  setEstateInput('');
                                  setEstateOpen(false);
                                  setEstateError('');
                                }}
                              >
                                Use &quot;{estateInput.trim()}&quot;
                              </button>
                            ) : (
                              <span className="px-2 py-1.5 text-sm text-muted-foreground">No estates found.</span>
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {existingEstates.map((estate) => (
                              <CommandItem
                                key={estate}
                                value={estate}
                                onSelect={(val) => {
                                  setFormData({ ...formData, estate: val });
                                  setEstateInput('');
                                  setEstateOpen(false);
                                  setEstateError('');
                                }}
                              >
                                {estate}
                              </CommandItem>
                            ))}
                            {estateInput.trim() && !existingEstates.map(e => e.toLowerCase()).includes(estateInput.trim().toLowerCase()) && (
                              <CommandItem
                                value={estateInput.trim()}
                                onSelect={(val) => {
                                  setFormData({ ...formData, estate: val });
                                  setEstateInput('');
                                  setEstateOpen(false);
                                  setEstateError('');
                                }}
                              >
                                Use &quot;{estateInput.trim()}&quot;
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {estateError && <p className="text-xs text-red-500 mt-1">{estateError}</p>}
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
