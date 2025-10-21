# RA2033 - Declaration Signature Platform

A modern declaration/joint statement platform built on Cloudflare Workers, featuring secure 2FA signature verification via email and SMS.

## Features

- **Public Declaration Display**: Clean, readable presentation of the statement
- **Signature Collection**: Form for collecting name, email, mobile, position, and institution
- **2FA Verification**: Dual verification via email and SMS codes
- **Rate Limiting**: Durable Objects-based protection against abuse
- **Real-time Updates**: Live signature count and list
- **Responsive Design**: Works on all devices with Tailwind CSS
- **Serverless Architecture**: Built on Cloudflare Workers with D1, R2, and Durable Objects

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (backend), React + Vite (frontend)
- **Database**: Cloudflare D1 (SQLite)
- **Storage**: Cloudflare R2 (future use)
- **Rate Limiting**: Cloudflare Durable Objects
- **Styling**: Tailwind CSS
- **Verification**: AWS SES (email) + AWS SNS (SMS)

## Project Structure

```
ra2033/
├── src/
│   ├── worker/
│   │   ├── index.ts           # Main Hono app with API routes
│   │   └── rate-limiter.ts    # Durable Object for rate limiting
│   └── react-app/
│       ├── App.tsx             # Main React component
│       ├── components/
│       │   ├── SignatureForm.tsx
│       │   ├── VerificationForm.tsx
│       │   └── SignatureList.tsx
│       └── index.css
├── wrangler.json              # Cloudflare Workers configuration
├── schema.sql                 # Database schema
└── package.json
```

## Setup Instructions

### 1. Prerequisites

- Node.js 20+
- Cloudflare account
- AWS account (for SES/SNS)
- Wrangler CLI: `npm install -g wrangler`

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Cloudflare D1 Database

The database has already been created. To apply the schema to production:

```bash
npx wrangler d1 execute ra2033-db --remote --file=schema.sql
```

### 4. Configure AWS Credentials

You'll need to add these secrets to your Cloudflare Worker:

```bash
npx wrangler secret put AWS_ACCESS_KEY_ID
npx wrangler secret put AWS_SECRET_ACCESS_KEY
npx wrangler secret put AWS_REGION
npx wrangler secret put SES_FROM_EMAIL
npx wrangler secret put SNS_PHONE_NUMBER
```

### 5. Development

Run locally:

```bash
npm run dev
```

This will start:
- Vite dev server for React
- Wrangler dev server for the Worker
- Local D1 database

### 6. Deployment

Deploy to Cloudflare:

```bash
npm run deploy
```

## API Endpoints

### POST `/api/signatures`
Submit a new signature (requires verification)

**Request:**
```json
{
  "name": "John Smith",
  "email": "john@example.com",
  "mobile": "+61412345678",
  "position": "Senior Developer",
  "institution": "Acme Corp"
}
```

**Response:**
```json
{
  "id": 1,
  "message": "Verification codes sent to your email and phone"
}
```

Note: Verification codes are sent via AWS SES (email) and AWS SNS (SMS). They are NOT returned in the API response for security.

### POST `/api/signatures/:id/verify`
Verify signature with codes

**Request:**
```json
{
  "emailCode": "123456",
  "smsCode": "654321"
}
```

**Response (success):**
```json
{
  "message": "Signature verified successfully"
}
```

**Response (error with attempts remaining):**
```json
{
  "error": "Invalid verification codes",
  "attemptsRemaining": 2
}
```

### GET `/api/signatures`
Get all verified signatures (public info only - no PII)

### GET `/api/signatures/count`
Get count of verified signatures

### GET `/api/initial-signatories`
Get list of initial/founding signatories

## Database Schema

The database uses a secure schema that protects user privacy:

- **public_signatures**: Stores signatures with hashed email/phone for privacy
  - Email and phone are hashed using SHA-256 and never stored in plaintext
  - Tracks verification status (`email_verified`, `phone_verified`)
  - Records `verification_completed_at` timestamp when both verifications complete
  
- **verification_codes**: Stores hashed verification codes separately
  - Codes are hashed using SHA-256 before storage
  - Includes expiry timestamp (10 minutes from creation)
  - Tracks attempt count (max 3 attempts)
  - Marks `verified_at` when code is successfully used

- **initial_signatories**: Founding/prominent signatories displayed separately
  - Includes `title`, `first_name`, `last_name`, `position`, `institution`
  - Ordered by `display_order` field

- **admin_users**: Admin user credentials with bcrypt password hashing

## Security Features

1. **PII Hashing**: Email and phone numbers are hashed (SHA-256) before storage - never stored in plaintext
2. **Code Hashing**: Verification codes are hashed before storage for security
3. **Code Expiry**: Verification codes expire after 10 minutes
4. **Attempt Limiting**: Maximum of 3 verification attempts per code set
5. **Rate Limiting**: 5 requests per minute per IP via Durable Objects
6. **2FA Verification**: Both email and SMS must be verified before signature is public
7. **Input Validation**: Email and phone number format validation (E.164 for phone)
8. **Duplicate Detection**: Prevents same email or phone from signing twice
9. **Transaction Rollback**: Cleans up data if verification sending fails
10. **No Debug Info**: Verification codes are never returned in API responses (production-ready)

## Implementation Status

### ✅ Completed
- [x] AWS SES integration for email verification
- [x] AWS SNS integration for SMS verification  
- [x] Secure database schema with PII hashing
- [x] Verification code expiry and attempt limiting
- [x] Rate limiting via Durable Objects
- [x] Production-ready API (no debug info exposed)
- [x] Duplicate signature prevention
- [x] Initial signatories endpoint
- [x] Admin dashboard for managing signatures (unauthenticated)
- [x] Initial signatories management UI with drag-and-drop reordering

### 🔄 TODO
- [ ] Implement signature export (CSV/PDF)
- [ ] Add admin authentication system
- [ ] Add CAPTCHA for additional bot protection
- [ ] Add analytics tracking
- [ ] Create deployment automation
- [ ] Add frontend components for initial signatories display (public-facing)

## Environment Variables

### Secrets (via `npx wrangler secret put`)
These are sensitive and stored encrypted:
- `AWS_ACCESS_KEY_ID`: AWS access key for SES/SNS
- `AWS_SECRET_ACCESS_KEY`: AWS secret key for SES/SNS

### Configuration Variables (in `wrangler.json`)
These are non-sensitive configuration:
- `AWS_REGION`: AWS region (e.g., 'ap-southeast-2')
- `SES_FROM_EMAIL`: Verified SES sender email (e.g., 'alister@alistercameron.com')
- `SNS_PHONE_NUMBER`: SNS origination number (e.g., '+12065552851' for simulator)

**Note**: The SNS_PHONE_NUMBER is currently set to AWS's simulator number for testing. Update to a real origination number for production use.

## Development Notes

### AWS Configuration
- **SES Email**: The `SES_FROM_EMAIL` must be verified in AWS SES console before it can send emails
- **SNS SMS**: Currently using AWS simulator number (+12065552851) for testing
  - SMS will not actually be delivered with the simulator
  - For production, provision a real origination number in AWS SNS
  - Verify phone numbers in SNS sandbox mode, or request production access

### Security Best Practices
- All PII (email, phone) is hashed with SHA-256 before database storage
- Verification codes are hashed before storage and expire after 10 minutes
- Rate limiting protects against abuse (5 requests/minute per IP)
- Consider adding CAPTCHA for additional bot protection
- Monitor rate limiting effectiveness and adjust limits as needed

### Database
- The secure schema is production-ready and already applied
- Email and phone hashes prevent duplicate signatures
- Verification codes are stored separately with expiry and attempt tracking

### Testing
- Use the SNS simulator number for testing SMS without charges
- Check your spam folder when testing email verification
- Test code expiry by waiting >10 minutes before verifying
- Test attempt limiting by entering wrong codes 3 times

## Admin Dashboard

An unauthenticated admin dashboard is available at `/admin` with the following features:

### Signature Management
- View all signatures (verified and pending)
- Filter by verification status (all/verified/pending)
- Search by name, position, or institution
- Delete signatures with confirmation
- View signature metadata (ID, created date, verification status)

### Initial Signatories Management
- Create new initial/founding signatories
- Edit existing signatories (title, first name, last name, position, institution)
- Delete signatories with confirmation
- Drag-and-drop reordering with visual feedback
- Save display order with bulk update

**Note**: The admin dashboard is currently unauthenticated. Authentication should be added before deploying to production. The `admin_users` table is already set up in the schema for future authentication implementation.

## License

Copyright © 2033. All rights reserved.
