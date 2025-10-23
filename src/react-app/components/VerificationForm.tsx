import { useState, FormEvent } from 'react';

interface VerificationFormProps {
  signatureId: number;
  onVerificationComplete: () => void;
  onCancel: () => void;
}

export default function VerificationForm({
  signatureId,
  onVerificationComplete,
  onCancel,
}: VerificationFormProps) {
  const [emailCode, setEmailCode] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/signatures/${signatureId}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ emailCode, smsCode }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Verification failed');
      }

      setSuccess(true);
      setTimeout(() => {
        onVerificationComplete();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Verified!</h2>
        <p className="text-gray-600">Your signature has been added to the declaration.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Verify Your Signature</h2>
      <p className="text-gray-600 mb-6">
        We've sent verification codes to your email and mobile number. Please enter them
        below to complete your signature.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="emailCode" className="block text-sm font-medium text-gray-700 mb-1">
            Email Verification Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="emailCode"
            required
            maxLength={6}
            value={emailCode}
            onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent text-center text-2xl tracking-widest bg-white"
            placeholder="000000"
          />
        </div>

        <div>
          <label htmlFor="smsCode" className="block text-sm font-medium text-gray-700 mb-1">
            SMS Verification Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            id="smsCode"
            required
            maxLength={6}
            value={smsCode}
            onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand focus:border-transparent text-center text-2xl tracking-widest bg-white"
            placeholder="000000"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 bg-gray-200 text-gray-700 py-3 px-6 rounded-md font-medium hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || emailCode.length !== 6 || smsCode.length !== 6}
            className="flex-1 bg-brand text-white py-3 px-6 rounded-md font-medium disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </div>
      </form>
    </div>
  );
}
