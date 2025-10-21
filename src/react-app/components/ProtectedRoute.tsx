import { ReactNode, useEffect, useState } from 'react';
import { isAuthenticated, verifyAuth } from '../utils/auth';

interface ProtectedRouteProps {
  children: ReactNode;
  onUnauthenticated: () => void;
}

export default function ProtectedRoute({ children, onUnauthenticated }: ProtectedRouteProps) {
  const [isVerifying, setIsVerifying] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      // Quick check if token exists
      if (!isAuthenticated()) {
        setIsVerifying(false);
        onUnauthenticated();
        return;
      }

      // Verify with server
      const isValid = await verifyAuth();
      
      if (isValid) {
        setIsAuthorized(true);
      } else {
        onUnauthenticated();
      }
      
      setIsVerifying(false);
    }

    checkAuth();
  }, [onUnauthenticated]);

  if (isVerifying) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderBottomColor: '#16747D' }}></div>
          <p className="mt-4 text-gray-600">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
}
