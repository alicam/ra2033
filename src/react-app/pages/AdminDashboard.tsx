import { useState } from 'react';
import SignatureManagement from '../components/admin/SignatureManagement';
import InitialSignatoriesManagement from '../components/admin/InitialSignatoriesManagement';
import { logout, getAuthUser } from '../utils/auth';

type Tab = 'signatures' | 'initial-signatories';

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('signatures');
  const user = getAuthUser();

  const handleLogout = async () => {
    await logout();
    window.location.href = '/admin/login';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-sm text-gray-600 mt-1">Manage signatures and initial signatories</p>
            </div>
            <div className="flex items-center space-x-4">
              {user && (
                <span className="text-sm text-gray-600">
                  {user.email}
                </span>
              )}
              <button
                onClick={handleLogout}
                className="px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
              >
                Logout
              </button>
              <a
                href="/"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                ← Back to Declaration
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => setActiveTab('signatures')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'signatures'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Signatures
            </button>
            <button
              onClick={() => setActiveTab('initial-signatories')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'initial-signatories'
                  ? 'border-brand text-brand'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Initial Signatories
            </button>
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'signatures' && <SignatureManagement />}
        {activeTab === 'initial-signatories' && <InitialSignatoriesManagement />}
      </main>

      <footer className="bg-gray-100 mt-16">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-600 text-sm">
          <p>© 2033 · Admin Dashboard</p>
        </div>
      </footer>
    </div>
  );
}

export default AdminDashboard;
