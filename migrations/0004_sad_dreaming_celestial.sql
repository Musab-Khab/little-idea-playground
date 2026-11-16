ALTER TABLE "customers" ADD COLUMN "discount_type" text DEFAULT 'Percentage' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "discount_value" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "discount_mode" text DEFAULT 'Editable' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "category_discounts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "document_lines" ADD COLUMN "discount_amt" numeric(18, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_discount_check" CHECK (
  "discount_type" IN ('Percentage', 'Amount') AND "discount_mode" IN ('Editable', 'Fixed')
  AND "discount_value" >= 0 AND ("discount_type" = 'Amount' OR "discount_value" <= 100)
  AND jsonb_typeof("category_discounts") = 'array');--> statement-breakpoint
ALTER TABLE "document_lines" ADD CONSTRAINT "document_lines_discount_amt_check" CHECK ("discount_amt" >= 0 AND "discount_amt" <= "rate");--> statement-breakpoint
-- Same guard as 0001, now also freezing discount_amt on non-draft documents.
CREATE OR REPLACE FUNCTION document_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM documents WHERE id = coalesce(NEW.document_id, OLD.document_id);
  IF st = 'Draft' THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Lines of a % document cannot be added or removed', st;
  END IF;
  IF (NEW.document_id, NEW.line_no, NEW.product_id, NEW.account_id, NEW.party_type, NEW.party_id, NEW.qty, NEW.rate,
      NEW.discount_pct, NEW.discount_amt, NEW.amount, NEW.debit, NEW.credit, NEW.ref_line_id)
     IS DISTINCT FROM
     (OLD.document_id, OLD.line_no, OLD.product_id, OLD.account_id, OLD.party_type, OLD.party_id, OLD.qty, OLD.rate,
      OLD.discount_pct, OLD.discount_amt, OLD.amount, OLD.debit, OLD.credit, OLD.ref_line_id) THEN
    RAISE EXCEPTION 'Lines of a % document cannot be edited', st;
  END IF;
  IF st IN ('Approved','Cancelled') AND NEW.unit_cost IS DISTINCT FROM OLD.unit_cost AND OLD.unit_cost IS NOT NULL THEN
    RAISE EXCEPTION 'Posted unit cost cannot be changed';
  END IF;
  RETURN NEW;
END $$;
