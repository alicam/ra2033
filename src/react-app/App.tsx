import { useState, useEffect } from 'react';
import './App.css';
import SignatureForm from './components/SignatureForm';
import VerificationForm from './components/VerificationForm';
import SignatureList from './components/SignatureList';
import InitialSignatoriesList from './components/InitialSignatoriesList';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import ProtectedRoute from './components/ProtectedRoute';
import ausLogo from './assets/aus_logo.png';

interface Signature {
  id: number;
  name: string;
  position?: string;
  institution?: string;
  created_at: string;
}

interface InitialSignatory {
  title?: string;
  first_name: string;
  last_name: string;
  position?: string;
  institution?: string;
}

function App() {
  // Simple routing based on pathname
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    // Handle browser back/forward buttons
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  // Admin login route
  if (currentPath === '/admin/login') {
    return (
      <AdminLogin
        onLoginSuccess={() => navigateTo('/admin')}
      />
    );
  }

  // Admin dashboard route (protected)
  if (currentPath === '/admin') {
    return (
      <ProtectedRoute
        onUnauthenticated={() => navigateTo('/admin/login')}
      >
        <AdminDashboard />
      </ProtectedRoute>
    );
  }

  // Otherwise render the main declaration page
  return <DeclarationPage />;
}

function DeclarationPage() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [signatureCount, setSignatureCount] = useState(0);
  const [initialSignatories, setInitialSignatories] = useState<InitialSignatory[]>([]);
  const [pendingVerification, setPendingVerification] = useState<{
    id: number;
    emailCode: string;
    smsCode: string;
  } | null>(null);

  useEffect(() => {
    fetchSignatures();
    fetchSignatureCount();
    fetchInitialSignatories();
  }, []);

  const fetchSignatures = async () => {
    try {
      const response = await fetch('/api/signatures');
      const data = await response.json();
      setSignatures(data.signatures || []);
    } catch (error) {
      console.error('Error fetching signatures:', error);
    }
  };

  const fetchSignatureCount = async () => {
    try {
      const response = await fetch('/api/signatures/count');
      const data = await response.json();
      setSignatureCount(data.count || 0);
    } catch (error) {
      console.error('Error fetching signature count:', error);
    }
  };

  const fetchInitialSignatories = async () => {
    try {
      const response = await fetch('/api/initial-signatories');
      const data = await response.json();
      setInitialSignatories(data.signatories || []);
    } catch (error) {
      console.error('Error fetching initial signatories:', error);
    }
  };

  const handleSignatureSubmit = (data: { id: number; emailCode: string; smsCode: string }) => {
    setPendingVerification(data);
  };

  const handleVerificationComplete = () => {
    setPendingVerification(null);
    fetchSignatures();
    fetchSignatureCount();
  };

  return (
    <div className="min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center">
            <img src={ausLogo} alt="Australia Logo" className="h-16 w-auto mr-4" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Reaching Australia 2033</h1>
              <p className="text-sm text-gray-600 mt-1">{signatureCount} signatories</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Introduction */}
        <section className="mb-8">
          <p className="text-lg text-gray-700 font-medium leading-relaxed">
            In July 2025, a representative group of leaders from across the Australian church met in Brisbane at the Australian Evangelism Roundtable. The following statement has been formally adopted by those Roundtable participants as an important and solemn expression of commitment to completing the Great Commission by Pentecost 2033.
          </p>
          <p className="text-lg text-gray-700 font-bold leading-relaxed mt-3">
            You are invited to read the statement for yourself and prayerfully consider adding your signature, to express your commitment to proclaiming the gospel of Jesus Christ and making disciples.
          </p>
          <div className="mt-6">
            <button
              onClick={() => {
                const formSection = document.querySelector('section:has(form)');
                if (formSection) {
                  formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }}
              className="bg-brand hover:bg-brand-dark text-white font-semibold py-3 px-8 rounded-lg shadow-md transition-colors duration-200"
            >
              Sign the Statement
            </button>
          </div>
        </section>

        {/* The Declaration */}
        <section className="bg-white rounded-lg shadow-md p-8 mb-8">
          <div className="prose prose-lg max-w-none declaration-text">
            <h2 className="text-[333%] font-semibold text-gray-800 mb-4 tracking-[-2px] leading-[1.1]">That all would encounter the Good News of Jesus by Pentecost 2033</h2>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-6 mb-3">Preamble</h3>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-4">
              We, the leaders, members and representatives of Australia's Christian churches
              and networks dedicate ourselves afresh, in the presence of God, to obey Christ's
              command in the Great Commission by praying, proclaiming, and labouring
              together in unity and love until the whole world hears the everlasting gospel.
            </p>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-4">
              We joyfully look forward to the Pentecost season of 2033, which will mark the
              2,000-year anniversary of Christ's crucifixion, resurrection and ascension, and
              the birth of the Church by the outpouring of the Holy Spirit on the day of
              Pentecost.
            </p>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              We express our dedication through the following affirmations and
              commitments.
            </p>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Affirmations</h3>
            
            <ol className="list-decimal list-outside ml-6 space-y-3 mb-6">
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We affirm with joy that the gospel is the power of God for salvation to
                everyone who believes, and that Jesus Christ died for our sins, was buried, and
                was raised on the third day according to the Holy Scriptures.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We affirm that all have sinned and fallen short of the glory of God, yet by
                God's grace, all who believe in Christ are justified freely by faith, for God so
                loved the world that he gave his only Son so that whoever believes in Christ shall
                not perish but have eternal life.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We affirm that to evangelise is to proclaim Christ crucified and risen, calling
                all people everywhere to repent and believe, and the Church is central to God's
                redemptive mission, for as the Father sent his Son in the power of the Holy
                Spirit, so we are sent into the world.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We affirm that the proclamation of the gospel is the urgent task for the
                salvation of the world, and we are accountable to sound the warning and obey
                the final words of Christ found in the Great Commission, which is to make
                disciples of all nations, baptising and teaching them to obey Christ's
                commandments.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We affirm that now is the day of salvation and we cannot delay.
              </li>
            </ol>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Commitments</h3>
            
            <ol className="list-decimal list-outside ml-6 space-y-3 mb-6">
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We commit to making the period up to Pentecost 2033 an unprecedented
                season of collaborative gospel witness and disciple-making in Australia, by
                proclaiming the good news of Jesus Christ across our nation and beyond,
                ensuring that by Pentecost 2033, every Australian has had the opportunity to
                hear and respond to God's saving grace.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We commit to using the time between Easter and Pentecost each year for a
                more intensive season of prayer and evangelism, calling every believer to pray
                for five people and seek to share the gospel with each one during this period.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We commit to raising up prayer, both personally and within the Church, for
                the salvation of souls — for our families, friends, neighbours and co-workers —
                not only for the people in Australia but for the whole world, that as we pray and
                support the sowing of the gospel in other countries, we too shall reap a blessing.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We commit to equipping and activating every believer to be a witness,
                holding forth the word of life, aiming initially to train and mobilise 10 per cent*
                of believers in the joy of sharing the gospel, to gain critical mass for a cultural
                shift within the Church toward every-believer evangelism, where making
                disciples becomes a priority for all, using every means available so that everyone
                in Australia has the opportunity to know and follow Jesus Christ.
              </li>
              <li className="text-lg text-gray-700 leading-relaxed pl-2">
                We commit to striving together as one, making every effort to maintain the
                unity of the Spirit in the bond of peace, that we would fulfil the prayer of Jesus,
                that believers may be one, as they are one with the Father and the Son, so that
                the world may believe.
              </li>
            </ol>
            
            <h3 className="text-xl font-semibold text-gray-900 mt-8 mb-4">Scriptural Foundation</h3>
            
            <p className="text-lg text-gray-700 leading-relaxed mb-6">
              <span className="whitespace-nowrap">Psalms 51:12;</span> <span className="whitespace-nowrap">133;</span> <span className="whitespace-nowrap">Proverbs 24:11–12;</span> <span className="whitespace-nowrap">Ezekiel 33:7–9;</span> <span className="whitespace-nowrap">Matthew 28:18–20;</span> <span className="whitespace-nowrap">Mark 16:15;</span> <span className="whitespace-nowrap">Luke 24:46–47;</span> <span className="whitespace-nowrap">John 3:16;</span> <span className="whitespace-nowrap">6:68;</span> <span className="whitespace-nowrap">9:4;</span> <span className="whitespace-nowrap">17:20-21;</span> <span className="whitespace-nowrap">Acts 1:8;</span> <span className="whitespace-nowrap">Romans 1:16;</span> <span className="whitespace-nowrap">3:23–24;</span> <span className="whitespace-nowrap">5:8;</span> <span className="whitespace-nowrap">6:23;</span> <span className="whitespace-nowrap">10:14–16;</span> <span className="whitespace-nowrap">1 Corinthians 1:10;</span> <span className="whitespace-nowrap">9:22;</span> <span className="whitespace-nowrap">15:3–4;</span> <span className="whitespace-nowrap">2 Corinthians 6:2;</span> <span className="whitespace-nowrap">Philippians 1:27;</span> <span className="whitespace-nowrap">2:15–16;</span> <span className="whitespace-nowrap">Ephesians 2:8–9;</span> <span className="whitespace-nowrap">4:3;</span> <span className="whitespace-nowrap">1 Peter 3:15;</span> <span className="whitespace-nowrap">Jude 2.</span>
            </p>
            
            <p className="text-sm text-gray-600 italic leading-relaxed">
              Note: While some may view the 10 per cent mobilising figure as too low or too high, this figure
              is prayerfully offered to Church leaders across Australia as a starting point, urging that any
              chosen goal be rooted in deep love for Jesus, those needing salvation, and the building up of
              the Church.
            </p>
          </div>
          
          <InitialSignatoriesList signatories={initialSignatories} />
        </section>

        {/* Sign Form or Verification */}
        <section className="rounded-lg shadow-md p-8 mb-8" style={{ backgroundColor: '#F0F5FB' }}>
          {pendingVerification ? (
            <VerificationForm
              signatureId={pendingVerification.id}
              onVerificationComplete={handleVerificationComplete}
              onCancel={() => setPendingVerification(null)}
            />
          ) : (
            <SignatureForm onSignatureSubmit={handleSignatureSubmit} />
          )}
        </section>

        {/* Signatures */}
        <section className="bg-white rounded-lg shadow-md p-8">
          <SignatureList signatures={signatures} />
        </section>
      </main>

      <footer className="bg-brand mt-16">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-white text-sm">
          <p>© 2026 The Australian Evangelism Roundtable · All signatures are verified via email and SMS</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
