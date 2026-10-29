-- Integrity and tamper-resistance rules enforced by the database itself,
-- so they hold even if application code has a bug.

-- 1. Ledger rows: sane amounts.
ALTER TABLE gl_entries ADD CONSTRAINT gl_amounts_valid
  CHECK (debit >= 0 AND credit >= 0 AND NOT (debit > 0 AND credit > 0) AND (debit > 0 OR credit > 0));
--> statement-breakpoint
ALTER TABLE stock_ledger ADD CONSTRAINT stock_qty_valid
  CHECK (qty_in >= 0 AND qty_out >= 0 AND NOT (qty_in > 0 AND qty_out > 0) AND (qty_in > 0 OR qty_out > 0));
--> statement-breakpoint
ALTER TABLE documents ADD CONSTRAINT documents_status_valid
  CHECK (status IN ('Draft','Pending','Approved','Cancelled'));
--> statement-breakpoint
ALTER TABLE allocations ADD CONSTRAINT allocations_positive CHECK (amount > 0);
--> statement-breakpoint

-- 2. Append-only tables: no UPDATE or DELETE, ever.
CREATE FUNCTION forbid_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER gl_entries_append_only BEFORE UPDATE OR DELETE ON gl_entries FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER stock_ledger_append_only BEFORE UPDATE OR DELETE ON stock_ledger FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint

-- 3. Every document's GL entries must balance (checked at commit).
CREATE FUNCTION gl_balance_check() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE diff numeric;
BEGIN
  SELECT coalesce(sum(debit), 0) - coalesce(sum(credit), 0) INTO diff
  FROM gl_entries WHERE document_id = NEW.document_id;
  IF diff <> 0 THEN
    RAISE EXCEPTION 'Unbalanced journal for document %: debit - credit = %', NEW.document_id, diff;
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER gl_balanced AFTER INSERT ON gl_entries
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gl_balance_check();
--> statement-breakpoint

-- 4. Documents: legal status transitions only; posted content is frozen.
CREATE FUNCTION documents_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Documents cannot be deleted; cancel them instead';
  END IF;
  IF NEW.status <> OLD.status AND (OLD.status, NEW.status) NOT IN (
      ('Draft','Pending'), ('Draft','Approved'), ('Pending','Approved'), ('Pending','Draft'),
      ('Draft','Cancelled'), ('Pending','Cancelled'), ('Approved','Cancelled')) THEN
    RAISE EXCEPTION 'Document % cannot move from % to %', OLD.doc_no, OLD.status, NEW.status;
  END IF;
  IF OLD.status = 'Cancelled' THEN
    RAISE EXCEPTION 'Cancelled document % cannot be changed', OLD.doc_no;
  END IF;
  IF OLD.status = 'Approved' AND (
      NEW.type, NEW.doc_no, NEW.date, NEW.fy_id, NEW.party_type, NEW.party_id, NEW.due_date, NEW.ref_doc_id,
      NEW.method, NEW.bank_account_id, NEW.expense_head_id, NEW.kind, NEW.subtotal, NEW.discount,
      NEW.tax_pct, NEW.tax_amount, NEW.total, NEW.created_by, NEW.created_at, NEW.approved_by, NEW.approved_at
    ) IS DISTINCT FROM (
      OLD.type, OLD.doc_no, OLD.date, OLD.fy_id, OLD.party_type, OLD.party_id, OLD.due_date, OLD.ref_doc_id,
      OLD.method, OLD.bank_account_id, OLD.expense_head_id, OLD.kind, OLD.subtotal, OLD.discount,
      OLD.tax_pct, OLD.tax_amount, OLD.total, OLD.created_by, OLD.created_at, OLD.approved_by, OLD.approved_at
    ) THEN
    RAISE EXCEPTION 'Approved document % cannot be edited; cancel and re-enter it', OLD.doc_no;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER documents_guard BEFORE UPDATE OR DELETE ON documents FOR EACH ROW EXECUTE FUNCTION documents_guard();
--> statement-breakpoint

-- Lines of a non-draft document are frozen except the running done_qty (deliveries / returns)
-- and unit_cost, which is stamped while the document is being approved.
CREATE FUNCTION document_lines_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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
      NEW.discount_pct, NEW.amount, NEW.debit, NEW.credit, NEW.ref_line_id)
     IS DISTINCT FROM
     (OLD.document_id, OLD.line_no, OLD.product_id, OLD.account_id, OLD.party_type, OLD.party_id, OLD.qty, OLD.rate,
      OLD.discount_pct, OLD.amount, OLD.debit, OLD.credit, OLD.ref_line_id) THEN
    RAISE EXCEPTION 'Lines of a % document cannot be edited', st;
  END IF;
  IF st IN ('Approved','Cancelled') AND NEW.unit_cost IS DISTINCT FROM OLD.unit_cost AND OLD.unit_cost IS NOT NULL THEN
    RAISE EXCEPTION 'Posted unit cost cannot be changed';
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER document_lines_guard BEFORE INSERT OR UPDATE OR DELETE ON document_lines FOR EACH ROW EXECUTE FUNCTION document_lines_guard();
--> statement-breakpoint

-- Allocations can only change while the receipt/payment is a draft.
CREATE FUNCTION allocations_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM documents WHERE id = coalesce(NEW.payment_id, OLD.payment_id);
  IF st <> 'Draft' THEN
    RAISE EXCEPTION 'Allocations of a % payment cannot be changed', st;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;
--> statement-breakpoint
CREATE TRIGGER allocations_guard BEFORE INSERT OR UPDATE OR DELETE ON allocations FOR EACH ROW EXECUTE FUNCTION allocations_guard();
--> statement-breakpoint

-- 5. Hash-chained audit log. A global advisory lock serialises writers so the chain
--    order equals id order; any later edit/deletion breaks verification.
CREATE FUNCTION audit_row_text(prev text, r audit_log) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(prev, '') || '|' || r.id || '|' ||
         to_char(r.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '|' ||
         coalesce(r.user_id::text, '') || '|' || r.user_name || '|' || r.action || '|' || r.entity || '|' ||
         coalesce(r.entity_id, '') || '|' || coalesce(r.ref, '') || '|' || r.details::text || '|' || coalesce(r.ip, '')
$$;
--> statement-breakpoint
CREATE FUNCTION audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(731137);
  NEW.id := nextval(pg_get_serial_sequence('audit_log', 'id'));
  NEW.at := coalesce(NEW.at, now());
  SELECT hash INTO prev FROM audit_log ORDER BY id DESC LIMIT 1;
  NEW.prev_hash := prev;
  NEW.hash := encode(sha256(convert_to(audit_row_text(prev, NEW), 'UTF8')), 'hex');
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_log_chain BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION audit_chain();
--> statement-breakpoint

-- Returns the id of the first broken audit row, or NULL when the whole chain verifies.
CREATE FUNCTION audit_verify() RETURNS bigint LANGUAGE plpgsql STABLE AS $$
DECLARE r audit_log; prev text := NULL;
BEGIN
  FOR r IN SELECT * FROM audit_log ORDER BY id LOOP
    IF r.prev_hash IS DISTINCT FROM prev
       OR r.hash IS DISTINCT FROM encode(sha256(convert_to(audit_row_text(prev, r), 'UTF8')), 'hex') THEN
      RETURN r.id;
    END IF;
    prev := r.hash;
  END LOOP;
  RETURN NULL;
END $$;
--> statement-breakpoint

-- 6. Least privilege for the application role (created by `npm run db:setup`).
--    Re-applied after every migration run by scripts/migrate.ts, so new tables are covered.
CREATE FUNCTION apply_app_privileges() RETURNS void LANGUAGE plpgsql AS $$
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
    financial_years, number_series, roles, users, company FROM mfahh_app;
  REVOKE TRUNCATE ON document_lines, allocations, sessions, role_permissions FROM mfahh_app;
  -- Schema changes and privilege management stay with the owner.
  REVOKE EXECUTE ON FUNCTION apply_app_privileges() FROM mfahh_app;
  REVOKE CREATE ON SCHEMA public FROM mfahh_app;
END $$;
--> statement-breakpoint
SELECT apply_app_privileges();
