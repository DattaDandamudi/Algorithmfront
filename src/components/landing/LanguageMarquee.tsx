import { useMemo } from 'react';
import { Globe } from 'lucide-react';
import { useScrollReveal } from './scroll';

const LANGUAGES: { name: string; phrase: string }[] = [
  { name: 'English', phrase: 'Welcome' },
  { name: 'Spanish', phrase: 'Bienvenido' },
  { name: 'Mandarin', phrase: '欢迎光临' },
  { name: 'Hindi', phrase: 'स्वागत है' },
  { name: 'Arabic', phrase: 'أهلاً وسهلاً' },
  { name: 'French', phrase: 'Bienvenue' },
  { name: 'Bengali', phrase: 'স্বাগতম' },
  { name: 'Portuguese', phrase: 'Bem-vindo' },
  { name: 'Russian', phrase: 'Добро пожаловать' },
  { name: 'Japanese', phrase: 'いらっしゃいませ' },
  { name: 'German', phrase: 'Willkommen' },
  { name: 'Korean', phrase: '환영합니다' },
  { name: 'Italian', phrase: 'Benvenuto' },
  { name: 'Turkish', phrase: 'Hoş geldiniz' },
  { name: 'Vietnamese', phrase: 'Chào mừng' },
  { name: 'Polish', phrase: 'Witamy' },
  { name: 'Ukrainian', phrase: 'Ласкаво просимо' },
  { name: 'Persian', phrase: 'خوش آمدید' },
  { name: 'Romanian', phrase: 'Bun venit' },
  { name: 'Dutch', phrase: 'Welkom' },
  { name: 'Greek', phrase: 'Καλώς ήρθατε' },
  { name: 'Czech', phrase: 'Vítejte' },
  { name: 'Swedish', phrase: 'Välkommen' },
  { name: 'Hungarian', phrase: 'Üdvözöljük' },
  { name: 'Hebrew', phrase: 'ברוכים הבאים' },
  { name: 'Thai', phrase: 'ยินดีต้อนรับ' },
  { name: 'Indonesian', phrase: 'Selamat datang' },
  { name: 'Malay', phrase: 'Selamat datang' },
  { name: 'Filipino', phrase: 'Maligayang pagdating' },
  { name: 'Telugu', phrase: 'స్వాగతం' },
  { name: 'Tamil', phrase: 'வணக்கம்' },
  { name: 'Marathi', phrase: 'स्वागत आहे' },
  { name: 'Gujarati', phrase: 'સ્વાગત છે' },
  { name: 'Punjabi', phrase: 'ਜੀ ਆਇਆਂ ਨੂੰ' },
  { name: 'Kannada', phrase: 'ಸ್ವಾಗತ' },
  { name: 'Malayalam', phrase: 'സ്വാഗതം' },
  { name: 'Urdu', phrase: 'خوش آمدید' },
  { name: 'Nepali', phrase: 'स्वागत छ' },
  { name: 'Sinhala', phrase: 'ආයුබෝවන්' },
  { name: 'Burmese', phrase: 'ကြိုဆိုပါသည်' },
  { name: 'Khmer', phrase: 'សូមស្វាគមន៍' },
  { name: 'Lao', phrase: 'ຍິນດີຕ້ອນຮັບ' },
  { name: 'Mongolian', phrase: 'Тавтай морил' },
  { name: 'Georgian', phrase: 'მოგესალმებით' },
  { name: 'Armenian', phrase: 'Բարի գdelays' },
  { name: 'Azerbaijani', phrase: 'Xoş gəlmisiniz' },
  { name: 'Kazakh', phrase: 'Қош келдіңіз' },
  { name: 'Uzbek', phrase: 'Xush kelibsiz' },
  { name: 'Belarusian', phrase: 'Сардэчна запрашаем' },
  { name: 'Bulgarian', phrase: 'Добре дошли' },
  { name: 'Croatian', phrase: 'Dobro došli' },
  { name: 'Danish', phrase: 'Velkommen' },
  { name: 'Estonian', phrase: 'Tere tulemast' },
  { name: 'Finnish', phrase: 'Tervetuloa' },
  { name: 'Icelandic', phrase: 'Velkomin' },
  { name: 'Latvian', phrase: 'Laipni lūdzam' },
  { name: 'Lithuanian', phrase: 'Sveiki atvykę' },
  { name: 'Macedonian', phrase: 'Добредојдовте' },
  { name: 'Maltese', phrase: 'Merħba' },
  { name: 'Norwegian', phrase: 'Velkommen' },
  { name: 'Serbian', phrase: 'Добродошли' },
  { name: 'Slovak', phrase: 'Vitajte' },
  { name: 'Slovenian', phrase: 'Dobrodošli' },
  { name: 'Albanian', phrase: 'Mirë se erdhët' },
  { name: 'Catalan', phrase: 'Benvingut' },
  { name: 'Galician', phrase: 'Benvido' },
  { name: 'Basque', phrase: 'Ongi etorri' },
  { name: 'Welsh', phrase: 'Croeso' },
  { name: 'Irish', phrase: 'Fáilte' },
  { name: 'Swahili', phrase: 'Karibu' },
  { name: 'Yoruba', phrase: 'Ẹ ku abọ' },
  { name: 'Zulu', phrase: 'Sawubona' },
  { name: 'Amharic', phrase: 'እንኳን ደህና መጡ' },
  { name: 'Hausa', phrase: 'Barka da zuwa' },
  { name: 'Somali', phrase: 'Soo dhowow' },
  { name: 'Pashto', phrase: 'ښه راغلاست' },
  { name: 'Kurdish', phrase: 'Bi xêr hatî' },
  { name: 'Sindhi', phrase: 'ڀلي ڪري آيا' },
  { name: 'Tatar', phrase: 'Рәхим итегез' },
  { name: 'Uyghur', phrase: 'خۇش كەپسىز' },
  { name: 'Wolof', phrase: 'Dalal ak diam' },
  { name: 'Cebuano', phrase: 'Maayong pag-abot' },
  { name: 'Haitian Creole', phrase: 'Byenveni' },
];

export const SUPPORTED_LANGUAGES = LANGUAGES;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function LanguageMarquee() {
  const isMobile = useMemo(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
    []
  );

  const displayLangs = useMemo(
    () => isMobile ? LANGUAGES.slice(0, 30) : LANGUAGES,
    [isMobile]
  );

  const rows = useMemo(
    () => chunk(displayLangs, Math.ceil(displayLangs.length / (isMobile ? 2 : 3))),
    [displayLangs, isMobile]
  );

  const headerRef = useScrollReveal<HTMLDivElement>();

  return (
    <section className="relative text-stone-50 py-16 sm:py-28 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-stone-50/10 to-transparent" />

      <div ref={headerRef} className="scroll-reveal max-w-7xl mx-auto px-5 sm:px-10 mb-10 sm:mb-14">
        <div className="flex items-end justify-between gap-4 sm:gap-6 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 bg-stone-50/[0.05] border border-stone-50/10 rounded-full px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-stone-300 backdrop-blur">
              <Globe className="w-3 h-3 text-amber-300" />
              {LANGUAGES.length} languages and counting
            </div>
            <h2 className="mt-4 sm:mt-5 text-[28px] sm:text-[42px] lg:text-[52px] font-semibold tracking-[-0.025em] leading-[1.08] sm:leading-[1.04] max-w-2xl">
              Speak to <span className="text-shimmer animate-gradient-shift">every guest</span>,
              <br className="hidden sm:block" />
              <span className="sm:hidden"> </span>
              in the language they call you in.
            </h2>
          </div>
          <p className="text-[13px] sm:text-[14px] text-stone-400 max-w-md leading-[1.7]">
            From neighborhood diners to fine dining destinations — Algoritm picks up the dialect,
            accent, and intent of every caller in real time.
          </p>
        </div>
      </div>

      <div className="space-y-3 sm:space-y-4 marquee-mask">
        {rows.map((row, idx) => (
          <div
            key={idx}
            className={`flex gap-2.5 sm:gap-3 whitespace-nowrap ${idx % 2 === 0 ? 'animate-marquee' : 'animate-marquee-reverse'}`}
            style={{ animationDuration: `${60 + idx * 12}s` }}
          >
            {[...row, ...row].map((lang, i) => (
              <LanguagePill key={`${lang.name}-${i}`} name={lang.name} phrase={lang.phrase} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function LanguagePill({ name, phrase }: { name: string; phrase: string }) {
  return (
    <div className="group relative shrink-0 flex items-center gap-2.5 sm:gap-3 bg-stone-50/[0.04] hover:bg-stone-50/[0.08] border border-stone-50/10 hover:border-amber-300/40 rounded-xl sm:rounded-2xl pl-2.5 sm:pl-3 pr-4 sm:pr-5 py-2.5 sm:py-3 transition-colors duration-300">
      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-400/30 to-rose-400/20 border border-amber-300/30 flex items-center justify-center text-[10px] sm:text-[11px] font-semibold text-amber-100">
        {name.slice(0, 2).toUpperCase()}
      </div>
      <div>
        <div className="text-[12px] sm:text-[13px] font-medium text-stone-100 leading-none">{name}</div>
        <div className="text-[11px] sm:text-[12px] text-stone-400 mt-0.5 sm:mt-1 leading-none">{phrase}</div>
      </div>
    </div>
  );
}
