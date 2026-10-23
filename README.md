# money

Personal money dashboard (money.arghtools.com).

- `app/` Next.js PWA (Vercel root directory: `app`, project `money-tools`). All the money logic lives here.
- Database: Supabase project `money` (`rnngqrwyfqmuyqpetfyo`). Only the server talks to it, with `SUPABASE_SECRET_KEY`.
- `apps-script/` the Google side, bound to the Expense Tracker sheet: reads Gmail and posts each message to
  `/api/ingest/mail`, fetches IBKR Flex statements, sends GOOGLEFINANCE prices, runs the schedule, and keeps
  the sheet as a read-only mirror of the database (every 10 minutes for transactions, every tab nightly).

Vercel env: `DATA_SOURCE=db` makes the app read and write the database (without it, it falls back to the
sheet through the old web app). `IMPORT_LOCKED=1` stops `/api/admin/import` from replacing the database.

Machine routes (`/api/ingest/*`, `/api/cron/*`, `/api/export`, `/api/admin/*`) take `Authorization: Bearer APP_TOKEN`.

The nightly Mac task writes text-message rows to the "SMS Inbox" tab and balances to "Balance Inbox";
the script forwards both to the app, which drops anything already logged.
