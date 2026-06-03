import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import { Brain, Loader2 } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import Header, { type Page } from './components/Header';
import SystemPromptPanel from './components/SystemPromptPanel';
import ModelSelector from './components/ModelSelector';
import VoiceOrb from './components/VoiceOrb';
import LanguageSelector from './components/LanguageSelector';
import LiveTranscript, { type TranscriptEntry } from './components/LiveTranscript';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import Login from './components/Login';
import Landing from './components/landing/Landing';
import CraftedBy from './components/landing/CraftedBy';

interface Persona {
  id: string;
  name: string;
  system_prompt: string;
}

interface Language {
  id: string;
  name: string;
}

interface Model {
  id: string;
  name: string;
  provider: string;
  model_id: string;
  description: string;
}

const DEMO_TRANSCRIPT: TranscriptEntry[] = [
  {
    id: '1',
    role: 'user',
    original: 'Naa order ekkada undi?',
    translated: 'Where is my order?',
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: '2',
    role: 'agent',
    original: 'Meeku help cheyyadaaniki nenu ikkada unnaanu. Mee order ID cheppagalara?',
    translated: 'I am here to help you. Can you tell me your order ID?',
    timestamp: new Date(Date.now() - 100000),
  },
  {
    id: '3',
    role: 'user',
    original: 'QK-20457',
    translated: 'QK-20457',
    timestamp: new Date(Date.now() - 80000),
  },
  {
    id: '4',
    role: 'agent',
    original: 'Mee order ippudu delivery lo undi. Eeroju saayantram loga vasthundi.',
    translated: 'Your order is out for delivery. It should arrive by this evening.',
    timestamp: new Date(Date.now() - 60000),
  },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [publicView, setPublicView] = useState<'landing' | 'login' | 'try' | 'credits'>('landing');
  const [showCredits, setShowCredits] = useState(false);
  const [currentPage, setCurrentPage] = useState<Page>('studio');
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [languages, setLanguages] = useState<Language[]>([]);
  const [llmModels, setLlmModels] = useState<Model[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState('');
  const [selectedLanguageId, setSelectedLanguageId] = useState('');
  const [selectedLlm1Id, setSelectedLlm1Id] = useState('');
  const [selectedLlm2Id, setSelectedLlm2Id] = useState('');
  const [promptText, setPromptText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [transcriptEntries, setTranscriptEntries] = useState<TranscriptEntry[]>(DEMO_TRANSCRIPT);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isDemo = !session && publicView === 'try';

  useEffect(() => {
    if (!session && !isDemo) return;
    async function fetchData() {
      const [personasRes, languagesRes, llmRes] = await Promise.all([
        supabase.from('personas').select('*'),
        supabase.from('languages').select('*'),
        supabase.from('llm_models').select('*'),
      ]);

      if (personasRes.data && personasRes.data.length > 0) {
        setPersonas(personasRes.data);
        setSelectedPersonaId(personasRes.data[0].id);
        setPromptText(personasRes.data[0].system_prompt);
      }

      if (languagesRes.data && languagesRes.data.length > 0) {
        const telugu = languagesRes.data.find((l: Language) => l.name === 'Telugu');
        setLanguages(languagesRes.data);
        setSelectedLanguageId(telugu?.id ?? languagesRes.data[0].id);
      }

      if (llmRes.data && llmRes.data.length > 0) {
        setLlmModels(llmRes.data);
        setSelectedLlm1Id(llmRes.data[0].id);
        setSelectedLlm2Id(llmRes.data.length > 1 ? llmRes.data[1].id : llmRes.data[0].id);
      }
    }
    fetchData();
  }, [session, isDemo]);

  function handlePersonaChange(id: string) {
    setSelectedPersonaId(id);
    const persona = personas.find((p) => p.id === id);
    if (persona) {
      setPromptText(persona.system_prompt);
    }
  }

  function handleSendMessage(message: string) {
    const newEntry: TranscriptEntry = {
      id: crypto.randomUUID(),
      role: 'user',
      original: message,
      translated: message,
      timestamp: new Date(),
    };
    setTranscriptEntries((prev) => [...prev, newEntry]);
  }

  const selectedLanguageName =
    languages.find((l) => l.id === selectedLanguageId)?.name ?? 'Telugu';

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#fafaf8]">
        <Loader2 className="w-6 h-6 animate-spin text-stone-400" />
      </div>
    );
  }

  if (showCredits || (!session && publicView === 'credits')) {
    return (
      <CraftedBy
        onBack={() => {
          setShowCredits(false);
          if (!session) setPublicView('landing');
        }}
        onTryIt={() => {
          setShowCredits(false);
          if (!session) {
            setCurrentPage('studio');
            setPublicView('try');
          } else {
            setCurrentPage('studio');
          }
        }}
      />
    );
  }

  if (!session && !isDemo) {
    if (publicView === 'login') {
      return <Login onBack={() => setPublicView('landing')} />;
    }
    return (
      <Landing
        onSignIn={() => setPublicView('login')}
        onTryIt={() => {
          setCurrentPage('studio');
          setPublicView('try');
        }}
        onCrafted={() => setPublicView('credits')}
      />
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#fafaf8]">
      <Header
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        user={session?.user ?? null}
        demoMode={isDemo}
        onExitDemo={() => setPublicView('landing')}
        onSignIn={() => setPublicView('login')}
        onCrafted={() => setShowCredits(true)}
      />

      {currentPage === 'studio' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] min-h-0">
          <div className="px-10 pt-4 pb-6 flex flex-col min-h-0 border-r border-stone-100">
            <div className="flex-1 min-h-0">
              <SystemPromptPanel
                personas={personas}
                selectedPersonaId={selectedPersonaId}
                promptText={promptText}
                onPersonaChange={handlePersonaChange}
                onPromptChange={setPromptText}
              />
            </div>
            <LanguageSelector
              languages={languages}
              selectedLanguageId={selectedLanguageId}
              onLanguageChange={setSelectedLanguageId}
              showTranscript={showTranscript}
              onTranscriptToggle={() => setShowTranscript(!showTranscript)}
            />
          </div>

          <div className="relative overflow-hidden flex flex-col">
            <div className="flex-1">
              <VoiceOrb
                isSpeaking={isSpeaking}
                onToggle={() => setIsSpeaking(!isSpeaking)}
              />
            </div>

            <div className="px-10 pb-8 flex justify-center">
              <div className="w-full max-w-lg grid grid-cols-2 gap-4">
                <ModelSelector
                  label="LLM Model"
                  icon={<Brain className="w-3.5 h-3.5" />}
                  models={llmModels}
                  selectedModelId={selectedLlm1Id}
                  onModelChange={setSelectedLlm1Id}
                />
                <ModelSelector
                  label="LLM Model"
                  icon={<Brain className="w-3.5 h-3.5" />}
                  models={llmModels}
                  selectedModelId={selectedLlm2Id}
                  onModelChange={setSelectedLlm2Id}
                />
              </div>
            </div>

            <div
              className={`absolute inset-0 bg-[#fafaf8]/95 backdrop-blur-md transition-all duration-600 ease-out ${
                showTranscript
                  ? 'translate-y-0 opacity-100'
                  : 'translate-y-full opacity-0 pointer-events-none'
              }`}
            >
              <div className="h-full p-6">
                <LiveTranscript
                  entries={transcriptEntries}
                  sourceLang={selectedLanguageName}
                  targetLang="English"
                  onClose={() => setShowTranscript(false)}
                  onSendMessage={handleSendMessage}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {currentPage === 'dashboard' && <Dashboard />}
      {currentPage === 'settings' && <Settings />}
    </div>
  );
}

export default App;
