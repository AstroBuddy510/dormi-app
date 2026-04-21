CREATE TABLE "residents" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"estate" text NOT NULL,
	"block_number" text NOT NULL,
	"house_number" text NOT NULL,
	"ghana_gps_address" text,
	"zone" text,
	"subscribe_weekly" boolean DEFAULT false NOT NULL,
	"subscription_day" text DEFAULT 'Friday',
	"photo_url" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "residents_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"description" text,
	"categories" text[] DEFAULT '{}' NOT NULL,
	"pin" text,
	"photo_url" text,
	"commission_percent" numeric(5, 2) DEFAULT '5' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "riders" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"pin" text,
	"is_available" boolean DEFAULT true NOT NULL,
	"photo_url" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "riders_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"unit" text DEFAULT '1 unit' NOT NULL,
	"vendor_category" text,
	"brands" text[] DEFAULT '{}'::text[] NOT NULL,
	"image_url" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '30.00' NOT NULL,
	"service_markup_percent" numeric(5, 2) DEFAULT '18.00' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "block_order_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_number" text,
	"name" text NOT NULL,
	"estate" text NOT NULL,
	"status" text DEFAULT 'collecting' NOT NULL,
	"rider_id" integer,
	"total_orders" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
	"scheduled_date" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_partners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_person" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"address" text,
	"commission_percent" numeric(5, 2) DEFAULT '10' NOT NULL,
	"total_deliveries" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"pin" text,
	"photo_url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agents_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"resident_id" integer,
	"resident_name" text,
	"resident_phone" text,
	"subject" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"resident_id" integer NOT NULL,
	"vendor_id" integer,
	"rider_id" integer,
	"agent_id" integer,
	"order_type" text DEFAULT 'single' NOT NULL,
	"block_group_id" integer,
	"delivery_partner_id" integer,
	"is_urgent" boolean DEFAULT false NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"service_fee" numeric(10, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_method" text NOT NULL,
	"is_subscription" boolean DEFAULT false NOT NULL,
	"call_only" boolean DEFAULT false NOT NULL,
	"call_accepted" boolean DEFAULT false NOT NULL,
	"rider_accepted" boolean,
	"rider_accepted_at" timestamp,
	"picked_up_at" timestamp,
	"delivered_at" timestamp,
	"photo_url" text,
	"delivery_photo_url" text,
	"pickup_deadline" timestamp,
	"eta" text,
	"notes" text,
	"paystack_reference" text,
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_zones" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"fee_cedis" numeric(10, 2) DEFAULT '30.00' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_zones_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "delivery_towns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"zone_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_towns_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"phone" text NOT NULL,
	"bank_momo_details" text,
	"salary_type" text DEFAULT 'monthly' NOT NULL,
	"salary_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"daily_float" numeric(10, 2) DEFAULT '0.00',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"category" text DEFAULT 'operations' NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"expense_date" date NOT NULL,
	"notes" text,
	"photo_url" text,
	"created_by_role" text DEFAULT 'accountant' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "float_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"issue_date" date NOT NULL,
	"reconciled" boolean DEFAULT false NOT NULL,
	"receipt_url" text,
	"notes" text,
	"reconciled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"payment_method" text DEFAULT 'Momo' NOT NULL,
	"reference" text,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"notes" text,
	"paid_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_commission_percent" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"courier_commission_fixed" numeric(10, 2) DEFAULT '10.00' NOT NULL,
	"distance_rate_cedis_per_km" numeric(10, 2) DEFAULT '5.00' NOT NULL,
	"distance_threshold_km" numeric(5, 2) DEFAULT '5.00' NOT NULL,
	"accountant_pin" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"resident_id" integer,
	"resident_name" text DEFAULT '' NOT NULL,
	"item_name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_gateway_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'paystack' NOT NULL,
	"public_key" text DEFAULT '' NOT NULL,
	"secret_key" text DEFAULT '' NOT NULL,
	"mode" text DEFAULT 'test' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rider_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"rider_id" integer NOT NULL,
	"sender_role" text DEFAULT 'rider' NOT NULL,
	"sender_name" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"pin" varchar(64),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "admins_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "vendor_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"sender_role" text DEFAULT 'vendor' NOT NULL,
	"sender_name" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "agent_call_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"resident_id" integer,
	"resident_name" text NOT NULL,
	"resident_phone" text NOT NULL,
	"outcome" text DEFAULT 'completed' NOT NULL,
	"order_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_scheduled_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"resident_id" integer,
	"resident_name" text NOT NULL,
	"resident_phone" text NOT NULL,
	"scheduled_for" text,
	"notes" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_temp_call_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_id" integer NOT NULL,
	"resident_id" integer,
	"resident_name" text NOT NULL,
	"resident_phone" text NOT NULL,
	"notes" text,
	"is_done" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "estates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "estates_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"resident_id" integer NOT NULL,
	"agent_id" integer NOT NULL,
	"sender_role" text DEFAULT 'agent' NOT NULL,
	"sender_name" text,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"read_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"resident_id" integer,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"type" varchar(50) DEFAULT 'info' NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "block_order_groups" ADD CONSTRAINT "block_order_groups_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_block_group_id_block_order_groups_id_fk" FOREIGN KEY ("block_group_id") REFERENCES "public"."block_order_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_partner_id_delivery_partners_id_fk" FOREIGN KEY ("delivery_partner_id") REFERENCES "public"."delivery_partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_towns" ADD CONSTRAINT "delivery_towns_zone_id_delivery_zones_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."delivery_zones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "float_issues" ADD CONSTRAINT "float_issues_rider_id_riders_id_fk" FOREIGN KEY ("rider_id") REFERENCES "public"."riders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_payments" ADD CONSTRAINT "payroll_payments_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_requests" ADD CONSTRAINT "item_requests_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_call_logs" ADD CONSTRAINT "agent_call_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_call_logs" ADD CONSTRAINT "agent_call_logs_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_scheduled_calls" ADD CONSTRAINT "agent_scheduled_calls_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_scheduled_calls" ADD CONSTRAINT "agent_scheduled_calls_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_temp_call_list" ADD CONSTRAINT "agent_temp_call_list_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_temp_call_list" ADD CONSTRAINT "agent_temp_call_list_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;