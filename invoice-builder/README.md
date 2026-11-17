# Personal Invoice Builder

Private, cloud-backed invoice and transaction history for the existing static invoice builder. The application remains under `invoice-builder/` in this repository.

## Features
- GBP, EUR, USD, and CAD invoice currencies; totals retain their original denominated currency (no implicit FX conversion).
- Save and reopen invoices from a private cloud register, searchable by number, customer, or status.
- Automatic, immutable invoice numbers in the form `AB-YYYY-0001`, `AB-YYYY-0002`, etc. The prefix follows the current UK calendar year and the sequence restarts at 0001 each January. The number is assigned on the first successful cloud save and is never reused. Existing invoices keep their original identifiers.
- Automatically save changes to **previously saved** invoices after 1.2 seconds of inactivity while signed in. New invoices require one initial **Save invoice** action.
- Record individual payments with date, method, reference and amount, display amounts paid and outstanding balance.
- Export CSV / Excel invoice register and full JSON invoice backup, PDF/print, and prefilled email draft.
- Import legacy browser-only invoices explicitly; the original browser data is not deleted.
- Row-level security (RLS) limits reads/writes to the signed-in account. Payment entries are append-only for the browser role.
- Pagination retrieves invoice and payment history in batches of 500.

## One-time private database setup (required)
GitHub Pages and RawGitHack only serve static files; they cannot act as a private financial database. A Supabase project is needed.

1. Create a **Supabase** project under your account at https://supabase.com/dashboard.
2. Open **SQL Editor**, paste the full contents of [database.sql](database.sql), and execute once. This creates invoices and payments with owner-only RLS.
3. In **Authentication → Providers**, enable Email (OTP/magic link). Configure the SMTP provider if the hosted email service's sending limits are insufficient.
4. In **Authentication → URL Configuration**, configure the actual site URL and include its exact callback URL in redirect allow-list (e.g. `https://raw.githack.com/Europolytech/assets/main/invoice-builder/index.html` or your chosen GitHub Pages URL). A stable GitHub Pages URL is preferable for production.
5. In **Project Settings → API Keys**, copy the project URL and **publishable** key (or legacy **anon** public key). **Never** use a `service_role` or secret key in the browser or this public repository.
6. Open the invoice builder, expand **Cloud storage setup & migration**, enter the URL and public key, and click **Connect cloud**. This non-secret configuration is remembered in the current browser. Click **Sign in** and follow the email link.
7. If old records exist in that browser's local storage, click **Import this browser's old invoices** once. The import will skip duplicate invoice numbers.

The cloud database is the authoritative source: **new invoices and payments require an internet connection and successful sign-in**. Don't close the page until the app confirms **Saved to cloud**. A failed save is not silently represented as successful.

## Deployment
The existing project is hosted from static files (`index.html`, `script.js`, `styles.css`). Hosting on GitHub Pages is preferable to using RawGitHack as a permanent production URL. Under your repository **Settings → Pages**, select the appropriate source (GitHub Actions or root branch) and use the deployed path `/assets/invoice-builder/` if the repository is published as the `assets` project site.

## Privacy and backup
- The repository is **public**. **Never** commit invoices, transaction exports, bank details, signed-in sessions, tokens, or your Supabase secret/service-role key.
- The historical `invoice-register.csv` in this repository contains an example invoice and is no longer used for synchronization. Remove any real confidential records from Git history separately if any were previously committed.
- Download **Backup JSON** periodically; it includes invoice records, not payment transaction rows. For a comprehensive financial archive, export payment rows from Supabase or extend the backup flow.
- Supabase retains data independently from the browser. Cloud infrastructure, email configuration, and backups are governed by your Supabase account and plan.
- Saved invoices are edited in place; this is **not** an immutable accounting audit trail. Payment rows are append-only. Consider server-side versioning and accountant-approved retention rules before using it for regulated bookkeeping.

## Caveats
- Currency selection is denomination, not automatic exchange conversion. An invoice with recorded payments cannot change currency.
- The next number is calculated from the **highest existing sequence for the current year in Supabase**, not from localStorage or the count of invoices. When simultaneous tabs/devices attempt the same number, Supabase's existing unique `(user_id, invoice_number)` constraint rejects one insert; the application refreshes and retries with the next available number. Unsaved previews show a provisional number until the first successful save.
- No new database migration is necessary: the existing `personal_invoices_user_number_key` unique constraint already enforces per-account uniqueness. Sequences are per authenticated account, not globally across unrelated users. Gaps can occur only if records are removed outside the normal application or imported out of order.
- Status selection is user-maintained, not automatically changed on payment.
- The **Send by email** button opens a composed `mailto:` draft and does not attach the PDF or send automatically. Use PDF/Print to save a PDF and attach it manually.
- This is a personal invoicing utility, not a certified accounting or tax invoicing platform.

## Files
- `index.html`: editor, history and transaction controls.
- `script.js`: cloud authentication, invoice save/load, legacy import and UI logic.
- `styles.css`: user interface and print layout.
- `database.sql`: Supabase schema, restrictions and row-level security.
