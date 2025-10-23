import { Hono } from 'hono';
import { RateLimiter } from './rate-limiter';
import { AwsClient } from 'aws4fetch';
import { generateToken, verifyPassword } from './auth-utils';
import { adminAuthMiddleware } from './auth-middleware';

type Bindings = {
  DB: D1Database;
  RATE_LIMITER: DurableObjectNamespace;
  JWT_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SES_FROM_EMAIL: string;
  SNS_PHONE_NUMBER: string;
  GEOSCAPE_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// Utility Functions
async function hashString(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashCode(code: string): Promise<string> {
  // Using bcrypt-like hashing via Web Crypto API
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getCodeExpiryTime(): string {
  // 10 minutes from now
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 10);
  return expiry.toISOString();
}

async function sendEmailVerification(
  env: Bindings,
  email: string,
  code: string
): Promise<void> {
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
  });

  const htmlBody = `
    <html>
      <body>
        <h2>Email Verification</h2>
        <p>Your email verification code is:</p>
        <h1 style="font-size: 32px; letter-spacing: 5px;">${code}</h1>
        <p>This code will expire in 10 minutes.</p>
        <p style="color: #666;">If you did not request this code, please ignore this email.</p>
      </body>
    </html>
  `;

  const textBody = `Your email verification code is: ${code}\n\nThis code will expire in 10 minutes.\n\nIf you did not request this code, please ignore this email.`;

  const params = new URLSearchParams({
    'Action': 'SendEmail',
    'Source': env.SES_FROM_EMAIL,
    'Destination.ToAddresses.member.1': email,
    'Message.Subject.Data': 'Your Verification Code - RA2033 Declaration',
    'Message.Body.Text.Data': textBody,
    'Message.Body.Html.Data': htmlBody,
  });

  const response = await aws.fetch(`https://email.${env.AWS_REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SES API error: ${response.status} - ${errorText}`);
  }
}

async function sendSmsVerification(
  env: Bindings,
  mobile: string,
  code: string
): Promise<void> {
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
  });

  // Convert Australian format (04XXXXXXXX) to E.164 format (+614XXXXXXXX)
  // Remove leading 0 and add +61 country code
  const e164Mobile = mobile.startsWith('04') ? `+61${mobile.slice(1)}` : mobile;

  const message = `Your RA2033 verification code is: ${code}. Valid for 10 minutes.`;

  const params = new URLSearchParams({
    'Action': 'Publish',
    'PhoneNumber': e164Mobile,
    'Message': message,
    'MessageAttributes.entry.1.Name': 'AWS.SNS.SMS.SenderID',
    'MessageAttributes.entry.1.Value.DataType': 'String',
    'MessageAttributes.entry.1.Value.StringValue': 'RA2033',
    'MessageAttributes.entry.2.Name': 'AWS.SNS.SMS.SMSType',
    'MessageAttributes.entry.2.Value.DataType': 'String',
    'MessageAttributes.entry.2.Value.StringValue': 'Transactional',
  });

  const response = await aws.fetch(`https://sns.${env.AWS_REGION}.amazonaws.com/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SNS API error: ${response.status} - ${errorText}`);
  }
}

// API Routes
app.post('/api/signatures/check', async (c) => {
  try {
    const body = await c.req.json();
    const { email, mobile } = body;
    
    if (!email && !mobile) {
      return c.json({ error: 'Email or mobile number required' }, 400);
    }
    
    // Check email if provided
    let emailExists = false;
    if (email) {
      const emailHash = await hashString(email.toLowerCase());
      const emailSignature = await c.env.DB.prepare(
        'SELECT id FROM public_signatures WHERE email_hash = ? AND email_verified = 1'
      )
        .bind(emailHash)
        .first();
      
      if (emailSignature) {
        emailExists = true;
      }
    }
    
    // Check mobile if provided
    let mobileExists = false;
    if (mobile) {
      const cleanMobile = mobile.replace(/\D/g, '');
      const phoneHash = await hashString(cleanMobile);
      const phoneSignature = await c.env.DB.prepare(
        'SELECT id FROM public_signatures WHERE phone_hash = ? AND phone_verified = 1'
      )
        .bind(phoneHash)
        .first();
      
      if (phoneSignature) {
        mobileExists = true;
      }
    }
    
    return c.json({ 
      emailExists,
      mobileExists,
      available: !emailExists && !mobileExists
    });
  } catch (error) {
    console.error('Error checking signature existence:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/api/signatures', async (c) => {
  try {
    const body = await c.req.json();
    
    // Rate limiting
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const rateLimitId = c.env.RATE_LIMITER.idFromName(ip);
    const rateLimitStub = c.env.RATE_LIMITER.get(rateLimitId);
    const rateLimitResponse = await rateLimitStub.fetch(
      new Request(`http://internal/?key=${ip}`)
    );
    const rateLimitResult = await rateLimitResponse.json<{ allowed: boolean }>();
    
    if (!rateLimitResult.allowed) {
      return c.json({ error: 'Too many requests' }, 429);
    }
    
    // Validate input
    const { 
      name, email, mobile, position, institution, address,
      addressId, stateElec, fedElec,
      latitude, longitude, sa1, lga, postcode, state
    } = body;
    
    if (!name || !email || !mobile) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Invalid email format' }, 400);
    }
    
    // Mobile validation (Australian format: exactly 10 digits)
    const cleanMobile = mobile.replace(/\D/g, ''); // Remove all non-digit characters
    if (cleanMobile.length !== 10 || !cleanMobile.startsWith('04')) {
      return c.json({ error: 'Invalid Australian mobile number. Must be 10 digits starting with 04.' }, 400);
    }
    
    // Hash email and phone for privacy
    const emailHash = await hashString(email.toLowerCase());
    const phoneHash = await hashString(cleanMobile);
    
    // Check if already signed (by email or phone hash)
    const existingSignature = await c.env.DB.prepare(
      'SELECT id FROM public_signatures WHERE email_hash = ? OR phone_hash = ?'
    )
      .bind(emailHash, phoneHash)
      .first();
    
    if (existingSignature) {
      return c.json({ error: 'This email or phone number has already been used to sign' }, 409);
    }
    
    // Create signature record
    const signatureResult = await c.env.DB.prepare(
      `INSERT INTO public_signatures (
        name, email_hash, phone_hash, position, institution, address,
        address_id, stateElec, fedElec,
        latitude, longitude, sa1, lga, postcode, state,
        email_verified, phone_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)`
    )
      .bind(
        name, emailHash, phoneHash, 
        position || null, institution || null, address || null,
        addressId || null, stateElec || null, fedElec || null,
        latitude || null, longitude || null, sa1 || null, lga || null,
        postcode || null, state || null
      )
      .run();
    
    const signatureId = signatureResult.meta.last_row_id;
    
    // Generate verification codes
    const emailCode = generateVerificationCode();
    const smsCode = generateVerificationCode();
    
    // Hash the codes
    const emailCodeHash = await hashCode(emailCode);
    const smsCodeHash = await hashCode(smsCode);
    
    const expiresAt = getCodeExpiryTime();
    
    // Store verification codes
    await c.env.DB.prepare(
      `INSERT INTO verification_codes (signature_id, code_type, code_hash, expires_at, attempts)
       VALUES (?, 'email', ?, ?, 0)`
    )
      .bind(signatureId, emailCodeHash, expiresAt)
      .run();
    
    await c.env.DB.prepare(
      `INSERT INTO verification_codes (signature_id, code_type, code_hash, expires_at, attempts)
       VALUES (?, 'phone', ?, ?, 0)`
    )
      .bind(signatureId, smsCodeHash, expiresAt)
      .run();
    
    // Send verification codes
    try {
      await Promise.all([
        sendEmailVerification(c.env, email, emailCode),
        sendSmsVerification(c.env, cleanMobile, smsCode),
      ]);
    } catch (error) {
      console.error('Error sending verification codes:', error);
      
      // Clean up the signature record if sending fails
      await c.env.DB.prepare('DELETE FROM public_signatures WHERE id = ?')
        .bind(signatureId)
        .run();
      
      // Return detailed error information for debugging
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorName = error instanceof Error ? error.name : 'Error';
      
      return c.json({ 
        error: 'Failed to send verification codes. Please try again.',
        details: {
          message: errorMessage,
          name: errorName,
          // Include full error in development
          debug: error instanceof Error ? error.toString() : String(error)
        }
      }, 500);
    }
    
    return c.json({
      id: signatureId,
      message: 'Verification codes sent to your email and phone',
    });
  } catch (error) {
    console.error('Error creating signature:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.post('/api/signatures/:id/verify', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { emailCode, smsCode } = body;
    
    if (!emailCode || !smsCode) {
      return c.json({ error: 'Missing verification codes' }, 400);
    }
    
    // Get signature
    const signature = await c.env.DB.prepare(
      'SELECT email_verified, phone_verified FROM public_signatures WHERE id = ?'
    )
      .bind(id)
      .first();
    
    if (!signature) {
      return c.json({ error: 'Signature not found' }, 404);
    }
    
    if (signature.email_verified && signature.phone_verified) {
      return c.json({ error: 'Signature already verified' }, 400);
    }
    
    // Hash the provided codes
    const emailCodeHash = await hashCode(emailCode);
    const smsCodeHash = await hashCode(smsCode);
    
    // Define type for verification code records
    type VerificationCodeRecord = {
      id: number;
      code_type: string;
      code_hash: string;
      expires_at: string;
      attempts: number;
      verified_at: string | null;
    };
    
    // Get verification codes
    const codes = await c.env.DB.prepare(
      `SELECT id, code_type, code_hash, expires_at, attempts, verified_at 
       FROM verification_codes 
       WHERE signature_id = ? AND code_type IN ('email', 'phone')`
    )
      .bind(id)
      .all();
    
    if (!codes.results || codes.results.length !== 2) {
      return c.json({ error: 'Verification codes not found' }, 404);
    }
    
    const emailVerification = codes.results.find((c: any) => c.code_type === 'email') as VerificationCodeRecord;
    const phoneVerification = codes.results.find((c: any) => c.code_type === 'phone') as VerificationCodeRecord;
    
    if (!emailVerification || !phoneVerification) {
      return c.json({ error: 'Verification codes not found' }, 404);
    }
    
    // Check if already verified
    if (emailVerification.verified_at && phoneVerification.verified_at) {
      return c.json({ error: 'Already verified' }, 400);
    }
    
    // Check expiry
    const now = new Date();
    if (new Date(emailVerification.expires_at) < now || new Date(phoneVerification.expires_at) < now) {
      return c.json({ error: 'Verification codes have expired' }, 400);
    }
    
    // Check attempt limits
    if (emailVerification.attempts >= 3 || phoneVerification.attempts >= 3) {
      return c.json({ error: 'Too many failed attempts. Please request new codes.' }, 400);
    }
    
    // Verify codes
    const emailValid = emailVerification.code_hash === emailCodeHash;
    const phoneValid = phoneVerification.code_hash === smsCodeHash;
    
    if (!emailValid || !phoneValid) {
      // Increment attempt counters
      await c.env.DB.prepare(
        'UPDATE verification_codes SET attempts = attempts + 1 WHERE signature_id = ? AND code_type IN (?, ?)'
      )
        .bind(id, 'email', 'phone')
        .run();
      
      const attemptsRemaining = Math.min(
        3 - (emailVerification.attempts + 1),
        3 - (phoneVerification.attempts + 1)
      );
      
      return c.json({ 
        error: 'Invalid verification codes',
        attemptsRemaining: attemptsRemaining > 0 ? attemptsRemaining : 0,
      }, 400);
    }
    
    // Mark codes as verified
    await c.env.DB.prepare(
      'UPDATE verification_codes SET verified_at = CURRENT_TIMESTAMP WHERE signature_id = ? AND code_type IN (?, ?)'
    )
      .bind(id, 'email', 'phone')
      .run();
    
    // Update signature verification status
    await c.env.DB.prepare(
      `UPDATE public_signatures 
       SET email_verified = 1, phone_verified = 1, verification_completed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`
    )
      .bind(id)
      .run();
    
    return c.json({ message: 'Signature verified successfully' });
  } catch (error) {
    console.error('Error verifying signature:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/api/signatures', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, position, institution, verification_completed_at as created_at 
       FROM public_signatures 
       WHERE email_verified = 1 AND phone_verified = 1 AND verification_completed_at IS NOT NULL
       ORDER BY verification_completed_at DESC`
    ).all();
    
    return c.json({ signatures: results });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/api/signatures/count', async (c) => {
  try {
    // Count verified public signatures
    const publicResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM public_signatures WHERE email_verified = 1 AND phone_verified = 1'
    ).first() as { count: number } | null;
    
    // Count initial signatories
    const initialResult = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM initial_signatories'
    ).first() as { count: number } | null;
    
    const publicCount = publicResult?.count || 0;
    const initialCount = initialResult?.count || 0;
    const totalCount = publicCount + initialCount;
    
    return c.json({ count: totalCount });
  } catch (error) {
    console.error('Error counting signatures:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/api/initial-signatories', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT title, first_name, last_name, position, institution 
       FROM initial_signatories 
       ORDER BY display_order ASC, last_name ASC`
    ).all();
    
    return c.json({ signatories: results });
  } catch (error) {
    console.error('Error fetching initial signatories:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Admin Authentication Routes

// Admin login endpoint with rate limiting
app.post('/api/admin/login', async (c) => {
  try {
    // Rate limiting for login attempts
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const rateLimitKey = `admin-login-${ip}`;
    const rateLimitId = c.env.RATE_LIMITER.idFromName(rateLimitKey);
    const rateLimitStub = c.env.RATE_LIMITER.get(rateLimitId);
    const rateLimitResponse = await rateLimitStub.fetch(
      new Request(`http://internal/?key=${rateLimitKey}`)
    );
    const rateLimitResult = await rateLimitResponse.json<{ allowed: boolean }>();
    
    if (!rateLimitResult.allowed) {
      return c.json({ error: 'Too many login attempts. Please try again later.' }, 429);
    }
    
    const body = await c.req.json();
    const { email, password } = body;
    
    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }
    
    // Check for JWT_SECRET
    if (!c.env.JWT_SECRET) {
      console.error('JWT_SECRET is not configured');
      return c.json({ error: 'Authentication service is not properly configured. Please contact support.' }, 500);
    }
    
    // Find admin user by email
    let user: { id: number; email: string; password_hash: string } | null = null;
    try {
      user = await c.env.DB.prepare(
        'SELECT id, email, password_hash FROM admin_users WHERE email = ?'
      )
        .bind(email.toLowerCase())
        .first() as { id: number; email: string; password_hash: string } | null;
    } catch (dbError) {
      console.error('Database error during login:', dbError);
      return c.json({ error: 'Unable to connect to database. Please try again later.' }, 500);
    }
    
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    
    // Verify password
    let isValid = false;
    try {
      isValid = await verifyPassword(password, user.password_hash);
    } catch (verifyError) {
      console.error('Password verification error:', verifyError);
      return c.json({ error: 'Authentication error. Please try again.' }, 500);
    }
    
    if (!isValid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    
    // Generate JWT token
    let token: string;
    try {
      token = await generateToken(user.id, user.email, c.env.JWT_SECRET);
    } catch (tokenError) {
      console.error('Token generation error:', tokenError);
      return c.json({ error: 'Failed to generate authentication token. Please try again.' }, 500);
    }
    
    return c.json({
      token,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Unexpected login error:', error);
    return c.json({ 
      error: 'An unexpected error occurred during login. Please try again.'
    }, 500);
  }
});

// Admin logout endpoint (client-side token removal, but we acknowledge the request)
app.post('/api/admin/logout', async (c) => {
  // In a stateless JWT system, logout is primarily handled client-side
  // by removing the token. This endpoint exists for completeness and
  // could be extended to implement token blacklisting if needed.
  return c.json({ message: 'Logged out successfully' });
});

// Verify current authentication status
app.get('/api/admin/verify', adminAuthMiddleware, async (c) => {
  // If middleware passes, user is authenticated
  return c.json({ authenticated: true });
});

// Admin API Routes (protected with authentication)

// Get all signatures (including unverified)
app.get('/api/admin/signatures', adminAuthMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, email_hash, phone_hash, position, institution, 
              email_verified, phone_verified, verification_completed_at, created_at
       FROM public_signatures 
       ORDER BY created_at DESC`
    ).all();
    
    return c.json({ signatures: results });
  } catch (error) {
    console.error('Error fetching admin signatures:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete a signature
app.delete('/api/admin/signatures/:id', adminAuthMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    
    const result = await c.env.DB.prepare(
      'DELETE FROM public_signatures WHERE id = ?'
    ).bind(id).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Signature not found' }, 404);
    }
    
    return c.json({ message: 'Signature deleted successfully' });
  } catch (error) {
    console.error('Error deleting signature:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Get all initial signatories (with IDs for editing)
app.get('/api/admin/initial-signatories', adminAuthMiddleware, async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      `SELECT id, title, first_name, last_name, position, institution, display_order, created_at
       FROM initial_signatories 
       ORDER BY display_order ASC, last_name ASC`
    ).all();
    
    return c.json({ signatories: results });
  } catch (error) {
    console.error('Error fetching admin initial signatories:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create new initial signatory
app.post('/api/admin/initial-signatories', adminAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { title, first_name, last_name, position, institution, display_order } = body;
    
    if (!first_name || !last_name) {
      return c.json({ error: 'First name and last name are required' }, 400);
    }
    
    const result = await c.env.DB.prepare(
      `INSERT INTO initial_signatories (title, first_name, last_name, position, institution, display_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      title || null,
      first_name,
      last_name,
      position || null,
      institution || null,
      display_order || 0
    ).run();
    
    return c.json({
      id: result.meta.last_row_id,
      message: 'Initial signatory created successfully'
    });
  } catch (error) {
    console.error('Error creating initial signatory:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update initial signatory
app.put('/api/admin/initial-signatories/:id', adminAuthMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { title, first_name, last_name, position, institution, display_order } = body;
    
    if (!first_name || !last_name) {
      return c.json({ error: 'First name and last name are required' }, 400);
    }
    
    const result = await c.env.DB.prepare(
      `UPDATE initial_signatories 
       SET title = ?, first_name = ?, last_name = ?, position = ?, institution = ?, display_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(
      title || null,
      first_name,
      last_name,
      position || null,
      institution || null,
      display_order || 0,
      id
    ).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Initial signatory not found' }, 404);
    }
    
    return c.json({ message: 'Initial signatory updated successfully' });
  } catch (error) {
    console.error('Error updating initial signatory:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Delete initial signatory
app.delete('/api/admin/initial-signatories/:id', adminAuthMiddleware, async (c) => {
  try {
    const id = c.req.param('id');
    
    const result = await c.env.DB.prepare(
      'DELETE FROM initial_signatories WHERE id = ?'
    ).bind(id).run();
    
    if (result.meta.changes === 0) {
      return c.json({ error: 'Initial signatory not found' }, 404);
    }
    
    return c.json({ message: 'Initial signatory deleted successfully' });
  } catch (error) {
    console.error('Error deleting initial signatory:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Bulk update display order for initial signatories
app.patch('/api/admin/initial-signatories/reorder', adminAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { signatories } = body; // Array of { id, display_order }
    
    if (!Array.isArray(signatories)) {
      return c.json({ error: 'Invalid request format' }, 400);
    }
    
    // Update each signatory's display order
    for (const signatory of signatories) {
      await c.env.DB.prepare(
        'UPDATE initial_signatories SET display_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(signatory.display_order, signatory.id).run();
    }
    
    return c.json({ message: 'Display order updated successfully' });
  } catch (error) {
    console.error('Error reordering signatories:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Test endpoints for AWS services
app.post('/api/test/ses', async (c) => {
  try {
    const body = await c.req.json();
    const { email } = body;
    
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }
    
    const testCode = '123456';
    await sendEmailVerification(c.env, email, testCode);
    
    return c.json({ 
      success: true,
      message: 'Test email sent successfully',
      to: email
    });
  } catch (error) {
    console.error('SES test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'Error';
    
    return c.json({ 
      success: false,
      error: 'Failed to send test email',
      details: {
        message: errorMessage,
        name: errorName,
        debug: error instanceof Error ? error.toString() : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    }, 500);
  }
});

app.post('/api/test/sns', async (c) => {
  try {
    const body = await c.req.json();
    const { mobile } = body;
    
    if (!mobile) {
      return c.json({ error: 'Mobile number is required' }, 400);
    }
    
    const testCode = '123456';
    await sendSmsVerification(c.env, mobile, testCode);
    
    return c.json({ 
      success: true,
      message: 'Test SMS sent successfully',
      to: mobile
    });
  } catch (error) {
    console.error('SNS test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorName = error instanceof Error ? error.name : 'Error';
    
    return c.json({ 
      success: false,
      error: 'Failed to send test SMS',
      details: {
        message: errorMessage,
        name: errorName,
        debug: error instanceof Error ? error.toString() : String(error),
        stack: error instanceof Error ? error.stack : undefined
      }
    }, 500);
  }
});

app.get('/api/test/config', async (c) => {
  // Return sanitized config info for debugging
  return c.json({
    region: c.env.AWS_REGION,
    sesFromEmail: c.env.SES_FROM_EMAIL,
    snsPhoneNumber: c.env.SNS_PHONE_NUMBER,
    hasAccessKeyId: !!c.env.AWS_ACCESS_KEY_ID,
    hasSecretAccessKey: !!c.env.AWS_SECRET_ACCESS_KEY,
    accessKeyIdLength: c.env.AWS_ACCESS_KEY_ID?.length || 0,
  });
});

// Address search proxy endpoints (Geoscape API)
app.get('/api/address/search', async (c) => {
  try {
    const query = c.req.query('query');
    
    if (!query || query.length < 3) {
      return c.json({ error: 'Query must be at least 3 characters' }, 400);
    }
    
    // Call Geoscape API
    const apiUrl = `https://api.psma.com.au/v1/predictive/address?query=${encodeURIComponent(query)}`;
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': c.env.GEOSCAPE_API_KEY,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Geoscape API error:', response.status, errorText);
      return c.json({ error: 'Address search failed' }, 500);
    }
    
    const data = await response.json() as any;
    return c.json(data);
  } catch (error) {
    console.error('Error searching addresses:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

app.get('/api/address/verify/:addressId', async (c) => {
  try {
    const addressId = c.req.param('addressId');
    
    // Call Geoscape API to get full address details
    const apiUrl = `https://api.psma.com.au/v2/addresses/address/${addressId}?additionalProperties=all`;
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
        'Authorization': c.env.GEOSCAPE_API_KEY,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Geoscape verify API error:', response.status, errorText);
      return c.json({ error: 'Address verification failed' }, 500);
    }
    
    const data = await response.json() as any;
    return c.json(data);
  } catch (error) {
    console.error('Error verifying address:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Serve static files from the React app (must be last)
app.get('/*', async (c) => {
  // Serve the React app
  return fetch(c.req.raw);
});

export default app;
export { RateLimiter };
