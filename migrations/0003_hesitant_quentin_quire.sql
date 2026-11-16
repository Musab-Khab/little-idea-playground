CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid,
	"edited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "categories_kind_name" ON "categories" USING btree ("kind",lower("name"));--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_kind_check" CHECK ("kind" IN ('customerType', 'customerLocation', 'supplierCategory', 'productCategory'));--> statement-breakpoint
ALTER TABLE "customers" DROP CONSTRAINT IF EXISTS "customers_location_check";--> statement-breakpoint
-- Starting lists, plus any value already used on a master so nothing becomes invalid.
INSERT INTO "categories" ("kind", "name")
SELECT k, n FROM (VALUES
  ('customerType', 'School'), ('customerType', 'Bookshop'), ('customerType', 'Dealer'),
  ('customerType', 'Distributor'), ('customerType', 'Institution'), ('customerType', 'Other'),
  ('customerLocation', 'Karachi'), ('customerLocation', 'Out of Karachi'),
  ('supplierCategory', 'Paper Supplier'), ('supplierCategory', 'Card Supplier'),
  ('supplierCategory', 'Printer'), ('supplierCategory', 'Binder'), ('supplierCategory', 'Plate Maker'),
  ('supplierCategory', 'Laminator'), ('supplierCategory', 'Transporter'), ('supplierCategory', 'Designer'),
  ('supplierCategory', 'Packaging Supplier'), ('supplierCategory', 'Other Service Provider'),
  ('productCategory', 'Textbook'), ('productCategory', 'Workbook'), ('productCategory', 'Guide'),
  ('productCategory', 'Stationery'), ('productCategory', 'Copy / Notebook'),
  ('productCategory', 'Practical Journal'), ('productCategory', 'Reference'),
  ('productCategory', 'Brochure'), ('productCategory', 'Prospectus'), ('productCategory', 'Other')
) v(k, n)
UNION SELECT DISTINCT 'customerType', category FROM customers WHERE category <> ''
UNION SELECT DISTINCT 'customerLocation', location FROM customers WHERE location <> ''
UNION SELECT DISTINCT 'supplierCategory', category FROM suppliers WHERE category <> ''
UNION SELECT DISTINCT 'productCategory', category FROM products WHERE category <> ''
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Categories are never deleted (deactivated instead), like the other masters.
CREATE OR REPLACE FUNCTION apply_app_privileges() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mfahh_app') THEN
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public TO mfahh_app;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO mfahh_app;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO mfahh_app;
  GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO mfahh_app;
  -- Append-only ledgers and audit trail.
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_log, gl_entries, stock_ledger FROM mfahh_app;
  -- Nothing of business value is ever deleted.
  REVOKE DELETE, TRUNCATE ON documents, customers, suppliers, products, price_history, accounts, bank_accounts,
    expense_heads, staff, attendance, leave_types, leave_applications, staff_documents,
    financial_years, number_series, roles, users, company, categories FROM mfahh_app;
  REVOKE TRUNCATE ON document_lines, allocations, sessions, role_permissions FROM mfahh_app;
  -- Schema changes and privilege management stay with the owner.
  REVOKE EXECUTE ON FUNCTION apply_app_privileges() FROM mfahh_app;
  REVOKE CREATE ON SCHEMA public FROM mfahh_app;
END $$;
