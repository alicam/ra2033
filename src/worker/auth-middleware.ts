import { Context, Next } from 'hono';
import { verifyToken, extractTokenFromHeader } from './auth-utils';

type Bindings = {
  DB: D1Database;
  RATE_LIMITER: DurableObjectNamespace;
  JWT_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SES_FROM_EMAIL: string;
  SNS_PHONE_NUMBER: string;
};

/**
 * Middleware to protect admin routes with JWT authentication
 */
export async function adminAuthMiddleware(
  c: Context<{ Bindings: Bindings }>,
  next: Next
) {
  const authHeader = c.req.header('Authorization') || null;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401);
  }
  
  const payload = await verifyToken(token, c.env.JWT_SECRET);
  
  if (!payload) {
    return c.json({ error: 'Unauthorized - Invalid or expired token' }, 401);
  }
  
  // Verify user still exists in database
  const user = await c.env.DB.prepare(
    'SELECT id, email FROM admin_users WHERE id = ?'
  )
    .bind(payload.userId)
    .first();
  
  if (!user) {
    return c.json({ error: 'Unauthorized - User not found' }, 401);
  }
  
  // Store user info in context (can be accessed in route handlers if needed)
  // Note: We don't use c.set() due to type constraints, but the verification is complete
  
  await next();
}
