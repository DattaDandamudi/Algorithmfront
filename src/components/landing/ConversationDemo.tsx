import { useEffect, useState } from 'react';
import { Mic, Volume2, Globe } from 'lucide-react';
import { useScrollReveal } from './scroll';

interface Bubble {
  id: number;
  role: 'caller' | 'agent';
  source: string;
  english: string;
}

const SCRIPTS: Record<string, Bubble[]> = {
  Telugu: [
    { id: 1, role: 'caller', source: 'Naa peru Ravi. Eeroju 8 ki table dorukutunda?', english: 'My name is Ravi. Can I get a table for 8 PM tonight?' },
    { id: 2, role: 'agent', source: 'Tappakunda, Ravi gaaru. Endharu vasthunnaru?', english: 'Of course, Ravi. How many people are coming?' },
    { id: 3, role: 'caller', source: 'Naluguru. Mariyu peanuts allergy undi.', english: 'Four. And we have a peanut allergy.' },
    { id: 4, role: 'agent', source: 'Confirm aindi — naluguruki, peanuts ledu, 8 ki table booking.', english: 'Confirmed — table for four at 8 PM, peanut-free.' },
  ],
  Spanish: [
    { id: 1, role: 'caller', source: 'Hola, quisiera reservar para dos esta noche.', english: 'Hi, I would like to make a reservation for two tonight.' },
    { id: 2, role: 'agent', source: '¡Por supuesto! ¿A qué hora le gustaría?', english: 'Of course! What time would you like?' },
    { id: 3, role: 'caller', source: 'A las nueve, por favor. Y una mesa cerca de la ventana.', english: 'At nine, please. And a table near the window.' },
    { id: 4, role: 'agent', source: 'Reservado — mesa para dos a las 21:00, junto a la ventana.', english: 'Reserved — table for two at 9 PM, by the window.' },
  ],
  Mandarin: [
    { id: 1, role: 'caller', source: 'Nǐ hǎo, jīn wǎn liù diǎn yǒu wèi zi ma?', english: 'Hello, do you have seats for 6 PM tonight?' },
    { id: 2, role: 'agent', source: 'Yǒu de, qǐng wèn jǐ wèi?', english: 'Yes we do — for how many guests?' },
    { id: 3, role: 'caller', source: 'Sān gè rén. Yǒu sù shí ma?', english: 'Three people. Do you have vegetarian options?' },
    { id: 4, role: 'agent', source: 'Dāngrán — wǒmen yǒu hěn duō sù shí cài. Yǐ yùdìng.', english: 'Of course — we have many vegetarian dishes. Booked.' },
  ],
  Arabic: [
    { id: 1, role: 'caller', source: 'Marḥaban, ʾuṭlub ḥajz li-thalāthat ashkhāṣ al-layla.', english: 'Hello, I would like to reserve for three people tonight.' },
    { id: 2, role: 'agent', source: 'Ahlan wa sahlan. Ay sāʿa tunāsibukum?', english: 'You are most welcome. What time suits you?' },
    { id: 3, role: 'caller', source: 'Al-sāʿa thāmina masāʾan, min faḍlik.', english: 'Eight in the evening, please.' },
    { id: 4, role: 'agent', source: 'Tamma al-ḥajz — thalātha ashkhāṣ, al-sāʿa thāmina.', english: 'Reservation confirmed — three people, 8 PM.' },
  ],
  French: [
    { id: 1, role: 'caller', source: 'Bonsoir, je voudrais réserver pour quatre.', english: 'Good evening, I would like to book for four.' },
    { id: 2, role: 'agent', source: 'Avec plaisir. Pour quelle heure?', english: 'With pleasure. For what time?' },
    { id: 3, role: 'caller', source: 'Vingt heures, en terrasse si possible.', english: '8 PM, on the terrace if possible.' },
    { id: 4, role: 'agent', source: 'Réservé — quatre personnes, 20h, en terrasse.', english: 'Booked — four guests, 8 PM, on the terrace.' },
  ],
};

const LANGUAGES = Object.keys(SCRIPTS);

export default function ConversationDemo() {
  const [language, setLanguage] = useState<string>('Telugu');
  const [visible, setVisible] = useState<Bubble[]>([]);
  const headerRef = useScrollReveal<HTMLDivElement>();
  const leftRef = useScrollReveal<HTMLDivElement>();
  const rightRef = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    setVisible([]);
    const script = SCRIPTS[language];
    const timeouts: number[] = [];
    script.forEach((b, i) => {
      const t = window.setTimeout(() => {
        setVisible((cur) => [...cur, b]);
      }, 800 + i * 1500);
      timeouts.push(t);
    });
    const loop = window.setTimeout(() => {
      setVisible([]);
      script.forEach((b, i) => {
        const t = window.setTimeout(() => {
          setVisible((cur) => [...cur, b]);
        }, 600 + i * 1500);
        timeouts.push(t);
      });
    }, 800 + script.length * 1500 + 2200);
    timeouts.push(loop);
    return () => timeouts.forEach((t) => window.clearTimeout(t));
  }, [language]);

  return (
    <section className="relative text-stone-50 py-20 sm:py-32 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-50/15 to-transparent" />
      <div className="absolute inset-0 bg-radial-amber opacity-50 pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-10">
        <div ref={headerRef} className="scroll-reveal max-w-3xl">
          <div className="inline-flex items-center gap-2 bg-stone-50/[0.05] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300">
            Live demo
          </div>
          <h2 className="mt-4 sm:mt-5 text-[28px] sm:text-[42px] lg:text-[52px] font-semibold tracking-[-0.025em] leading-[1.08] sm:leading-[1.04]">
            Hear it answer a call <span className="text-shimmer animate-gradient-shift">in real time.</span>
          </h2>
        </div>

        <div className="mt-6 sm:mt-10 flex flex-wrap items-center gap-2">
          <Globe className="w-4 h-4 text-stone-500 mr-1" />
          {LANGUAGES.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
              className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[12px] sm:text-[12.5px] font-medium border transition-colors ${
                language === lang
                  ? 'bg-amber-400 text-stone-900 border-amber-400 shadow-[0_8px_30px_rgba(251,191,36,0.35)]'
                  : 'bg-stone-50/[0.04] text-stone-300 border-stone-50/10 hover:bg-stone-50/[0.08]'
              }`}
            >
              {lang}
            </button>
          ))}
        </div>

        <div className="mt-6 sm:mt-10 grid lg:grid-cols-[1fr_1.6fr] gap-4 sm:gap-6">
          <div
            ref={leftRef}
            className="scroll-reveal bg-stone-50/[0.04] border border-stone-50/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 flex flex-col justify-between min-h-[320px] sm:min-h-[440px]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
                <span className="text-[10px] sm:text-[11px] uppercase tracking-[0.18em] text-stone-400">Live call</span>
              </div>
              <span className="text-[10px] sm:text-[11px] text-stone-500 tabular-nums">+1 (415) 555-0140</span>
            </div>

            <div className="my-6 sm:my-8 grid grid-cols-2 gap-4 sm:gap-6">
              <CallerColumn label="Caller" sub={language} icon={<Mic className="w-4 h-4" />} accent="rose" />
              <CallerColumn label="Algoritm" sub="English" icon={<Volume2 className="w-4 h-4" />} accent="amber" />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-4 text-[10px] sm:text-[11px] text-stone-400">
              <DemoStat k="Latency" v="312ms" />
              <DemoStat k="Confidence" v="98.4%" />
              <DemoStat k="Detected" v={language} />
              <DemoStat k="Sentiment" v="Positive" />
            </div>
          </div>

          <div
            ref={rightRef}
            className="scroll-reveal bg-stone-50/[0.04] border border-stone-50/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 min-h-[320px] sm:min-h-[440px] flex flex-col"
            style={{ transitionDelay: '120ms' }}
          >
            <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-stone-400 mb-3 sm:mb-4">
              <span>Transcript</span>
              <span className="tabular-nums">{language} → English</span>
            </div>
            <div className="flex-1 space-y-2.5 sm:space-y-3 overflow-hidden">
              {visible.map((b) => (
                <BubbleItem key={`${language}-${b.id}`} bubble={b} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BubbleItem({ bubble }: { bubble: Bubble }) {
  const isAgent = bubble.role === 'agent';
  return (
    <div className={`flex animate-fade-in-up ${isAgent ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] sm:max-w-[80%] rounded-xl sm:rounded-2xl px-3.5 sm:px-4 py-2.5 sm:py-3 border ${
          isAgent
            ? 'bg-amber-400/15 border-amber-300/30 text-stone-100'
            : 'bg-stone-50/[0.05] border-stone-50/10 text-stone-100'
        }`}
      >
        <div className="text-[11.5px] sm:text-[12.5px] leading-snug">{bubble.source}</div>
        <div className="text-[10.5px] sm:text-[11px] text-stone-400 mt-1 sm:mt-1.5 italic leading-snug">{bubble.english}</div>
      </div>
    </div>
  );
}

function CallerColumn({
  label,
  sub,
  icon,
  accent,
}: {
  label: string;
  sub: string;
  icon: React.ReactNode;
  accent: 'rose' | 'amber';
}) {
  const color = accent === 'rose' ? '#fb7185' : '#fbbf24';
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center mb-2 sm:mb-3"
        style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
      >
        {icon}
      </div>
      <div className="text-[11px] sm:text-[12px] font-medium text-stone-100">{label}</div>
      <div className="text-[10px] sm:text-[10.5px] text-stone-500 mb-2 sm:mb-3">{sub}</div>
      <div className="flex items-end gap-[2px] sm:gap-[3px] h-8 sm:h-12">
        {Array.from({ length: 10 }).map((_, i) => (
          <span
            key={i}
            className="w-[2px] sm:w-[3px] rounded-full wave-bar"
            style={{
              height: `${20 + ((i * 11) % 70)}%`,
              background: `linear-gradient(180deg, ${color}, ${color}55)`,
              animationDelay: `${(i * 0.06).toFixed(2)}s`,
              animationDuration: `${(0.6 + ((i * 5) % 8) / 10).toFixed(2)}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function DemoStat({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between bg-stone-50/[0.03] border border-stone-50/10 rounded-lg sm:rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2">
      <span className="text-stone-500 uppercase tracking-wider text-[9px] sm:text-[10px]">{k}</span>
      <span className="text-stone-100 font-medium tabular-nums">{v}</span>
    </div>
  );
}
