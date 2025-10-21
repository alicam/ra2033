import { useState, useEffect } from 'react';
import { authenticatedFetch } from '../../utils/auth';

interface InitialSignatory {
  id: number;
  title?: string;
  first_name: string;
  last_name: string;
  position?: string;
  institution?: string;
  display_order: number;
  created_at: string;
}

interface SignatoryFormData {
  title: string;
  first_name: string;
  last_name: string;
  position: string;
  institution: string;
}

function InitialSignatoriesManagement() {
  const [signatories, setSignatories] = useState<InitialSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<SignatoryFormData>({
    title: '',
    first_name: '',
    last_name: '',
    position: '',
    institution: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hasUnsavedOrder, setHasUnsavedOrder] = useState(false);

  useEffect(() => {
    fetchSignatories();
  }, []);

  const fetchSignatories = async () => {
    try {
      setLoading(true);
      const response = await authenticatedFetch('/api/admin/initial-signatories');
      const data = await response.json();
      setSignatories(data.signatories || []);
      setHasUnsavedOrder(false);
    } catch (error) {
      console.error('Error fetching signatories:', error);
      showMessage('error', 'Failed to fetch signatories');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.first_name || !formData.last_name) {
      showMessage('error', 'First name and last name are required');
      return;
    }

    try {
      setSubmitting(true);
      const url = editingId 
        ? `/api/admin/initial-signatories/${editingId}`
        : '/api/admin/initial-signatories';
      const method = editingId ? 'PUT' : 'POST';
      
      const response = await authenticatedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          title: formData.title || null,
          position: formData.position || null,
          institution: formData.institution || null,
          display_order: editingId 
            ? signatories.find(s => s.id === editingId)?.display_order || 0
            : signatories.length,
        }),
      });

      if (response.ok) {
        showMessage('success', editingId ? 'Signatory updated successfully' : 'Signatory created successfully');
        resetForm();
        fetchSignatories();
      } else {
        const data = await response.json();
        showMessage('error', data.error || 'Failed to save signatory');
      }
    } catch (error) {
      console.error('Error saving signatory:', error);
      showMessage('error', 'Failed to save signatory');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (signatory: InitialSignatory) => {
    setEditingId(signatory.id);
    setFormData({
      title: signatory.title || '',
      first_name: signatory.first_name,
      last_name: signatory.last_name,
      position: signatory.position || '',
      institution: signatory.institution || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}?`)) {
      return;
    }

    try {
      const response = await authenticatedFetch(`/api/admin/initial-signatories/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        showMessage('success', 'Signatory deleted successfully');
        fetchSignatories();
      } else {
        const data = await response.json();
        showMessage('error', data.error || 'Failed to delete signatory');
      }
    } catch (error) {
      console.error('Error deleting signatory:', error);
      showMessage('error', 'Failed to delete signatory');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      first_name: '',
      last_name: '',
      position: '',
      institution: '',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newSignatories = [...signatories];
    const draggedItem = newSignatories[draggedIndex];
    newSignatories.splice(draggedIndex, 1);
    newSignatories.splice(index, 0, draggedItem);
    
    setSignatories(newSignatories);
    setDraggedIndex(index);
    setHasUnsavedOrder(true);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const saveOrder = async () => {
    try {
      const reorderedSignatories = signatories.map((sig, index) => ({
        id: sig.id,
        display_order: index,
      }));

      const response = await authenticatedFetch('/api/admin/initial-signatories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatories: reorderedSignatories }),
      });

      if (response.ok) {
        showMessage('success', 'Display order saved successfully');
        setHasUnsavedOrder(false);
        fetchSignatories();
      } else {
        const data = await response.json();
        showMessage('error', data.error || 'Failed to save order');
      }
    } catch (error) {
      console.error('Error saving order:', error);
      showMessage('error', 'Failed to save order');
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  if (loading) {
    return <div className="text-center py-8">Loading signatories...</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900">Initial Signatories Management</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-brand text-white rounded-md font-medium"
          >
            {showForm ? 'Cancel' : 'Add New Signatory'}
          </button>
        </div>

        {/* Message Toast */}
        {message && (
          <div className={`mb-4 p-4 rounded-md ${
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Add/Edit Form */}
        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-gray-200 mb-6">
            <h3 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Signatory' : 'Add New Signatory'}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title (optional)
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Dr, Prof, Rev"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position (optional)
                </label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder="e.g., Senior Pastor"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Institution (optional)
                </label>
                <input
                  type="text"
                  value={formData.institution}
                  onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
                  placeholder="e.g., First Baptist Church"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-2 bg-brand text-white rounded-md font-medium disabled:opacity-50"
              >
                {submitting ? 'Saving...' : editingId ? 'Update Signatory' : 'Add Signatory'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Signatories List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <p className="text-sm text-gray-600">
            Drag and drop rows to reorder. {hasUnsavedOrder && '(Unsaved changes)'}
          </p>
          {hasUnsavedOrder && (
            <button
              onClick={saveOrder}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-medium"
            >
              Save Order
            </button>
          )}
        </div>
        <div className="divide-y divide-gray-200">
          {signatories.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No initial signatories yet. Add your first one above.
            </div>
          ) : (
            signatories.map((signatory, index) => (
              <div
                key={signatory.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`p-4 flex items-center justify-between hover:bg-gray-50 cursor-move ${
                  draggedIndex === index ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-gray-400">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 2a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2V4a2 2 0 00-2-2H7zm3 14a1 1 0 100-2 1 1 0 000 2zm0-4a1 1 0 100-2 1 1 0 000 2zm0-4a1 1 0 100-2 1 1 0 000 2z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">
                      {signatory.title && `${signatory.title} `}
                      {signatory.first_name} {signatory.last_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {signatory.position && <span>{signatory.position}</span>}
                      {signatory.position && signatory.institution && <span> · </span>}
                      {signatory.institution && <span>{signatory.institution}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(signatory)}
                    className="px-3 py-1 text-sm hover:text-gray-900"
                    style={{ color: '#16747D' }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(
                      signatory.id,
                      `${signatory.title ? signatory.title + ' ' : ''}${signatory.first_name} ${signatory.last_name}`
                    )}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default InitialSignatoriesManagement;
