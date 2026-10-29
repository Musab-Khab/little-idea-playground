# MFAHH – Modern Financial Accounting & Handling Hub

Accounting, inventory, sales, purchases, samples, payroll and reporting for **Turnkey Publishers**.

- **Stack:** TanStack Start (React 19, server functions) · PostgreSQL · Drizzle ORM · Tailwind/shadcn
- **Accounting:** double-entry general ledger, weighted-average stock costing, maker-checker approvals
- **Security:** scrypt passwords, mandatory TOTP two-factor for finance roles, server-side permissions, hash-chained audit log, append-only ledgers enforced by the database, encrypted backups

## Run it locally (Windows)

Requirements: Node 22+, PostgreSQL 17/18 running locally.

```bash
npm install                     # .npmrc sets legacy-peer-deps (npm 11 workaround)
copy .env.example .env          # then set PG_SUPERUSER_PASSWORD in .env
npm run db:setup                # creates databases mfahh + mfahh_test and the two DB roles; fills .env
npm run db:migrate              # creates tables, integrity triggers and privileges
npm run app:init -- --email you@company.pk --name "Your Name"   # seeds chart of accounts etc. + first admin
npm run dev                     # http://localhost:3000
```

New to the project? Start with **[GUIDE.md](GUIDE.md)** (plain-language setup and usage).

Sign in with the printed temporary password. You will be asked to choose a new password and to enrol an authenticator app (Google/Microsoft Authenticator).

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on port 3000 |
| `npm run build` / `npm start` | Production build / run it (reads `.env`) |
| `npm test` | Posting-engine and permission tests against the `mfahh_test` database (wiped each run) |
| `npm run test:e2e` | Browser tests with the installed Chrome against a running server (see `tests/e2e`) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations (as the schema owner) and refresh app privileges |
| `npm run backup` | Encrypted `pg_dump` into `BACKUP_DIR`, keeps 14 daily + 12 monthly |

## How it is organised

```
src/server/db/          schema.ts (all tables), client.ts, baseData.ts (chart of accounts, roles…)
src/server/posting/     the posting engine: prepare (validation) → rules (GL + stock) → engine (workflow)
src/server/functions/   server functions called by the UI: auth, masters, documents, reports, hr, admin, imports
src/server/security/    password hashing, sessions, rate limiting
src/shared/             code used by both browser and server: permissions, document definitions, totals
src/components/         DocumentEditor / DocumentView / DocumentListPage, MasterPage, Reports
src/routes/             one file per screen (TanStack file routing)
migrations/             SQL migrations; 0001_integrity.sql holds the tamper-resistance rules
```

**Every transaction is a document** (`documents` + `document_lines`) with a type (SI, PI, RV, EXP, JV, SMP, PAYROLL…). Documents go **Draft → Pending → Approved**, or get **Cancelled**. Approving posts balanced entries to `gl_entries` and stock moves to `stock_ledger`, in one database transaction. Approved documents are never edited or deleted; cancelling writes reversing entries. All balances and reports are computed from these ledgers.

See `DEPLOY.md` for production setup and the security checklist.
