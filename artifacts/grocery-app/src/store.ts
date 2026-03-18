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
  selectedBrand?: string;
}

interface CartState {
  items: Record<string, CartItem>;
  addItem: (item: GroceryItem, quantity: number, brand?: string) => void;
  removeItem: (itemId: number, brand?: string) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartItems: () => CartItem[];
}

function cartKey(itemId: number, brand?: string) {
  return brand ? `${itemId}::${brand}` : `${itemId}`;
}

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: {},
      addItem: (item, quantity, brand) => set((state) => {
        const key = cartKey(item.id, brand);
        const existing = state.items[key];
        const newQuantity = existing ? existing.quantity + quantity : quantity;

        if (newQuantity <= 0) {
          const newItems = { ...state.items };
          delete newItems[key];
          return { items: newItems };
        }

        return {
          items: {
            ...state.items,
            [key]: { ...item, quantity: newQuantity, selectedBrand: brand }
          }
        };
      }),
      removeItem: (itemId, brand) => set((state) => {
        const key = cartKey(itemId, brand);
        const newItems = { ...state.items };
        delete newItems[key];
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
