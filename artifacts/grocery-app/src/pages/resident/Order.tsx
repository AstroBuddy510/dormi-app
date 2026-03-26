import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { useListItems, GroceryItemCategory } from '@workspace/api-client-react';
import { useCart } from '@/store';
import { useAuth } from '@/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Plus, Minus, Search, PackagePlus, Send, Trash2, X, ShoppingCart, ZoomIn, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const PAGE_SIZE = 20;

export default function OrderPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: items = [], isLoading } = useListItems();
  const { items: cartItems, addItem, getCartTotal, clearCart } = useCart();

  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

  // Infinite scroll — how many items are currently visible
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Item request state
  const [requestDesc, setRequestDesc] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestSent, setRequestSent] = useState(false);

  // Image lightbox
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState('');

  // Brand picker
  const [brandPickerItem, setBrandPickerItem] = useState<any>(null);

  // Quick-add quantity selector (non-brand items)
  const [quickAddItem, setQuickAddItem] = useState<any>(null);
  const [quickAddQty, setQuickAddQty] = useState(1);

  const categories = ['All', ...Object.values(GroceryItemCategory)];

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchCat = activeCategory === 'All' || item.category === activeCategory;
      const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [items, activeCategory, search]);

  // Slice to the visible window
  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = visibleCount < filteredItems.length;

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeCategory, search]);

  // IntersectionObserver — load more when sentinel enters viewport
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount(prev => prev + PAGE_SIZE);
        }
      },
      { rootMargin: '200px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, visibleCount]); // re-attach after each load so new sentinel position is observed

  const handleCategoryChange = (cat: string) => setActiveCategory(cat);
  const handleSearchChange = (val: string) => setSearch(val);

  const totalCartItems = Object.values(cartItems).reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = getCartTotal();

  const getItemQuantity = (itemId: number) =>
    Object.entries(cartItems)
      .filter(([key]) => key === String(itemId) || key.startsWith(`${itemId}::`))
      .reduce((sum, [, ci]) => sum + ci.quantity, 0);

  const getBrandQuantity = (itemId: number, brand: string) => {
    const key = `${itemId}::${brand}`;
    return (cartItems as any)[key]?.quantity || 0;
  };

  const handlePlusClick = (item: any) => {
    if (item.brands && item.brands.length > 0) {
      setBrandPickerItem(item);
    } else {
      setQuickAddItem(item);
      setQuickAddQty(1);
    }
  };

  const handleQuickAddConfirm = () => {
    if (!quickAddItem) return;
    addItem(quickAddItem, quickAddQty);
    setQuickAddItem(null);
    setQuickAddQty(1);
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

  const openLightbox = (url: string, alt: string) => {
    setLightboxUrl(url);
    setLightboxAlt(alt);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Category pills */}
        <div className="px-4 pb-4 overflow-x-auto hide-scrollbar flex gap-2">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
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

      {/* ── Items Grid ─────────────────────────────────────────────────────── */}
      <div className="p-4 max-w-md mx-auto">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl shadow-sm h-52 animate-pulse" />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="py-6">
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
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="bg-white rounded-2xl shadow-sm border border-border/50 p-4 space-y-3"
                >
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <PackagePlus size={16} className="text-primary" /> Request this item
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl px-3 py-2 text-sm font-semibold text-primary">{search}</div>
                  <Textarea
                    placeholder="Any details? (brand, size, quantity…) — optional"
                    className="rounded-xl text-sm resize-none h-20"
                    value={requestDesc}
                    onChange={e => setRequestDesc(e.target.value)}
                  />
                  <Button className="w-full rounded-xl bg-primary hover:bg-primary/90 gap-2" onClick={handleSubmitRequest} disabled={submittingRequest}>
                    <Send size={15} /> {submittingRequest ? 'Sending…' : 'Send Request'}
                  </Button>
                </motion.div>
              )}
              {search && requestSent && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center"
                >
                  <p className="text-2xl mb-2">✅</p>
                  <p className="font-semibold text-green-800">Request sent!</p>
                  <p className="text-xs text-green-700 mt-1">We'll notify you when it's available.</p>
                  <button onClick={() => { setRequestSent(false); setSearch(''); setRequestDesc(''); }}
                    className="mt-3 text-xs underline text-green-700">Browse more items</button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <>
            {/* Subtle item count */}
            <p className="text-xs text-muted-foreground mb-3">
              {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
            </p>

            {/* 2-column grid */}
            <div className="grid grid-cols-2 gap-4">
              {visibleItems.map(item => {
                const quantity = getItemQuantity(item.id);
                const hasBrands = item.brands && item.brands.length > 0;
                return (
                  <motion.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <Card className="p-3 border-0 shadow-sm rounded-2xl h-full flex flex-col justify-between bg-white hover:shadow-md transition-shadow">
                      <div>
                        {/* Thumbnail with zoom icon top-right */}
                        <div className="relative aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                          {item.imageUrl ? (
                            <>
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                loading="lazy"
                                className="w-full h-full object-cover"
                              />
                              {/* Zoom icon — top-right, green circle, 70% opacity */}
                              <button
                                type="button"
                                aria-label={`Zoom ${item.name}`}
                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-primary/70 flex items-center justify-center text-white shadow-sm hover:bg-primary transition-colors"
                                onClick={e => { e.stopPropagation(); openLightbox(item.imageUrl!, item.name); }}
                                onTouchStart={e => { e.stopPropagation(); openLightbox(item.imageUrl!, item.name); }}
                              >
                                <ZoomIn size={13} strokeWidth={2.5} />
                              </button>
                            </>
                          ) : (
                            <span className="text-4xl">
                              {item.category === 'Vegetables' ? '🥦' :
                               item.category === 'Fruits' ? '🍎' :
                               item.category === 'Meat' ? '🥩' :
                               item.category === 'Dairy' ? '🥛' : '📦'}
                            </span>
                          )}
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
              })}
            </div>

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-muted-foreground/40" />
              </div>
            )}

            {/* All-loaded indicator */}
            {!hasMore && filteredItems.length > PAGE_SIZE && (
              <p className="text-center text-xs text-muted-foreground/50 py-4">All {filteredItems.length} items shown</p>
            )}
          </>
        )}
      </div>

      {/* ── Image Lightbox Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label={lightboxAlt}
            onClick={() => setLightboxUrl(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
              onClick={e => e.stopPropagation()}
            >
              <img
                src={lightboxUrl}
                alt={lightboxAlt}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-2xl shadow-2xl"
              />
              <button
                onClick={() => setLightboxUrl(null)}
                className="absolute -top-3 -right-3 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center text-foreground hover:bg-gray-100 transition-colors"
                aria-label="Close image"
              >
                <X size={18} />
              </button>
              {lightboxAlt && (
                <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-sm font-medium px-4 py-2 rounded-b-2xl text-center">
                  {lightboxAlt}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick-Add Quantity Selector ───────────────────────────────────── */}
      <AnimatePresence>
        {quickAddItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-[55]"
              onClick={() => setQuickAddItem(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[56] bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto"
              role="dialog"
              aria-modal="true"
            >
              <div className="px-5 pt-4 pb-2 border-b border-border">
                <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
                <div className="flex items-center gap-3">
                  {quickAddItem.imageUrl && (
                    <img src={quickAddItem.imageUrl} alt={quickAddItem.name} loading="lazy"
                      className="w-12 h-12 rounded-xl object-cover border border-border shrink-0" />
                  )}
                  <div>
                    <h3 className="font-bold text-foreground text-base leading-tight">{quickAddItem.name}</h3>
                    <p className="text-sm text-primary font-semibold">₵{quickAddItem.price.toFixed(2)} · {quickAddItem.unit}</p>
                  </div>
                </div>
              </div>
              <div className="px-5 pt-6 pb-20">
                <p className="text-xs text-muted-foreground mb-4 text-center">How many would you like?</p>
                <div className="flex items-center justify-center gap-6 mb-6">
                  <button
                    onClick={() => setQuickAddQty(q => Math.max(1, q - 1))}
                    className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-foreground hover:bg-gray-200 transition-colors"
                  >
                    <Minus size={20} />
                  </button>
                  <span className="text-3xl font-bold text-foreground w-12 text-center">{quickAddQty}</span>
                  <button
                    onClick={() => setQuickAddQty(q => Math.min(20, q + 1))}
                    className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-white hover:bg-primary/90 transition-colors"
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <div className="text-center text-sm text-muted-foreground mb-5">
                  Total: <span className="font-bold text-foreground">₵{(quickAddItem.price * quickAddQty).toFixed(2)}</span>
                </div>
                <Button
                  className="w-full h-14 rounded-2xl text-base font-bold gap-2 bg-primary hover:bg-primary/90 active:scale-[0.98] transition-transform"
                  onClick={handleQuickAddConfirm}
                  onTouchStart={e => { e.preventDefault(); handleQuickAddConfirm(); }}
                >
                  <ShoppingCart size={18} />
                  Add {quickAddQty} to Cart · ₵{(quickAddItem.price * quickAddQty).toFixed(2)}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Brand Picker Bottom Sheet ─────────────────────────────────────── */}
      <AnimatePresence>
        {brandPickerItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-[55]"
              onClick={() => setBrandPickerItem(null)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[56] bg-white rounded-t-3xl shadow-2xl max-w-md mx-auto"
              role="dialog"
              aria-modal="true"
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
                          <button onClick={() => addItem(brandPickerItem, -1, brand)} className="w-7 h-7 flex items-center justify-center bg-gray-100 rounded-lg text-foreground hover:bg-gray-200">
                            <Minus size={13} />
                          </button>
                          <span className="font-semibold text-sm w-5 text-center">{bQty}</span>
                          <button onClick={() => addItem(brandPickerItem, 1, brand)} className="w-7 h-7 flex items-center justify-center bg-primary text-white rounded-lg hover:bg-primary/90">
                            <Plus size={13} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { addItem(brandPickerItem, 1, brand); setBrandPickerItem(null); }}
                          className="bg-primary text-white text-xs font-semibold rounded-xl px-3 py-2 hover:bg-primary/90 transition-colors flex items-center gap-1"
                        >
                          <Plus size={12} /> Add
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="px-5 pb-20 pt-2">
                <Button variant="outline" className="w-full rounded-2xl" onClick={() => setBrandPickerItem(null)}>Done</Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Floating Cart Bar ─────────────────────────────────────────────── */}
      {totalCartItems > 0 && (
        <motion.div
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto flex gap-2"
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="h-14 w-14 shrink-0 bg-white border border-border rounded-2xl shadow-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 size={20} />
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-2xl max-w-xs mx-auto">
              <AlertDialogHeader>
                <AlertDialogTitle>Clear your cart?</AlertDialogTitle>
                <AlertDialogDescription>
                  All {totalCartItems} item{totalCartItems !== 1 ? 's' : ''} will be removed. You can start a new order anytime.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-xl">Keep items</AlertDialogCancel>
                <AlertDialogAction className="rounded-xl bg-red-500 hover:bg-red-600" onClick={clearCart}>Clear cart</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            className="flex-1 h-14 bg-primary hover:bg-primary/90 text-white rounded-2xl shadow-xl shadow-primary/30 flex items-center justify-between px-6"
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
