'use client';

import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// IntersectionObserver-driven fade/slide-in, not framer-motion - the whole
// effect is a one-shot opacity+transform transition, which plain CSS
// already does well, so it isn't worth the extra dependency weight for a
// marketing page. motion-reduce: variants opt out for anyone who's asked
// their OS to skip non-essential motion.
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        'translate-y-6 opacity-0 transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none',
        visible && 'translate-y-0 opacity-100',
        className,
      )}
      style={{ transitionDelay: visible ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}
