import { useEffect, useRef, useState } from 'react';

export function useScrollReveal<T extends HTMLElement>(threshold = 0.12) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

export function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    function update() {
      raf = 0;
      setY(window.scrollY);
    }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return y;
}

export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    function update() {
      const h = document.documentElement;
      const max = Math.max(1, h.scrollHeight - window.innerHeight);
      setProgress(window.scrollY / max);
    }
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  return progress;
}

export function useTilt<T extends HTMLElement>(strength = 0.05) {
  const ref = useRef<T | null>(null);

  function onMouseMove(e: React.MouseEvent<T>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--spot-x', `${x}%`);
    el.style.setProperty('--spot-y', `${y}%`);
    const rx = (y - 50) * -strength;
    const ry = (x - 50) * strength;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  }
  return { ref, onMouseMove, onMouseLeave };
}

export function useMagnetic<T extends HTMLElement>(strength = 0.35) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    function onMove(e: MouseEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const distance = Math.hypot(dx, dy);
      const radius = Math.max(rect.width, rect.height) * 1.6;
      if (distance < radius) {
        const factor = (1 - distance / radius) * strength;
        targetX = dx * factor;
        targetY = dy * factor;
      } else {
        targetX = 0;
        targetY = 0;
      }
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function onLeave() {
      targetX = 0;
      targetY = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    }
    function loop() {
      raf = 0;
      currentX += (targetX - currentX) * 0.18;
      currentY += (targetY - currentY) * 0.18;
      if (el) {
        el.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
      }
      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        raf = requestAnimationFrame(loop);
      }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength]);

  return ref;
}

export function useElementProgress<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;

    function update() {
      raf = 0;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const total = rect.height + vh;
      const passed = vh - rect.top;
      const p = Math.min(1, Math.max(0, passed / total));
      setProgress(p);
    }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return { ref, progress };
}

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

export function useCursor() {
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => {
    let raf = 0;
    function onMove(e: MouseEvent) {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setCursor({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
      });
    }
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return cursor;
}
