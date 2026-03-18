import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useListItems, GroceryItemCategory } from '@workspace/api-client-react';
import { useCart } from '@/store';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShoppingBag, ArrowLeft, Plus, Minus, Search, PackagePlus, Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

export default function OrderPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: items = [], isLoading } = useListItems();
  const { items: cartItems, addItem, removeItem, getCartTotal } = useCart();
  
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  // Item request state
  const [requestDesc, setRequestDesc] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  const categories = ['All', ...Object.values(GroceryItemCategory)];

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory;
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, search]);

  const totalCartItems = Object.values(cartItems).reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = getCartTotal();

  // Brand picker state
  const [brandPickerItem, setBrandPickerItem] = useState<any>(null);

  const getItemQuantity = (itemId: number) =>
    Object.entries(cartItems)
      .filter(([key]) => key === String(itemId) || key.startsWith(`${itemId}::`))
      .reduce((sum, [, ci]) => sum + ci.quantity, 0);

  const getBrandQuantity = (itemId: number, brand?: string) => {
    const key = brand ? `${itemId}::${brand}` : String(itemId);
    return (cartItems as any)[key]?.quantity || 0;
  };

  const handleAddItem = (item: any, qty: number, brand?: string) => {
    addItem(item, qty, brand);
  };

  const handlePlusClick = (item: any) => {
    const hasBrands = item.brands && item.brands.length > 0;
    if (hasBrands) {
      setBrandPickerItem(item);
    } else {
      addItem(item, 1);
    }
  };

  const handleSubmitRequest = async () => {
    if (!search.trim()) return;
    setSubmittingRequest(true);
    try {
      await fetch(`${BASE}/api/items/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId: (user as any)?.id,
          residentName: (user as any)?.name || (user as any)?.phone || 'Resident',
          itemName: search.trim(),
          description: requestDesc.trim() || undefined,
        }),
      });
      toast({ title: 'Request sent!', description: `We'll try to add "${search.trim()}" to the catalogue soon.` });
      setRequestSent(true);
      setRequestDesc('');
    } catch {
      toast({ title: 'Failed to send request', variant: 'destructive' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header */}
      <div className="bg-white sticky top-0 z-40 border-b border-border shadow-sm">
        <div className="px-4 h-16 flex items-center gap-4">
          <button onClick={() => setLocation('/')} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-display font-bold flex-1">Shop Groceries</h1>
        </div>
        
        <div className="px-4 pb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input 
              placeholder="Search items..." 
              className="pl-10 h-12 bg-gray-100 border-transparent rounded-xl focus-visible:ring-primary/20 focus-visible:border-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Categories */}
        <div className="px-4 pb-4 overflow-x-auto hide-scrollbar flex gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`whitespace-nowrap px-5 py-2 rounded-full font-medium text-sm transition-all duration-200 ${
                activeCategory === cat 
                  ? 'bg-primary text-white shadow-md shadow-primary/20' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Items Grid */}
      <div className="p-4 grid grid-cols-2 gap-4 max-w-md mx-auto">
        {isLoading ? (
          <div className="col-span-2 text-center py-12 text-muted-foreground">Loading fresh items...</div>
        ) : filteredItems.length === 0 ? (
          <div className="col-span-2 py-6">
            <div className="text-center mb-5">
              <PackagePlus size={36} className="mx-auto mb-2 text-muted-foreground/40" />
              <p className="font-semibold text-foreground">
                {search ? `"${search}" not in catalogue` : 'No items found.'}
              </p>
              {search && <p className="text-xs text-muted-foreground mt-1">Can't find what you need? Request it below.</p>}
            </div>

            <AnimatePresence>
              {search && !requestSent && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-border/50 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <PackagePlus size={16} className="text-primary" /> Request this item
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 text-sm font-semibold text-primary">
                    {search}
                  </div>
                  <Textarea
                    placeholder="Any details? (brand, size, quantity…) — optional"
                    className="rounded-xl text-sm resize-none h-20"
                    value={requestDesc}
                    onChange={e => setRequestDesc(e.target.value)}
                  />
                  <Button
                    className="w-full rounded-xl bg-primary hover:bg-primary/90 gap-2"
                    onClick={handleSubmitRequest}
                    disabled={submittingRequest}
                  >
                    <Send size={15} /> {submittingRequest ? 'Sending…' : 'Send Request'}
                  </Button>
                </motion.div>
              )}
              {search && requestSent && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center"
                >
                  <p className="text-2xl mb-2">✅</p>
                  <p className="font-semibold text-green-800">Request sent!</p>
                  <p className="text-xs text-green-700 mt-1">We'll notify you when it's available.</p>
                  <button
                    onClick={() => { setRequestSent(false); setSearch(''); setRequestDesc(''); }}
                    className="mt-3 text-xs underline text-green-700"
                  >
                    Browse more items
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          filteredItems.map(item => {
            const quantity = getItemQuantity(item.id);
            const hasBrands = item.brands && item.brands.length > 0;
            return (
              <motion.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="p-3 border-0 shadow-sm rounded-2xl h-full flex flex-col justify-between bg-white hover:shadow-md transition-shadow">
                  <div>
                    <div className="aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                      <span className="text-4xl">
                        {item.category === 'Vegetables' ? '🥦' : 
                         item.category === 'Fruits' ? '🍎' : 
                         item.category === 'Meat' ? '🥩' : 
                         item.category === 'Dairy' ? '🥛' : '📦'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2">{item.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{item.unit}</p>
                    {hasBrands && (
                      <p className="text-xs text-primary/70 mt-0.5 font-medium">
                        {item.brands.length} brand{item.brands.length > 1 ? 's' : ''} available
                      </p>
                    )}
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between">
                    <span className="font-bold text-primary">₵{item.price.toFixed(2)}</span>
                    
                    {!hasBrands && quantity > 0 ? (
                      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                        <button onClick={() => addItem(item, -1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-foreground hover:bg-gray-50">
                          <Minus size={14} />
                        </button>
                        <span className="font-medium text-sm w-4 text-center">{quantity}</span>
                        <button onClick={() => addItem(item, 1)} className="w-6 h-6 flex items-center justify-center bg-primary text-white rounded shadow-sm hover:bg-primary/90">
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : hasBrands && quantity > 0 ? (
                      <button
                        onClick={() => setBrandPickerItem(item)}
                        className="flex items-center gap-1 bg-primary text-white text-xs font-semibold rounded-lg px-2.5 py-1.5 hover:bg-primary/90 transition-colors"
                      >
                        <Plus size={12} /> {quantity} in cart
                      </button>
                    ) : (
                      <button 
                        onClick={() => handlePlusClick(item)}
                        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors"
                      >
                        <Plus size={18} />
                      </button>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Brand Picker Bottom Sheet */}
      <AnimatePresence>
        {brandPickerItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={() => setBrandPickerItem(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto"
            >
              <div className="px-5 pt-4 pb-2 border-b border-border">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
                <h3 className="font-bold text-foreground text-base">{brandPickerItem.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Choose your preferred brand</p>
              </div>
              <div className="px-5 py-4 space-y-2.5 max-h-72 overflow-y-auto">
                {brandPickerItem.brands.map((brand: string) => {
                  const bQty = getBrandQuantity(brandPickerItem.id, brand);
                  return (
                    <div key={brand} className="flex items-center justify-between bg-gray-50 rounded-2xl px-4 py-3">
                      <div>
                        <p className="font-medium text-sm text-foreground">{brand}</p>
                        <p className="text-xs text-muted-foreground">₵{brandPickerItem.price.toFixed(2)} · {brandPickerItem.unit}</p>
                      </div>
                      {bQty > 0 ? (
                        <div className="flex items-center gap-2 bg-white rounded-xl p-1 border border-border">
                          <button onClick={() => handleAddItem(brandPickerItem, -1, brand)} className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg text-foreground hover:bg-gray-200">
                            <Minus size={13} />
                          </button>
                          <span className="font-semibold text-sm w-5 text-center">{bQty}</span>
                          <button onClick={() => handleAddItem(brandPickerItem, 1, brand)} className="w-7 h-7 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary/90">
                            <Plus size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleAddItem(brandPickerItem, 1, brand)}
                          className="bg-primary text-white text-xs font-semibold rounded-xl px-3 py-2 hover:bg-primary/90 transition-colors flex items-center gap-1"
                        >
                          <Plus size={12} /> Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-5 pb-6 pt-2">
                <Button
                  variant="outline"
                  className="w-full rounded-2xl"
                  onClick={() => setBrandPickerItem(null)}
                >
                  Done
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Floating Cart Bar */}
      {totalCartItems > 0 && (
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto"
        >
          <Button 
            className="w-full h-14 bg-primary hover:bg-primary/90 text-white rounded-2xl shadow-xl shadow-primary/30 flex items-center justify-between px-6"
            onClick={() => setLocation('/checkout')}
          >
            <div className="flex items-center gap-2">
              <div className="bg-white/20 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                {totalCartItems}
              </div>
              <span className="font-semibold text-lg">View Cart</span>
            </div>
            <span className="font-bold text-lg tracking-wide">₵{cartTotal.toFixed(2)}</span>
          </Button>
        </motion.div>
      )}
    </div>
  );
}
