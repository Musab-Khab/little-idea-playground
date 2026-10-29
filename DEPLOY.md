# Deploying MFAHH

There are two supported options. The code is the same for both.

| | A. Cloud VPS (recommended) | B. Office PC / LAN |
|---|---|---|
| Cost | ~$5–8 / month (2 vCPU, 4 GB RAM, e.g. Hetzner CX23) | No hosting cost |
| Access | Anywhere, over HTTPS | Office network only (unless you add a VPN) |
| You look after | OS updates (automatic), off-site backup copy | The PC, its UPS, and off-site backup copies |

---

## A. Cloud VPS with Docker

1. **Create the server** (Ubuntu 24.04). Point a DNS record (e.g. `mfahh.turnkeypublishers.pk`) at its IP.
2. **Harden it** (as root, once):
   ```bash
   adduser deploy && usermod -aG sudo deploy          # log in as this user from now on
   # copy your SSH public key to /home/deploy/.ssh/authorized_keys, then:
   sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/; s/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
   systemctl restart ssh
   apt update && apt install -y ufw fail2ban unattended-upgrades docker.io docker-compose-v2
   ufw default deny incoming && ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw enable
   dpkg-reconfigure -plow unattended-upgrades          # enable automatic security updates
   usermod -aG docker deploy
   ```
3. **Copy the code** to `/home/deploy/mfahh` (git clone or scp).
4. **Create `.env.production`** with strong random values (`openssl rand -hex 32` for each):
   ```
   DOMAIN=mfahh.turnkeypublishers.pk
   PG_SUPERUSER_PASSWORD=<hex>
   DB_OWNER_PASSWORD=<hex>
   DB_APP_PASSWORD=<hex>
   SESSION_SECRET=<hex>
   BACKUP_PASSPHRASE=<hex>   # store a copy in a password manager OFF the server
   ```
   `chmod 600 .env.production`
5. **Start:** `docker compose --env-file .env.production up -d --build`
   Caddy obtains the HTTPS certificate automatically. Postgres has no public port.
6. **Create the first admin:**
   `docker compose --env-file .env.production run --rm app npx tsx scripts/init.ts --email admin@turnkeypublishers.pk --name "Admin"`
7. **Off-site backups:** copy `./backups` daily to another location, e.g. with `rclone` to Cloudflare R2 or Backblaze B2. The backups are already encrypted.
8. **Updates:** `git pull && docker compose --env-file .env.production up -d --build`. Migrations run automatically on start.

Optional: to allow only the office IP, uncomment the `remote_ip` lines in `Caddyfile`.

## B. Windows office PC (no Docker)

1. Install **Node.js 22 LTS** and **PostgreSQL 17**. During the PostgreSQL install, keep "listen" on localhost only.
2. Copy the project folder, then in a terminal:
   ```bat
   npm install
   copy .env.example .env      &REM set PG_SUPERUSER_PASSWORD, APP_URL=http://<pc-name>:3000
   npm run db:setup && npm run db:migrate
   npm run app:init -- --email admin@turnkeypublishers.pk --name "Admin"
   npm run build
   ```
3. **Run as a service** so it starts with Windows: use [NSSM](https://nssm.cc/) with
   `nssm install MFAHH "C:\Program Files\nodejs\node.exe" "--env-file=.env .output\server\index.mjs"` (set the startup folder to the project folder).
4. **Firewall:** allow inbound TCP 3000 on the *Private* profile only. Do not open PostgreSQL's port 5432.
5. **Nightly backup:** in Task Scheduler, create a daily task that runs `npm run backup` in the project folder. Copy the `backups` folder to a USB drive or cloud storage every week.
6. On a LAN without HTTPS, browsers send cookies in clear text over the local network. If staff connect over Wi-Fi, put Caddy in front with an internal certificate, or use option A.

---

## Security checklist before go-live

- [ ] Every `.env` secret generated randomly; `.env` readable only by the service account and never in git
- [ ] `BACKUP_PASSPHRASE` stored safely off the server; a **restore test** done (Settings → Backup & Restore, or `pg_restore --list`)
- [ ] Admin and Accountant users enrolled in two-factor authentication (enforced automatically)
- [ ] Maker-checker left **on** (Settings → Company), unless a single person runs the system
- [ ] Roles reviewed in Settings → Users & Roles; staff get only the permissions they need
- [ ] Opening balances imported (Settings → Data Import) and approved; the trial balance balances
- [ ] Run `npm test` and `npm run test:e2e` against a staging copy; run an OWASP ZAP baseline scan against the staging URL
- [ ] "Verify audit trail" (Settings → Audit Log) shows intact; repeat this monthly

## Built-in protections

- **Passwords:** scrypt hashing, at least 10 characters, common-password list, lockout after 5 failures, admin-only resets
- **Two-factor (TOTP):** mandatory for the roles chosen in Settings (Admin always); secrets encrypted at rest
- **Sessions:** httpOnly cookies (Secure + `__Host-` prefix on HTTPS), 30-minute idle and 12-hour absolute timeout, all sessions ended on role change, deactivation or password reset
- **Authorization:** every server function checks permissions; the creator cannot approve their own invoices, payments, journals or payroll; closed financial years are read-only
- **Database:** the app connects as `mfahh_app`, which cannot alter the schema and cannot update or delete ledgers or the audit log. Triggers block edits to posted documents and unbalanced journals.
- **Audit:** hash-chained log of every create, edit, approval, cancellation, sign-in, export, backup and permission change, with a verification button
- **Web:** CSRF protection on server functions, strict security headers and CSP, validated inputs, parameterised SQL, file uploads type-checked by content, error details never sent to browsers
