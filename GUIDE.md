# MFAHH – Easy Guide

MFAHH is the accounting, stock and payroll software for **Turnkey Publishers**. It runs on one computer (the "server") and everyone else opens it in a web browser — Chrome or Edge — like a website. Nothing is installed on the other computers.

This guide has two parts:

- **Part 1 – Using MFAHH** (for staff)
- **Part 2 – Installing MFAHH on a computer** (for the person setting it up)

---

## Part 1 – Using MFAHH

### Open it

Type the address your admin gave you into Chrome or Edge, for example `http://192.168.1.62:3000`.
On the server computer itself you can always use `http://localhost:3000`.

### Sign in the first time

1. Enter your **email** and the **temporary password** from your admin.
2. Choose your **own password** (at least 10 characters).
3. If asked, open **Google Authenticator** or **Microsoft Authenticator** on your phone, tap **+**, and scan the QR code. Then type the 6-digit code you see. Next time you sign in, just type the code from the app.

Forgot your password? Ask the admin to reset it. After 5 wrong tries the account locks for 15 minutes.

### The main screens

| Menu | What you do there |
| --- | --- |
| Dashboard | See today's and this month's sales, purchases, expenses, profit, cash, bank, stock alerts |
| Sales | Orders, invoices, returns, money received from customers |
| Purchases | Bills from printers and suppliers, returns, payments to suppliers |
| Inventory | Books list, stock, sample books to schools, damaged stock |
| Customers / Suppliers | Contact details, balances, statements |
| Accounts | Expenses, journal entries, cash and bank books, opening balances |
| Reports | Profit & Loss, Balance Sheet, ageing, stock statement and more — export to Excel or PDF |
| Staff & HR | Staff, attendance, leave, monthly payroll, salary payments |
| Settings | Company details, users, financial years, data import, backups, audit log |

You only see the menus your role allows.

### How a normal entry works

1. Click **New …** (for example *New Sales Invoice*), fill the form, click **Save draft**.
2. Click **Submit for approval**.
3. **Another person** (for example the accountant) opens it from the bell icon at the top and clicks **Approve & post**.
4. Done — stock, balances, accounts and reports update by themselves.

Made a mistake?
- Still a draft → click **Edit**.
- Already approved → click **Cancel & reverse** and enter it again correctly. Nothing is ever deleted; the system keeps a record.

### Printing

Open any invoice, voucher or statement and click **Print / PDF**. Choose your printer, or **Save as PDF** to email it.

### If a screen does not change when you click

Press **Ctrl + F5** to refresh the page. This happens after the software has been updated.

---

## Part 2 – Installing MFAHH on a computer

Do this once, on the computer that will be the server. Takes about 30 minutes.

### Step 1 – Install three free programs

1. **Node.js** (version 22 "LTS") – <https://nodejs.org>
2. **PostgreSQL** (version 17 or 18) – <https://www.postgresql.org/download/windows/>. During install it asks for a password for the user `postgres` — **write it down**.
3. **Git** – <https://git-scm.com/download/win>

Keep clicking "Next" with the default options.

### Step 2 – Download MFAHH

Open **Command Prompt** (press Windows key, type `cmd`, Enter) and type:

```
cd %USERPROFILE%\Desktop
git clone -b mfahh-full-system https://github.com/Musab-Khab/little-idea-playground.git mfahh
cd mfahh
npm install
```

`npm install` downloads what the software needs. It takes a few minutes.

### Step 3 – Settings file

```
copy .env.example .env
notepad .env
```

In Notepad, find the line `PG_SUPERUSER_PASSWORD=` and type the PostgreSQL password from Step 1 after the `=` sign. Save and close.

### Step 4 – Create the database

```
npm run db:setup
npm run db:migrate
```

### Step 5 – Create the first admin

Use your own email:

```
npm run app:init -- --email you@turnkey.pk --name "Your Name"
```

It prints a **temporary password** once. Copy it somewhere safe.

### Step 6 – Start the software

```
npm run build
npm start
```

Keep this window open — closing it stops MFAHH. Open `http://localhost:3000` and sign in.

To let other computers in the office use it, find this computer's address: type `ipconfig` in Command Prompt and look for **IPv4 Address** (for example `192.168.1.62`). Others open `http://192.168.1.62:3000`. If they cannot connect, allow port 3000 in Windows Firewall.

### Step 7 – Backups (important)

Run this every day (or set it in Windows **Task Scheduler**):

```
npm run backup
```

Backups are saved in the `backups` folder. Copy that folder to a USB drive or Google Drive every week. The `BACKUP_PASSPHRASE` line in `.env` is the key to open them — keep a copy of it somewhere safe, off this computer.

### Next time you turn on the computer

```
cd %USERPROFILE%\Desktop\mfahh
npm start
```

### Getting updates

```
git pull
npm install
npm run db:migrate
npm run build
npm start
```

### For a demo only

To skip the phone code (two-factor) while demonstrating, add this line to `.env` and restart:

```
DISABLE_MFA=true
```

**Remove it before real use.**

---

More technical details: `README.md` (for developers) and `DEPLOY.md` (cloud server setup).
