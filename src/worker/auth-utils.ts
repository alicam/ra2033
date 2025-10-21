import jwt from '@tsndr/cloudflare-worker-jwt';
import bcrypt from 'bcryptjs';

export interface JWTPayload {
  userId: number;
  email: string;
  exp: number;
}

const TOKEN_EXPIRY_HOURS = 24;

/**
 * Generate a JWT token for an authenticated admin user
 */
export async function generateToken(userId: number, email: string, jwtSecret: string): Promise<string> {
  const expirationTime = Math.floor(Date.now() / 1000) + (TOKEN_EXPIRY_HOURS * 60 * 60);
  
  const token = await jwt.sign(
    {
      userId,
      email,
      exp: expirationTime,
    },
    jwtSecret
  );
  
  return token;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string, jwtSecret: string): Promise<JWTPayload | null> {
  try {
    const isValid = await jwt.verify(token, jwtSecret);
    
    if (!isValid) {
      return null;
    }
    
    const decoded = jwt.decode(token);
    return decoded.payload as JWTPayload;
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Extract JWT token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  return authHeader.substring(7);
}
