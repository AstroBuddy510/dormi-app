import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useListItems, GroceryItemCategory } from '@workspace/api-client-react';
import { useCart } from '@/store';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ShoppingBag, ArrowLeft, Plus, Minus, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { motion } from 'framer-motion';

export default function OrderPage() {
  const [, setLocation] = useLocation();
  const { data: items = [], isLoading } = useListItems();
  const { items: cartItems, addItem, removeItem, getCartTotal } = useCart();
  
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [search, setSearch] = useState('');

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
          <div className="col-span-2 text-center py-12 text-muted-foreground">No items found.</div>
        ) : (
          filteredItems.map(item => {
            const quantity = cartItems[item.id]?.quantity || 0;
            return (
              <motion.div key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card className="p-3 border-0 shadow-sm rounded-2xl h-full flex flex-col justify-between bg-white hover:shadow-md transition-shadow">
                  <div>
                    <div className="aspect-square bg-gray-50 rounded-xl mb-3 flex items-center justify-center overflow-hidden">
                      {/* Placeholder for item image, fallback to emoji/icon based on category */}
                      <span className="text-4xl">
                        {item.category === 'Vegetables' ? '🥦' : 
                         item.category === 'Fruits' ? '🍎' : 
                         item.category === 'Meat' ? '🥩' : 
                         item.category === 'Dairy' ? '🥛' : '📦'}
                      </span>
                    </div>
                    <h3 className="font-semibold text-foreground text-sm leading-tight line-clamp-2">{item.name}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{item.unit}</p>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-bold text-primary">₵{item.price.toFixed(2)}</span>
                    
                    {quantity > 0 ? (
                      <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
                        <button onClick={() => addItem(item, -1)} className="w-6 h-6 flex items-center justify-center bg-white rounded shadow-sm text-foreground hover:bg-gray-50">
                          <Minus size={14} />
                        </button>
                        <span className="font-medium text-sm w-4 text-center">{quantity}</span>
                        <button onClick={() => addItem(item, 1)} className="w-6 h-6 flex items-center justify-center bg-primary text-white rounded shadow-sm hover:bg-primary/90">
                          <Plus size={14} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => addItem(item, 1)}
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

      {/* Floating Cart Bar */}
      {totalCartItems > 0 && (
        <motion.div 
          initial={{ y: 100 }} animate={{ y: 0 }}
          className="fixed bottom-20 left-4 right-4 z-50 max-w-md mx-auto"
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
