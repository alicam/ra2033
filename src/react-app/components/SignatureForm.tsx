import { useState, FormEvent } from 'react';
import AddressAutocomplete from './AddressAutocomplete';

interface SignatureFormProps {
  onSignatureSubmit: (data: { id: number; emailCode: string; smsCode: string }) => void;
}

export default function SignatureForm({ onSignatureSubmit }: SignatureFormProps) {
  const [showFinePrint, setShowFinePrint] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    position: '',
    institution: '',
    address: '',
    addressId: '',
    stateElec: '',
    fedElec: '',
    latitude: null as number | null,
    longitude: null as number | null,
    sa1: '',
    lga: '',
    postcode: '',
    state: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate that a proper address with addressId was selected
    if (!formData.addressId) {
      setError('Please select a valid address from the dropdown suggestions');
      setLoading(false);
      return;
    }

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
          errors.push('This email address has already been used to sign the statement');
        }
        if (checkData.mobileExists) {
          errors.push('This mobile number has already been used to sign the statement');
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
      <h2 className="text-2xl font-bold mb-4">Sign the Statement</h2>
      <p className="text-gray-600 mb-4">
        Add your signature to this public statement. You'll need to verify your
        email and mobile number.
      </p>

      <div className="mb-6">
        <button
          type="button"
          onClick={() => setShowFinePrint(!showFinePrint)}
          className="text-brand flex items-center gap-2 text-sm"
        >
          {showFinePrint ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="20" height="20" rx="3" stroke="#16747D" strokeWidth="2.5" fill="none"/>
              <line x1="7" y1="12" x2="17" y2="12" stroke="#16747D" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="2" y="2" width="20" height="20" rx="3" stroke="#16747D" strokeWidth="2.5" fill="none"/>
              <line x1="12" y1="7" x2="12" y2="17" stroke="#16747D" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="7" y1="12" x2="17" y2="12" stroke="#16747D" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          )}
          <span>{showFinePrint ? 'Hide' : 'Read'} the fine print</span>
        </button>
        
        {showFinePrint && (
          <div className="mt-3 text-sm text-gray-600 space-y-2">
            <p>
              To dissuade spammers and protect the integrity of this statement, we are asking for your email address and Australian mobile number. A verification code will be sent to each one, and you will be asked to provide those codes to verify your identity. We are also asking for your Australian residential address, in order to label your signature with your suburb/town, and in order to measure the effective spread of this campaign.
            </p>
            <p>
              Your private information is safe with us, and will not be shared or sold. We will never communicate with you by mobile without your prior permission. Any email communication you receive from us will include an opt-out facility.
            </p>
          </div>
        )}
      </div>

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
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
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
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
            placeholder="john@example.com.au"
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
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
            placeholder="0412345678"
          />
          <p className="text-xs text-gray-500 mt-1">Australian mobile number (10 digits, e.g., 0412345678)</p>
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
            Home Address <span className="text-red-500">*</span>
            {formData.addressId && (
              <span className="ml-2 text-green-600 text-xs">
                ✓ Address verified
              </span>
            )}
          </label>
          <AddressAutocomplete
            value={formData.address}
            required={true}
            onChange={async (value, addressId) => {
              // If addressId is provided, it's a valid selection from dropdown
              // If not provided (user is typing), clear the addressId
              setFormData({ ...formData, address: value, addressId: addressId || '' });
              
              // If we have an addressId, fetch the full verified details
              if (addressId) {
                try {
                  const response = await fetch(`/api/address/verify/${addressId}`);
                  if (response.ok) {
                    const data = await response.json();
                    
                    // Log the full response for debugging
                    console.log('Verified Address Data:', data);
                    
                    // Extract addressId
                    const verifiedAddressId = data.properties?.addressId || addressId;
                    
                    // Extract formattedAddress (overwrite the autocomplete suggestion)
                    const formattedAddress = data.properties?.formattedAddress || value;
                    
                    // Extract electorates (only the names)
                    const stateElec = data.properties?.stateElectorate?.stateElectoralName || '';
                    const fedElec = data.properties?.commonwealthElectorate?.commElectoralName || '';
                    
                    // Extract coordinates (GeoJSON format: [longitude, latitude])
                    const longitude = data.geometry?.coordinates?.[0] || null;
                    const latitude = data.geometry?.coordinates?.[1] || null;
                    
                    // Extract SA1 from the latest census year
                    let sa1 = '';
                    if (data.properties?.asgsMain && Array.isArray(data.properties.asgsMain)) {
                      // Find the entry with the highest census year
                      const latestCensus = data.properties.asgsMain.reduce((latest: any, current: any) => {
                        return (!latest || current.censusYear > latest.censusYear) ? current : latest;
                      }, null);
                      sa1 = latestCensus?.sa1Id || '';
                    }
                    
                    // Extract LGA short name (may not be present)
                    const lga = data.properties?.localGovernmentArea?.lgaShortName || '';
                    
                    // Extract postcode and state
                    const postcode = data.properties?.postcode || '';
                    const state = data.properties?.stateTerritory || '';
                    
                    // Update form data with all extracted fields
                    setFormData(prev => ({
                      ...prev,
                      address: formattedAddress,
                      addressId: verifiedAddressId,
                      stateElec,
                      fedElec,
                      latitude,
                      longitude,
                      sa1,
                      lga,
                      postcode,
                      state,
                    }));
                  } else {
                    console.error('Failed to verify address:', response.statusText);
                  }
                } catch (error) {
                  console.error('Error fetching verified address:', error);
                }
              }
            }}
            placeholder="Start typing your address..."
            disabled={loading}
          />
          <p className="text-xs text-gray-500 mt-1">Start typing to search for your Australian residential address</p>
        </div>

        <div>
          <label htmlFor="position" className="block text-sm font-medium text-gray-700 mb-1">
            Position/Role (optional)
          </label>
          <input
            type="text"
            id="position"
            value={formData.position}
            onChange={(e) => setFormData({ ...formData, position: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
            placeholder="Senior Pastor"
          />
        </div>

        <div>
          <label htmlFor="institution" className="block text-sm font-medium text-gray-700 mb-1">
            Church/Organisation (optional)
          </label>
          <input
            type="text"
            id="institution"
            value={formData.institution}
            onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
            className="w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
            placeholder="Smith Street Church"
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
          {loading ? 'Submitting...' : 'Sign Statement'}
        </button>
      </form>
    </div>
  );
}
