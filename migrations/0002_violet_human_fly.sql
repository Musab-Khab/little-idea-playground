ALTER TABLE "customers" ADD COLUMN "location" text DEFAULT 'Karachi' NOT NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_location_check" CHECK ("location" IN ('Karachi', 'Out of Karachi'));
