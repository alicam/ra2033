# Admin Authentication System

Complete JWT-based authentication system for the RA2033 admin dashboard.

## Features Implemented

✅ **Backend Authentication**
- JWT token generation and verification
- Password hashing with bcrypt
- Login/logout endpoints with rate limiting
- Auth middleware protecting admin routes

✅ **Frontend Authentication**
- Login page with form validation
- Session management with localStorage
- Protected route wrapper component
- Automatic token refresh verification
- Logout functionality

✅ **Security Features**
- Rate limiting on login attempts (5 per minute)
- JWT token expiration (24 hours)
- Bcrypt password hashing (10 rounds)
- Automatic redirect on unauthorized access

## Setup Instructions

### 1. Initialize Database Schema

First, ensure your D1 database has the admin_users table created:

```bash
wrangler d1 execute DB --file=./schema.sql
```

Replace `DB` with your actual database name from `wrangler.json`.

**If you get an error about the table already existing**, you can either:

a) Drop and recreate the admin_users table:
```bash
wrangler d1 execute DB --command="DROP TABLE IF EXISTS admin_users;"
wrangler d1 execute DB --command="CREATE TABLE admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
```

b) Or just ensure the table exists with the correct schema:
```bash
wrangler d1 execute DB --command="CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
```

### 2. Create Initial Admin User

Run the admin user creation script to generate a password hash:

```bash
node scripts/create-admin.js <email> <password>
```

Example:
```bash
node scripts/create-admin.js alister@alistercameron.com MySecurePassword123
```

This will output SQL commands to create the admin user in your D1 database.

### 3. Add Admin User to Database

Execute the generated SQL command using wrangler:

```bash
wrangler d1 execute DB --command="INSERT INTO admin_users (email, password_hash) VALUES ('your-email@example.com', 'generated-hash');"
```

Replace `DB` with your actual database name from `wrangler.json`.

### 4. Configure JWT Secret (Production)

**IMPORTANT**: For production, update the JWT secret in `src/worker/auth-utils.ts`:

```typescript
const JWT_SECRET_KEY = 'your-secret-jwt-key-change-in-production';
```

Consider moving this to an environment variable:

```typescript
const JWT_SECRET_KEY = env.JWT_SECRET_KEY || 'fallback-secret';
```

Then add it to your `wrangler.json`:

```json
{
  "vars": {
    "JWT_SECRET_KEY": "your-production-secret-key"
  }
}
```

## Usage

### Accessing the Admin Dashboard

1. Navigate to `/admin/login`
2. Enter your email and password
3. Upon successful login, you'll be redirected to `/admin`
4. The dashboard is now protected and requires authentication

### Logout

Click the "Logout" button in the admin dashboard header to end your session.

### API Endpoints

#### Login
```
POST /api/admin/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "password"
}

Response:
{
  "token": "jwt-token-here",
  "user": {
    "id": 1,
    "email": "admin@example.com"
  }
}
```

#### Logout
```
POST /api/admin/logout
Authorization: Bearer <token>

Response:
{
  "message": "Logged out successfully"
}
```

#### Verify Authentication
```
GET /api/admin/verify
Authorization: Bearer <token>

Response:
{
  "authenticated": true
}
```

### Protected Admin Routes

All admin API routes now require authentication:
- `GET /api/admin/signatures` - Get all signatures (including unverified)
- `DELETE /api/admin/signatures/:id` - Delete a signature
- `GET /api/admin/initial-signatories` - Get all initial signatories
- `POST /api/admin/initial-signatories` - Create new initial signatory
- `PUT /api/admin/initial-signatories/:id` - Update initial signatory
- `DELETE /api/admin/initial-signatories/:id` - Delete initial signatory
- `PATCH /api/admin/initial-signatories/reorder` - Reorder initial signatories

## File Structure

### Backend Files
```
src/worker/
├── auth-utils.ts          # JWT and password utilities
├── auth-middleware.ts     # Authentication middleware
├── index.ts               # Main worker with auth endpoints
└── rate-limiter.ts        # Rate limiting (existing)
```

### Frontend Files
```
src/react-app/
├── utils/
│   └── auth.ts                           # Auth utilities & session management
├── pages/
│   ├── AdminLogin.tsx                    # Login page
│   └── AdminDashboard.tsx                # Protected dashboard
├── components/
│   ├── ProtectedRoute.tsx                # Route protection wrapper
│   └── admin/
│       ├── SignatureManagement.tsx       # Uses authenticatedFetch
│       └── InitialSignatoriesManagement.tsx  # Uses authenticatedFetch
└── App.tsx                               # Updated routing
```

### Scripts
```
scripts/
└── create-admin.js        # Admin user creation utility
```

## Security Considerations

### Production Checklist

- [ ] Change JWT secret key from default value
- [ ] Use environment variables for sensitive data
- [ ] Enable HTTPS in production
- [ ] Implement JWT token refresh mechanism
- [ ] Add token blacklisting for logout (optional)
- [ ] Monitor rate limit logs for suspicious activity
- [ ] Regularly rotate admin passwords
- [ ] Implement account lockout after failed attempts (optional)

### Rate Limiting

Login attempts are rate-limited to 5 requests per minute per IP address to prevent brute force attacks.

### Token Expiration

JWT tokens expire after 24 hours. Users will need to log in again after expiration.

### Password Requirements

The create-admin script requires:
- Minimum 8 characters
- Valid email format

Consider adding additional password complexity requirements in production.

## Troubleshooting

### "Unauthorized" Error

1. Check that you're logged in
2. Verify JWT token hasn't expired (24h limit)
3. Ensure token is being sent in Authorization header
4. Check browser console for error details

### Can't Create Admin User / "table admin_users has no column named email"

This error means your D1 database doesn't have the admin_users table created yet. Fix it by:

1. **Initialize the database schema:**
   ```bash
   wrangler d1 execute DB --file=./schema.sql
   ```

2. **If that fails, manually create the table:**
   ```bash
   wrangler d1 execute DB --command="CREATE TABLE IF NOT EXISTS admin_users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);"
   ```

3. **Then verify the table exists:**
   ```bash
   wrangler d1 execute DB --command="SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_users';"
   ```

4. **Other checks:**
   - Verify bcryptjs is installed: `npm install bcryptjs`
   - Check that email format is valid
   - Ensure password is at least 8 characters
   - Verify D1 database name in wrangler.json matches command

### Rate Limit Exceeded

Wait 1 minute before attempting to log in again. Rate limits reset every 60 seconds.

### Token Verification Fails

1. Check that JWT_SECRET_KEY matches between token generation and verification
2. Ensure token hasn't expired
3. Verify token format is correct (Bearer <token>)

## Development vs Production

### Development
- Default JWT secret is acceptable
- Login attempts rate limited but recovery is quick
- Tokens stored in localStorage

### Production
- **MUST** change JWT secret key
- Consider implementing token refresh
- Add HTTPS enforcement
- Implement additional security headers
- Consider Redis for rate limiting across multiple workers
- Implement audit logging for admin actions

## Future Enhancements

Potential improvements for the authentication system:

1. **Multi-factor Authentication (MFA)** - Add 2FA support
2. **Password Reset** - Email-based password reset flow
3. **Account Management** - Change password functionality
4. **Session Timeout** - Automatic logout after inactivity
5. **Token Refresh** - Refresh tokens for extended sessions
6. **Audit Log** - Track all admin actions
7. **Role-Based Access** - Multiple admin permission levels
8. **IP Whitelisting** - Restrict admin access by IP
9. **Remember Me** - Extended session option
10. **OAuth Integration** - Support for Google/Microsoft login

## Testing the Implementation

### Manual Testing Steps

1. **Login Flow**
   - Go to `/admin/login`
   - Enter invalid credentials → Should show error
   - Enter valid credentials → Should redirect to `/admin`
   - Verify user email shows in header
   - Check localStorage for token

2. **Protected Routes**
   - Try accessing `/admin` without login → Should redirect to login
   - Login and access `/admin` → Should show dashboard
   - Logout → Should redirect to login page

3. **Token Expiration**
   - Login and note the time
   - Wait 24 hours
   - Try to access admin routes → Should get 401 error
   - Should redirect to login page

4. **Rate Limiting**
   - Try logging in with wrong password 6 times quickly
   - Should get rate limit error on 6th attempt
   - Wait 1 minute → Should be able to try again

5. **API Authentication**
   - Make API call without token → Should get 401
   - Make API call with valid token → Should succeed
   - Make API call with expired token → Should get 401

## Support

For issues or questions about the authentication system:
1. Check this documentation
2. Review browser console for errors
3. Check Cloudflare Workers logs
4. Verify database connectivity

## License

Same as main project
