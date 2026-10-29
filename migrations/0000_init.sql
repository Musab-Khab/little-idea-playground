CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"parent_id" uuid,
	"system_key" text,
	"is_group" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "accounts_code_unique" UNIQUE("code"),
	CONSTRAINT "accounts_system_key_unique" UNIQUE("system_key")
);
--> statement-breakpoint
CREATE TABLE "allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" numeric(18, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance" (
	"staff_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"marked_by" uuid,
	"marked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_staff_id_date_pk" PRIMARY KEY("staff_id","date")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid,
	"user_name" text NOT NULL,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"ref" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"prev_hash" text,
	"hash" text
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_no" text NOT NULL,
	"branch" text DEFAULT '' NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "bank_accounts_account_no_unique" UNIQUE("account_no")
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"ntn" text DEFAULT '' NOT NULL,
	"logo_path" text,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"contact_person" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"ntn" text DEFAULT '' NOT NULL,
	"credit_days" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	"credit_limit" numeric(18, 2) DEFAULT 0 NOT NULL,
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "document_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"line_no" integer NOT NULL,
	"product_id" uuid,
	"account_id" uuid,
	"party_type" text,
	"party_id" uuid,
	"description" text DEFAULT '' NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"rate" numeric(18, 2) DEFAULT 0 NOT NULL,
	"discount_pct" numeric(6, 2) DEFAULT 0 NOT NULL,
	"amount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"debit" numeric(18, 2) DEFAULT 0 NOT NULL,
	"credit" numeric(18, 2) DEFAULT 0 NOT NULL,
	"unit_cost" numeric(18, 4),
	"done_qty" integer DEFAULT 0 NOT NULL,
	"ref_line_id" uuid,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"doc_no" text NOT NULL,
	"date" date NOT NULL,
	"fy_id" uuid NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"party_type" text,
	"party_id" uuid,
	"due_date" date,
	"ref_doc_id" uuid,
	"reference" text DEFAULT '' NOT NULL,
	"method" text,
	"bank_account_id" uuid,
	"cheque_no" text DEFAULT '' NOT NULL,
	"expense_head_id" uuid,
	"kind" text,
	"narration" text DEFAULT '' NOT NULL,
	"subtotal" numeric(18, 2) DEFAULT 0 NOT NULL,
	"discount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"tax_pct" numeric(6, 2) DEFAULT 0 NOT NULL,
	"tax_amount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"total" numeric(18, 2) DEFAULT 0 NOT NULL,
	"paid_amount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"credited_amount" numeric(18, 2) DEFAULT 0 NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	"submitted_by" uuid,
	"submitted_at" timestamp with time zone,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	CONSTRAINT "documents_doc_no_unique" UNIQUE("doc_no")
);
--> statement-breakpoint
CREATE TABLE "expense_heads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "expense_heads_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "financial_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"status" text DEFAULT 'Open' NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	CONSTRAINT "financial_years_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "gl_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"date" date NOT NULL,
	"fy_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"debit" numeric(18, 2) DEFAULT 0 NOT NULL,
	"credit" numeric(18, 2) DEFAULT 0 NOT NULL,
	"party_type" text,
	"party_id" uuid,
	"narration" text DEFAULT '' NOT NULL,
	"is_reversal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"leave_type_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"days" integer NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"days_per_year" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	CONSTRAINT "leave_types_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "number_series" (
	"prefix" text NOT NULL,
	"fy_id" uuid NOT NULL,
	"next" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "number_series_prefix_fy_id_pk" PRIMARY KEY("prefix","fy_id")
);
--> statement-breakpoint
CREATE TABLE "price_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"old_cost" numeric(18, 2) NOT NULL,
	"new_cost" numeric(18, 2) NOT NULL,
	"old_sale" numeric(18, 2) NOT NULL,
	"new_sale" numeric(18, 2) NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"class_name" text DEFAULT '' NOT NULL,
	"series" text DEFAULT '' NOT NULL,
	"edition" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'Textbook' NOT NULL,
	"cost_price" numeric(18, 2) DEFAULT 0 NOT NULL,
	"sale_price" numeric(18, 2) DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"avg_cost" numeric(18, 4) DEFAULT 0 NOT NULL,
	"damaged_qty" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "products_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" text NOT NULL,
	"permission" text NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_pk" PRIMARY KEY("role_id","permission")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"mfa_verified" boolean DEFAULT false NOT NULL,
	"ip" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"emp_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'Employee' NOT NULL,
	"department" text DEFAULT '' NOT NULL,
	"designation" text DEFAULT '' NOT NULL,
	"responsibilities" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"cnic" text DEFAULT '' NOT NULL,
	"joining_date" date,
	"leaving_date" date,
	"employment_status" text DEFAULT 'Active' NOT NULL,
	"basic" numeric(18, 2) DEFAULT 0 NOT NULL,
	"allowances" numeric(18, 2) DEFAULT 0 NOT NULL,
	"deductions" numeric(18, 2) DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "staff_emp_id_unique" UNIQUE("emp_id")
);
--> statement-breakpoint
CREATE TABLE "staff_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"type" text NOT NULL,
	"file_name" text NOT NULL,
	"stored_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"date" date NOT NULL,
	"product_id" uuid NOT NULL,
	"qty_in" integer DEFAULT 0 NOT NULL,
	"qty_out" integer DEFAULT 0 NOT NULL,
	"unit_cost" numeric(18, 4) NOT NULL,
	"value" numeric(18, 2) NOT NULL,
	"balance_qty" integer NOT NULL,
	"is_reversal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"contact_person" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"city" text DEFAULT '' NOT NULL,
	"ntn" text DEFAULT '' NOT NULL,
	"credit_days" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role_id" text NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"totp_secret" text,
	"totp_enabled" boolean DEFAULT false NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_payment_id_documents_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocations" ADD CONSTRAINT "allocations_invoice_id_documents_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_fy_id_financial_years_id_fk" FOREIGN KEY ("fy_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_heads" ADD CONSTRAINT "expense_heads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_entries" ADD CONSTRAINT "gl_entries_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_entries" ADD CONSTRAINT "gl_entries_fy_id_financial_years_id_fk" FOREIGN KEY ("fy_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_entries" ADD CONSTRAINT "gl_entries_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_applications" ADD CONSTRAINT "leave_applications_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "number_series" ADD CONSTRAINT "number_series_fy_id_financial_years_id_fk" FOREIGN KEY ("fy_id") REFERENCES "public"."financial_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_documents" ADD CONSTRAINT "staff_documents_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "alloc_payment" ON "allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "alloc_invoice" ON "allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "audit_entity" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_at" ON "audit_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "lines_document" ON "document_lines" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "lines_product" ON "document_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "documents_type_date" ON "documents" USING btree ("type","date");--> statement-breakpoint
CREATE INDEX "documents_party" ON "documents" USING btree ("party_type","party_id");--> statement-breakpoint
CREATE INDEX "documents_ref" ON "documents" USING btree ("ref_doc_id");--> statement-breakpoint
CREATE INDEX "gl_account_date" ON "gl_entries" USING btree ("account_id","date");--> statement-breakpoint
CREATE INDEX "gl_party" ON "gl_entries" USING btree ("party_type","party_id");--> statement-breakpoint
CREATE INDEX "gl_document" ON "gl_entries" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "sessions_user" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "stock_product_date" ON "stock_ledger" USING btree ("product_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower" ON "users" USING btree (lower("email"));