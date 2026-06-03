import { Mic, MicOff } from 'lucide-react';

interface VoiceOrbProps {
  isSpeaking: boolean;
  onToggle: () => void;
}

function OrbRings({ isSpeaking }: { isSpeaking: boolean }) {
  return (
    <svg
      viewBox="0 0 300 300"
      className="absolute inset-0 w-full h-full"
      fill="none"
    >
      <g className="orb-ring-rotate" style={{ transformOrigin: '150px 150px' }}>
        <circle
          cx="150" cy="150" r="130"
          stroke="rgba(251, 191, 36, 0.12)"
          strokeWidth="0.5"
          strokeDasharray="4 8"
        />
      </g>
      <g className="orb-ring-rotate-reverse" style={{ transformOrigin: '150px 150px' }}>
        <circle
          cx="150" cy="150" r="142"
          stroke="rgba(248, 113, 113, 0.08)"
          strokeWidth="0.5"
          strokeDasharray="2 12"
        />
      </g>
      {isSpeaking && (
        <g className="orb-ring-rotate" style={{ transformOrigin: '150px 150px' }}>
          <circle
            cx="150" cy="150" r="120"
            stroke="rgba(251, 191, 36, 0.15)"
            strokeWidth="0.8"
            strokeDasharray="8 16"
          />
        </g>
      )}
    </svg>
  );
}

export default function VoiceOrb({ isSpeaking, onToggle }: VoiceOrbProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-amber-100/20 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 left-1/4 w-72 h-72 bg-rose-100/15 rounded-full blur-[80px]" />
      </div>

      <div className="relative mb-8 orb-float">
        <div className="relative w-72 h-72 flex items-center justify-center">
          <OrbRings isSpeaking={isSpeaking} />

          <div
            className={`orb-glow absolute rounded-full transition-all duration-700 ${
              isSpeaking ? 'orb-glow-active' : ''
            }`}
            style={{ inset: '10%' }}
          />

          <div
            className={`relative w-44 h-44 rounded-full flex items-center justify-center orb-gradient transition-all duration-700 cursor-pointer ${
              isSpeaking ? 'scale-110 orb-pulse' : 'hover:scale-105'
            }`}
            onClick={onToggle}
          >
            <svg
              viewBox="0 0 200 200"
              className={`w-20 h-20 transition-opacity duration-500 ${isSpeaking ? 'opacity-80' : 'opacity-50'}`}
              fill="none"
              stroke="white"
              strokeWidth="0.8"
            >
              <circle cx="100" cy="100" r="45" />
              <circle cx="100" cy="100" r="30" opacity="0.6" />
              {[0, 60, 120, 180, 240, 300].map((angle) => {
                const rad = (angle * Math.PI) / 180;
                const x = 100 + 45 * Math.cos(rad);
                const y = 100 + 45 * Math.sin(rad);
                return <circle key={angle} cx={x} cy={y} r="3" fill="white" fillOpacity="0.4" stroke="none" />;
              })}
            </svg>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        className={`group flex items-center gap-2.5 px-6 py-2.5 rounded-full text-[13px] font-medium transition-all duration-500 ${
          isSpeaking
            ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-lg shadow-rose-500/20'
            : 'bg-stone-900 text-white hover:bg-stone-800 hover:shadow-lg hover:shadow-stone-900/15'
        }`}
      >
        {isSpeaking ? (
          <MicOff className="w-3.5 h-3.5" />
        ) : (
          <Mic className="w-3.5 h-3.5 transition-transform duration-300 group-hover:scale-110" />
        )}
        {isSpeaking ? 'End Session' : 'Start Speaking'}
      </button>

      <p className="mt-3 text-[11px] text-stone-400 tracking-wide">
        {isSpeaking ? 'Listening...' : 'Tap the orb or button to begin'}
      </p>
    </div>
  );
}
