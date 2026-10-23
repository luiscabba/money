# money

Personal money dashboard (money.arghtools.com).

- `app/` Next.js PWA (Vercel root directory: `app`)
- `apps-script/` Gmail to Sheet script bound to the Expense Tracker sheet

Apps Script note: `doGet`/`doPost` (everything the app calls) run the **deployed web app version**, not the saved code.
After changing them, Deploy > Manage deployments > edit > New version > Deploy (same URL). Triggers run the saved code.
