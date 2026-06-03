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

export function useTilt<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  function onMouseMove(e: React.MouseEvent<T>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty('--spot-x', `${x}%`);
    el.style.setProperty('--spot-y', `${y}%`);
    const rx = (y - 50) * -0.05;
    const ry = (x - 50) * 0.05;
    el.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg)`;
  }
  function onMouseLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg)';
  }
  return { ref, onMouseMove, onMouseLeave };
}
