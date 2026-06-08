import { useMemo } from 'react';

const WAVE_COUNT_MOBILE = 14;
const WAVE_COUNT_DESKTOP = 28;

export default function VoiceOrb3D() {
  const waveCount = useMemo(
    () => (typeof window !== 'undefined' && window.innerWidth < 768 ? WAVE_COUNT_MOBILE : WAVE_COUNT_DESKTOP),
    []
  );

  return (
    <div className="relative w-[280px] h-[280px] sm:w-[420px] sm:h-[420px] lg:w-[520px] lg:h-[520px] mx-auto">
      <div className="absolute inset-[-10%] rounded-full bg-gradient-to-br from-amber-500/25 via-rose-500/10 to-transparent blur-2xl sm:blur-3xl animate-ring-pulse" />

      <div className="absolute inset-[-4%] rounded-full border border-amber-400/15 animate-orb-spin-slow" />
      <div className="absolute inset-[6%] rounded-full border border-amber-400/20 animate-orb-spin-med" />
      <div className="hidden sm:block absolute inset-[16%] rounded-full border border-cyan-400/15 animate-orb-spin-fast" />

      <div className="absolute inset-[18%] rounded-full orb-conic-gradient">
        <div className="w-full h-full rounded-full animate-orb-spin-slow" />
      </div>

      <div
        className="absolute inset-[22%] rounded-full overflow-hidden"
        style={{
          background:
            'radial-gradient(circle at 35% 30%, #fde68a 0%, #f59e0b 22%, #ea580c 48%, #9a3412 78%, #1c1917 100%)',
          boxShadow:
            'inset 0 -40px 80px rgba(0,0,0,0.55), inset 20px 30px 60px rgba(255, 230, 180, 0.35), 0 30px 80px rgba(234,88,12,0.35)',
        }}
      >
        <div
          className="absolute inset-0 animate-orb-spin-slow"
          style={{
            background:
              'radial-gradient(ellipse at 25% 20%, rgba(255,255,255,0.5), transparent 35%), radial-gradient(ellipse at 70% 80%, rgba(0,0,0,0.4), transparent 50%)',
          }}
        />
        <div
          className="absolute inset-0 animate-orb-spin-med opacity-50 hidden sm:block"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, transparent 40%, rgba(34,211,238,0.25) 60%, transparent 80%)',
          }}
        />
        <div
          className="absolute -inset-[10%] animate-orb-spin-fast opacity-40 mix-blend-screen hidden sm:block"
          style={{
            background:
              'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.3), transparent 30%)',
          }}
        />
      </div>

      <div className="absolute inset-[28%] rounded-full bg-gradient-to-br from-white/40 via-white/10 to-transparent blur-md pointer-events-none" />

      <div className="absolute inset-0 flex items-end justify-center pb-4 sm:pb-8 pointer-events-none">
        <div className="flex items-end gap-[2px] sm:gap-1 h-8 sm:h-12 opacity-80">
          {Array.from({ length: waveCount }).map((_, i) => (
            <span
              key={i}
              className="w-[2px] sm:w-[3px] rounded-full bg-gradient-to-t from-amber-400 to-rose-300 wave-bar"
              style={{
                height: `${20 + ((i * 13) % 60)}%`,
                animationDelay: `${(i * 0.07).toFixed(2)}s`,
                animationDuration: `${(0.7 + ((i * 7) % 10) / 10).toFixed(2)}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
