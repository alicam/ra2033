interface Signature {
  id: number;
  name: string;
  position?: string;
  institution?: string;
  created_at: string;
}

interface SignatureListProps {
  signatures: Signature[];
}

export default function SignatureList({ signatures }: SignatureListProps) {
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Signatories</h2>
      
      {signatures.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No signatures yet. Be the first to sign!</p>
      ) : (
        <div className="space-y-4">
          {signatures.map((signature) => (
            <div
              key={signature.id}
              className="border-l-4 border-brand pl-4 py-2 hover:bg-gray-50 transition-colors"
            >
              <div className="font-semibold text-gray-900">{signature.name}</div>
              {(signature.position || signature.institution) && (
                <div className="text-sm text-gray-600 mt-1">
                  {signature.position && <span>{signature.position}</span>}
                  {signature.position && signature.institution && <span> · </span>}
                  {signature.institution && <span>{signature.institution}</span>}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-1">
                Signed {formatDate(signature.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
