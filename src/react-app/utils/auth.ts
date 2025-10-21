/**
 * Authentication utilities for managing JWT tokens and session state
 */

const TOKEN_KEY = 'admin_token';
const USER_KEY = 'admin_user';

export interface AdminUser {
  id: number;
  email: string;
}

/**
 * Store authentication token and user info in localStorage
 */
export function setAuthToken(token: string, user: AdminUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Get stored authentication token
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Get stored user info
 */
export function getAuthUser(): AdminUser | null {
  const userJson = localStorage.getItem(USER_KEY);
  if (!userJson) return null;
  
  try {
    return JSON.parse(userJson);
  } catch {
    return null;
  }
}

/**
 * Clear authentication data from localStorage
 */
export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

/**
 * Check if user is authenticated (has token)
 */
export function isAuthenticated(): boolean {
  return !!getAuthToken();
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const response = await fetch('/api/admin/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return {
        success: false,
        error: data.error || 'Login failed',
      };
    }
    
    // Store token and user info
    setAuthToken(data.token, data.user);
    
    return { success: true };
  } catch (error) {
    console.error('Login error:', error);
    return {
      success: false,
      error: 'Network error. Please try again.',
    };
  }
}

/**
 * Logout and clear authentication data
 */
export async function logout(): Promise<void> {
  try {
    const token = getAuthToken();
    
    if (token) {
      // Call logout endpoint (optional, mainly for server-side cleanup if needed)
      await fetch('/api/admin/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
    }
  } catch (error) {
    console.error('Logout error:', error);
  } finally {
    // Always clear local auth data
    clearAuth();
  }
}

/**
 * Verify current authentication status with server
 */
export async function verifyAuth(): Promise<boolean> {
  const token = getAuthToken();
  
  if (!token) {
    return false;
  }
  
  try {
    const response = await fetch('/api/admin/verify', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!response.ok) {
      clearAuth();
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Auth verification error:', error);
    clearAuth();
    return false;
  }
}

/**
 * Make an authenticated API request
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = getAuthToken();
  
  if (!token) {
    throw new Error('Not authenticated');
  }
  
  const headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`,
  };
  
  const response = await fetch(url, {
    ...options,
    headers,
  });
  
  // If unauthorized, clear auth data
  if (response.status === 401) {
    clearAuth();
    window.location.href = '/admin/login';
  }
  
  return response;
}
