# GrocerEase Accra

## Overview

Full-stack grocery delivery app for gated estates in Accra, Ghana. Supports 4 user roles: Resident, Vendor, Admin, and Rider.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, Zustand, TanStack Query, Wouter
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts/
├── api-server/         # Express API server (port 8080, serves at /api)
│   └── src/routes/     # auth, residents, items, pricing, orders, vendors, riders, admin
└── grocery-app/        # React+Vite frontend (port 20428, serves at /)
    └── src/
        ├── pages/      # Login, Signup, resident/, vendor/, admin/, rider/
        ├── components/ # ui/, layout/ (BottomNav, AdminSidebar, StatusBadge)
        └── store.ts    # Zustand auth + cart stores
lib/
├── api-spec/openapi.yaml   # OpenAPI spec (single source of truth)
├── api-client-react/       # Generated React Query hooks
├── api-zod/                # Generated Zod schemas
└── db/src/schema/          # Drizzle schema (residents, vendors, riders, items, pricing, orders)
```

## User Roles & Access

### Resident (Customer)
- Sign up with: Full Name, Phone, Estate, Block/House number, optional GPS address
- Login with phone number (no PIN needed)
- Browse 50 pre-loaded grocery items across 7 categories
- Checkout with Paystack or Cash on Delivery
- Weekly subscription option (Fridays)

### Vendor
- Login with PIN: **5678** (phone must exist in vendors table)
- Tab 1 "App Orders": accept orders, mark ready, upload photo
- Tab 2 "Call-Only Orders": orders placed by admin via phone call

### Admin
- Login with PIN: **1234** (any phone number)
- Live orders dashboard (All / Pending / In Progress / Delivered)
- Call log form: create orders on behalf of residents
- Rider assignment per order
- Pricing page: set delivery fee (GHS) and service markup (%)
- Friday subscription queue
- **User Management** (`/users`): view all residents/vendors/riders, edit details, upload profile photos, reset PINs, suspend/reactivate, delete
- **Settings** (`/settings`): create riders, add residences, add vendors

### Rider
- Login with PIN: **9012** (phone must exist in riders table)
- View assigned jobs with full address and Ghana GPS code
- Update status: On Way → Picked Up → Delivered
- Upload delivery photo proof

## Pricing Logic
- Delivery fee: flat amount (default GHS 30)
- Service markup: percentage of subtotal (default 18%)
- Total = subtotal + (subtotal × markup%) + delivery fee
- Admin can change fees live — checkout recalculates instantly

## Demo Data

### Residents (phone-based login)
- Kwesi Boateng: 0244567890 (Airport Hills, weekly subscriber)
- Abena Owusu: 0244567891 (East Legon Hills)

### Vendors
- Makola Fresh Produce: 0244000001 (Vegetables, Fruits)
- Estate Supermarket: 0244000002 (Dairy, Staples, Household, Cosmetics)
- Fresh Meats & More: 0244000003 (Meat, Dairy)

### Riders
- Kofi Mensah: 0244111001
- Ama Darko: 0244111002
- Kwame Asante: 0244111003

## Grocery Categories & Items (~50 total)
- **Vegetables** (8): Tomatoes, Onions, Pepper, Garden Eggs, Spinach, Cabbage, Carrots, Spring Onions
- **Fruits** (6): Plantain, Banana, Pineapple, Watermelon, Mango, Oranges
- **Dairy** (5): Fan Ice Milk, Eggs, Fanyogo Yoghurt, Butter, Cheese
- **Meat** (5): Fresh Chicken, Beef, Tilapia, Goat Meat, Pork
- **Household** (5): Sunlight Soap, OMO Powder, Toilet Roll, Dishwashing Liquid, Broom
- **Cosmetics** (5): Close Up Toothpaste, Toothbrush, Vaseline Lotion, Shampoo, Deodorant
- **Staples** (10): Rice 5kg, Rice 1kg, Cooking Oil, Bread, Sugar, Flour, Maggi Cubes, Tomato Paste, Salt, Noodles

## Object Storage (Profile Photos)
- Provisioned via Replit App Storage (GCS-backed)
- Server: `artifacts/api-server/src/lib/objectStorage.ts` + `routes/storage.ts`
- Upload flow: POST `/api/storage/uploads/request-url` → PUT to presigned URL → store objectPath
- Serve photos: GET `/api/storage/objects/<objectPath>`
- Photo columns added to all three user tables (`photo_url`)

## Auth — Per-user PIN override
- Vendors/Riders can have individual PINs (stored as SHA-256 hash)
- If set, individual PIN takes precedence over global fallback (5678 / 9012)
- Admin resets PIN from Users page → PUT `/api/vendors/:id/reset-pin` or `/api/riders/:id/reset-pin`

## API Endpoints
All at `/api` prefix — see `lib/api-spec/openapi.yaml` for full contract.
Codegen: `pnpm --filter @workspace/api-spec run codegen`
DB push: `pnpm --filter @workspace/db run push`
