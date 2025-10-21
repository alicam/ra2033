interface InitialSignatory {
  title?: string;
  first_name: string;
  last_name: string;
  position?: string;
  institution?: string;
}

interface InitialSignatoriesListProps {
  signatories: InitialSignatory[];
}

export default function InitialSignatoriesList({ signatories }: InitialSignatoriesListProps) {
  if (signatories.length === 0) {
    return null;
  }

  // Shuffle signatories for random display on each page load
  const shuffledSignatories = [...signatories].sort(() => Math.random() - 0.5);

  const formatName = (signatory: InitialSignatory) => {
    const parts = [];
    if (signatory.title) parts.push(signatory.title);
    parts.push(signatory.first_name);
    parts.push(signatory.last_name);
    return parts.join(' ');
  };

  return (
    <div className="mt-8 pt-8 border-t border-gray-200">
      <h3 className="text-xl font-semibold text-gray-900 mb-6">Initial Signatories</h3>
      
      <div className="space-y-3">
        {shuffledSignatories.map((signatory, index) => (
          <div
            key={index}
            className="border-l-4 border-brand pl-4 py-2"
          >
            <div className="font-semibold text-gray-900">{formatName(signatory)}</div>
            {(signatory.position || signatory.institution) && (
              <div className="text-sm text-gray-600 mt-1">
                {signatory.position && <span>{signatory.position}</span>}
                {signatory.position && signatory.institution && <span> · </span>}
                {signatory.institution && <span>{signatory.institution}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
