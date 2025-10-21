import { useState, useEffect } from 'react';
import { authenticatedFetch } from '../../utils/auth';

interface Signature {
  id: number;
  name: string;
  email_hash: string;
  phone_hash: string;
  position?: string;
  institution?: string;
  email_verified: number;
  phone_verified: number;
  verification_completed_at?: string;
  created_at: string;
}

function SignatureManagement() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSignatures();
  }, []);

  const fetchSignatures = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch('/api/admin/signatures');
      const data = await response.json();
      setSignatures(data.signatures || []);
    } catch (error) {
      console.error('Error fetching signatures:', error);
      showMessage('error', 'Failed to fetch signatures');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete the signature from ${name}?`)) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await authenticatedFetch(`/api/admin/signatures/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSignatures(signatures.filter(sig => sig.id !== id));
        showMessage('success', 'Signature deleted successfully');
      } else {
        const data = await response.json();
        showMessage('error', data.error || 'Failed to delete signature');
      }
    } catch (error) {
      console.error('Error deleting signature:', error);
      showMessage('error', 'Failed to delete signature');
    } finally {
      setDeletingId(null);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const filteredSignatures = signatures.filter(sig => {
    // Filter by verification status
    if (filter === 'verified' && (!sig.email_verified || !sig.phone_verified)) {
      return false;
    }
    if (filter === 'pending' && sig.email_verified && sig.phone_verified) {
      return false;
    }

    // Filter by search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      return (
        sig.name.toLowerCase().includes(search) ||
        sig.position?.toLowerCase().includes(search) ||
        sig.institution?.toLowerCase().includes(search)
      );
    }

    return true;
  });

  const getVerificationBadge = (sig: Signature) => {
    if (sig.email_verified && sig.phone_verified) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          Verified
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        Pending
      </span>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Loading signatures...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Signature Management</h2>
        
        {/* Message Toast */}
        {message && (
          <div className={`mb-4 p-4 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by name, position, or institution..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-md font-medium ${
                filter === 'all'
                  ? 'bg-brand text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              All ({signatures.length})
            </button>
            <button
              onClick={() => setFilter('verified')}
              className={`px-4 py-2 rounded-md font-medium ${
                filter === 'verified'
                  ? 'bg-brand text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Verified ({signatures.filter(s => s.email_verified && s.phone_verified).length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-md font-medium ${
                filter === 'pending'
                  ? 'bg-brand text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Pending ({signatures.filter(s => !s.email_verified || !s.phone_verified).length})
            </button>
          </div>
        </div>
      </div>

      {/* Signatures Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Position
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Institution
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredSignatures.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                  No signatures found
                </td>
              </tr>
            ) : (
              filteredSignatures.map((signature) => (
                <tr key={signature.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {signature.id}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {signature.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {signature.position || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {signature.institution || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {getVerificationBadge(signature)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(signature.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => handleDelete(signature.id, signature.name)}
                      disabled={deletingId === signature.id}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50"
                    >
                      {deletingId === signature.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default SignatureManagement;
