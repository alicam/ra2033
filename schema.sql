-- Initial Signatories (prominent/founding signatories)
CREATE TABLE IF NOT EXISTS initial_signatories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  position TEXT,
  institution TEXT,
  display_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Public Signatures (general public signatories with verification)
CREATE TABLE IF NOT EXISTS public_signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  phone_hash TEXT NOT NULL,
  position TEXT,
  institution TEXT,
  address TEXT,
  email_verified INTEGER DEFAULT 0,
  phone_verified INTEGER DEFAULT 0,
  verification_completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_public_signatures_verification ON public_signatures(email_verified, phone_verified, verification_completed_at);
CREATE INDEX idx_public_signatures_email ON public_signatures(email_hash);
CREATE INDEX idx_public_signatures_phone ON public_signatures(phone_hash);

-- Verification Codes (for 2FA)
CREATE TABLE IF NOT EXISTS verification_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  signature_id INTEGER NOT NULL,
  code_type TEXT NOT NULL, -- 'email' or 'phone'
  code_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INTEGER DEFAULT 0,
  verified_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (signature_id) REFERENCES public_signatures(id) ON DELETE CASCADE
);

CREATE INDEX idx_verification_codes_signature ON verification_codes(signature_id, code_type);
CREATE INDEX idx_verification_codes_expires ON verification_codes(expires_at);

-- Admin Users (email-based authentication)
CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin user (password should be changed via CLI)
-- Default email: alister@alistercameron.com
-- Default password: changeme123 (MUST be changed after first login)
-- To generate a new password hash, use the bcrypt CLI or create via API
INSERT INTO admin_users (email, password_hash) VALUES ('alister@alistercameron.com', '$2a$10$placeholder');
