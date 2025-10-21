import { useState, FormEvent } from 'react';

interface SignatureFormProps {
  onSignatureSubmit: (data: { id: number; emailCode: string; smsCode: string }) => void;
}

export default function SignatureForm({ onSignatureSubmit }: SignatureFormProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    position: '',
    institution: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // First, check if email or mobile already exists
      const checkResponse = await fetch('/api/signatures/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: formData.email,
          mobile: formData.mobile,
        }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        throw new Error(checkData.error || 'Failed to validate credentials');
      }

      // If email or mobile already exists, show error and don't proceed
      if (checkData.emailExists || checkData.mobileExists) {
        const errors = [];
        if (checkData.emailExists) {
          errors.push('This email address has already been used to sign the declaration');
        }
        if (checkData.mobileExists) {
          errors.push('This mobile number has already been used to sign the declaration');
        }
        throw new Error(errors.join('. '));
      }

      // Proceed with signature submission
      const response = await fetch('/api/signatures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        // Show detailed error information if available
        let errorMsg = data.error || 'Failed to submit signature';
        if (data.details) {
          errorMsg += `\n\nDetails: ${data.details.message}`;
          if (data.details.debug) {
            errorMsg += `\n\nDebug: ${data.details.debug}`;
          }
        }
        throw new Error(errorMsg);
      }

      // Pass the verification codes to parent
      onSignatureSubmit({
        id: data.id,
        emailCode: data.debug?.emailCode || '',
        smsCode: data.debug?.smsCode || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Sign the Declaration</h2>
      <p className="text-gray-600 mb-6">
        Add your signature to this public declaration. You'll need to verify your
        email and mobile number.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Full Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="John Smith"
          />
        </div>

        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            id="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="john@example.com"
          />
        </div>

        <div>
          <label htmlFor="mobile" className="block text-sm font-medium text-gray-700 mb-1">
            Mobile Number <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            id="mobile"
            required
            value={formData.mobile}
            onChange={(e) => {
              // Strip all non-digit characters as user types
              const digitsOnly = e.target.value.replace(/\D/g, '');
              setFormData({ ...formData, mobile: digitsOnly });
            }}
            minLength={10}
            maxLength={10}
            pattern="\d{10}"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="0412345678"
          />
          <p className="text-xs text-gray-500 mt-1">Australian mobile number (10 digits, e.g., 0412345678)</p>
        </div>

        <div>
          <label htmlFor="position" className="block text-sm font-medium text-gray-700 mb-1">
            Position / Role
          </label>
          <input
            type="text"
            id="position"
            value={formData.position}
            onChange={(e) => setFormData({ ...formData, position: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="Senior Developer"
          />
        </div>

        <div>
          <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-1">
            Institution / Organization
          </label>
          <input
            type="text"
            id="institution"
            value={formData.institution}
            onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent"
            placeholder="Acme Corporation"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white py-3 px-6 rounded-md font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Submitting...' : 'Sign Declaration'}
        </button>
      </form>
    </div>
  );
}
