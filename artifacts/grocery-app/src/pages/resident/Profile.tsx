import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, MapPin, Home, Phone, User, Save, Building } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface ResidentProfile {
  id: number;
  fullName: string;
  phone: string;
  estate: string;
  blockNumber: string;
  houseNumber: string;
  ghanaGpsAddress?: string;
  zone?: string;
  photoUrl?: string;
  subscribeWeekly?: boolean;
}

export default function ResidentProfile() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: resident, isLoading } = useQuery<ResidentProfile>({
    queryKey: ['resident-profile', user?.id],
    queryFn: () => fetch(`${BASE}/api/residents/${user?.id}`).then(r => r.json()),
    enabled: !!user?.id,
  });

  const [form, setForm] = useState({
    fullName: '',
    estate: '',
    blockNumber: '',
    houseNumber: '',
    ghanaGpsAddress: '',
  });

  useEffect(() => {
    if (resident) {
      setForm({
        fullName: resident.fullName || '',
        estate: resident.estate || '',
        blockNumber: resident.blockNumber || '',
        houseNumber: resident.houseNumber || '',
        ghanaGpsAddress: resident.ghanaGpsAddress || '',
      });
    }
  }, [resident]);

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) =>
      fetch(`${BASE}/api/residents/${user?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(r => {
        if (!r.ok) throw new Error('Update failed');
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resident-profile', user?.id] });
      qc.invalidateQueries({ queryKey: ['/api/residents', user?.id] });
      toast({ title: 'Profile updated', description: 'Your details have been saved.' });
    },
    onError: () => toast({ title: 'Failed to save', description: 'Please try again.', variant: 'destructive' }),
  });

  const avatarLetter = (resident?.fullName || user?.name || 'R').charAt(0).toUpperCase();

  const ZONE_COLORS: Record<string, string> = {
    'Inner Accra': 'bg-green-100 text-green-700',
    'Outer Accra': 'bg-blue-100 text-blue-700',
    'Far': 'bg-orange-100 text-orange-700',
  };

  const handleSave = () => {
    if (!form.fullName.trim()) {
      toast({ title: 'Name is required', variant: 'destructive' });
      return;
    }
    updateMutation.mutate(form);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center pb-24">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Header */}
      <div className="bg-white px-5 pt-12 pb-5 rounded-b-3xl shadow-sm border-b border-border mb-5">
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setLocation('/')}
            className="p-2 rounded-xl hover:bg-gray-100 text-muted-foreground transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-xl font-bold text-foreground">My Profile</h1>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 rounded-full overflow-hidden shadow-lg ring-4 ring-white">
            {resident?.photoUrl
              ? <img src={resident.photoUrl} alt={resident.fullName} className="w-full h-full object-cover" />
              : (
                <div className="w-full h-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-white text-4xl font-bold">
                  {avatarLetter}
                </div>
              )
            }
          </div>
          <div className="text-center">
            <p className="font-bold text-lg text-foreground">{resident?.fullName}</p>
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <Phone size={12} /> {resident?.phone}
            </p>
            {resident?.zone && (
              <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full mt-2 ${ZONE_COLORS[resident.zone] || 'bg-gray-100 text-gray-600'}`}>
                <MapPin size={10} /> {resident.zone}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 max-w-md mx-auto space-y-4">
        {/* Personal Info */}
        <Card className="rounded-2xl border border-border/60 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <User size={16} className="text-primary" />
              <p className="font-semibold text-sm text-foreground">Personal Info</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Full Name</Label>
              <Input
                value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                placeholder="Your full name"
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Phone Number</Label>
              <Input
                value={resident?.phone || ''}
                disabled
                className="rounded-xl h-10 text-sm bg-gray-50 text-muted-foreground"
              />
              <p className="text-[10px] text-muted-foreground">Phone number cannot be changed</p>
            </div>
          </CardContent>
        </Card>

        {/* Address */}
        <Card className="rounded-2xl border border-border/60 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Home size={16} className="text-primary" />
              <p className="font-semibold text-sm text-foreground">Delivery Address</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">Estate / Gated Community</Label>
              <Input
                value={form.estate}
                onChange={e => setForm(f => ({ ...f, estate: e.target.value }))}
                placeholder="e.g. East Legon Hills"
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium">Block</Label>
                <Input
                  value={form.blockNumber}
                  onChange={e => setForm(f => ({ ...f, blockNumber: e.target.value }))}
                  placeholder="e.g. Block A"
                  className="rounded-xl h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground font-medium">House No.</Label>
                <Input
                  value={form.houseNumber}
                  onChange={e => setForm(f => ({ ...f, houseNumber: e.target.value }))}
                  placeholder="e.g. 14"
                  className="rounded-xl h-10 text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ghana GPS */}
        <Card className="rounded-2xl border border-border/60 shadow-sm">
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <MapPin size={16} className="text-primary" />
              <p className="font-semibold text-sm text-foreground">Ghana GPS Address</p>
            </div>

            <div className="space-y-1.5">
              <Input
                value={form.ghanaGpsAddress}
                onChange={e => setForm(f => ({ ...f, ghanaGpsAddress: e.target.value }))}
                placeholder="e.g. GA-184-3795"
                className="rounded-xl h-10 text-sm font-mono tracking-wide"
              />
              <p className="text-xs text-muted-foreground">
                Your Ghana Post GPS digital address. Used for precise delivery routing.
                {resident?.zone && (
                  <span> Current zone: <strong>{resident.zone}</strong></span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 font-bold text-base shadow-lg shadow-primary/20 gap-2"
        >
          <Save size={18} />
          {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
