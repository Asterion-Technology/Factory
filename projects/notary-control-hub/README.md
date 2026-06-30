# Notary Control Hub

A secure, production-ready web application for notaries and Notary Signing Agents to manage assignments from intake through completion.

## Features

- **Assignment Tracking** — Create, manage, and advance assignments through a defined workflow (New → Confirmed → Docs Received → Printed → In Progress → Completed → Invoiced → Paid)
- **Dynamic Checklists** — Auto-generated task checklists (General, NSA, Pre-Flight, RON) based on assignment type
- **Secure Document Storage** — Upload assignment documents to Cloudflare R2 with server-side encryption, expiry policies, and a formal purge attestation workflow
- **CRM** — Track signing companies, title companies, escrow contacts, direct clients, and borrowers
- **Invoicing** — Generate invoices from completed assignments with line items, status tracking, and PDF export (coming in AST-47)
- **Dashboard** — Upcoming appointments, assignments needing action, overdue invoices, and documents approaching purge

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Auth | Clerk |
| Database | Neon PostgreSQL (Prisma ORM) |
| File Storage | Cloudflare R2 |
| Email | Resend |
| Styling | Tailwind CSS v4 |
| Deployment | Railway |

## Setup

### 1. Prerequisites

- Node.js 20+
- A [Clerk](https://clerk.com) account
- A [Neon](https://neon.tech) PostgreSQL database
- A [Cloudflare R2](https://www.cloudflare.com/products/r2/) bucket
- (Optional) A [Resend](https://resend.com) account for email

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in all values in `.env`:
- Clerk publishable key and secret key
- Neon `DATABASE_URL`
- Cloudflare R2 credentials (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`)
- Resend API key (optional for dev)

### 4. Set up the database

```bash
npm run db:generate   # Generate Prisma client
npm run db:migrate    # Run migrations (creates tables)
npm run db:seed       # Seed sample data (optional)
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with Clerk.

### 6. Type check and lint

```bash
npm run type-check
npm run lint
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Sign-in / Sign-up pages (Clerk)
│   ├── (app)/           # Authenticated app shell
│   │   ├── dashboard/
│   │   ├── assignments/
│   │   ├── contacts/
│   │   ├── documents/
│   │   ├── invoices/
│   │   └── settings/
│   └── api/             # REST API routes
│       ├── assignments/
│       ├── contacts/
│       ├── documents/
│       └── invoices/
├── components/
│   └── nav/sidebar.tsx
├── lib/
│   ├── auth.ts          # Clerk + Prisma user helpers
│   ├── audit.ts         # Audit log writer
│   ├── checklists.ts    # Checklist templates + logic
│   ├── prisma.ts        # Prisma client singleton
│   ├── r2.ts            # Cloudflare R2 client
│   ├── utils.ts         # Formatting utilities
│   └── validations/     # Zod schemas
│       ├── assignment.ts
│       ├── contact.ts
│       └── invoice.ts
├── types/index.ts
prisma/
├── schema.prisma
└── seed.ts
```

## Security Notes

- All routes are protected by Clerk middleware (`middleware.ts`)
- All database queries are scoped to `userId` — no IDOR possible
- Files are stored in R2 with server-side AES-256 encryption and served only via short-lived (15-minute) pre-signed URLs
- File uploads are validated for MIME type (allowlist) and size (25 MB max)
- All sensitive actions are written to the `AuditLog` table (login events, file uploads, downloads, deletes, status changes, invoice creation)
- Inputs are validated with Zod on every API route
- No secrets are hardcoded — all via environment variables

## Compliance Notice

This tool is for workflow organization only. It does not provide legal advice and does not determine notarial legality. Always follow your state's notary laws. Verify signer identity according to applicable rules. Securely dispose of temporary documents after assignment completion.

## Linear Project

This application is tracked under the **Notary Control Hub** project in Linear (Asterion team).

- AST-42 — ICD + Initial scaffold (this PR)
- AST-43 — Assignment CRUD + status machine
- AST-44 — Checklist system
- AST-45 — Document storage + purge workflow
- AST-46 — CRM
- AST-47 — Invoicing + PDF export
- AST-48 — Dashboard
- AST-49 — Tests + seed data
