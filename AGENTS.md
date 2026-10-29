## Architecture
- Server: TanStack Start server functions in `src/server/functions/*`; every handler is wrapped in `safe()` and checks permissions with `requireUser()` / `assertPerm()`. The UI's `useSession().can()` only hides controls.
- Data: PostgreSQL via Drizzle (`src/server/db/schema.ts`). Schema changes: edit schema.ts, `npm run db:generate`, then `npm run db:migrate`. Integrity rules (append-only ledgers, document guards, audit hash chain, app-role privileges) live in `migrations/0001_integrity.sql`.
- Transactions are `documents` + `document_lines`. Add document behaviour in `src/server/posting/` (prepare.ts validates, rules.ts posts and reverses), and declare types in `src/shared/documents.ts`. Never write to `gl_entries`, `stock_ledger` or `products.stock_qty` outside the posting engine.
- Money is numeric(18,2), returned as JS numbers; round with `round2`. Reports compute from ledgers, never from stored totals.
- Server-only modules (`src/server/**`) must not be imported by browser code except server-function files; shared constants go in `src/shared/`.
- Tests: `npm test` (engine and permissions against mfahh_test) and `tests/e2e` (real Chrome via playwright-core).
