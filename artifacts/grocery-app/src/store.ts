import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile, GroceryItem } from '@workspace/api-client-react';

interface AuthState {
  user: UserProfile | null;
  role: string | null;
  token: string | null;
  login: (user: UserProfile, role: string, token: string) => void;
  logout: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      role: null,
      token: null,
      login: (user, role, token) => set({ user, role, token }),
      logout: () => set({ user: null, role: null, token: null }),
    }),
    {
      name: 'grocerease-auth',
    }
  )
);

export interface CartItem extends GroceryItem {
  quantity: number;
}

interface CartState {
  items: Record<number, CartItem>;
  addItem: (item: GroceryItem, quantity: number) => void;
  removeItem: (itemId: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartItems: () => CartItem[];
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: {},
      addItem: (item, quantity) => set((state) => {
        const existing = state.items[item.id];
        const newQuantity = existing ? existing.quantity + quantity : quantity;
        
        if (newQuantity <= 0) {
          const newItems = { ...state.items };
          delete newItems[item.id];
          return { items: newItems };
        }
        
        return {
          items: {
            ...state.items,
            [item.id]: { ...item, quantity: newQuantity }
          }
        };
      }),
      removeItem: (itemId) => set((state) => {
        const newItems = { ...state.items };
        delete newItems[itemId];
        return { items: newItems };
      }),
      clearCart: () => set({ items: {} }),
      getCartTotal: () => {
        const { items } = get();
        return Object.values(items).reduce((sum, item) => sum + (item.price * item.quantity), 0);
      },
      getCartItems: () => Object.values(get().items),
    }),
    {
      name: 'grocerease-cart',
    }
  )
);
