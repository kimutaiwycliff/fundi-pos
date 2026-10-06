'use client';

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { photoSrcSet, type StorefrontPhoto } from './storefront-data';

// Product page photo gallery.
//   Phones: swipeable scroll-snap carousel (next photo peeks in), "2 / 5"
//     counter and a thumbnail strip underneath.
//   md+: main photo with a vertical thumbnail rail, prev/next buttons,
//     ←/→ keys and a hover magnifier that loads the large size.
//   Tap/click a photo: full-screen lightbox with swipe, pinch / double-tap
//   zoom and panning (pointer events + CSS transforms - no library).
// Layout reserves space from the photo's width/height (4:5 well, cover),
// so nothing shifts while images load.

const MAIN_SIZES = '(min-width: 1152px) 560px, (min-width: 768px) 50vw, 88vw';

function photoAlt(photo: StorefrontPhoto, name: string, i: number, n: number): string {
  return photo.alt?.trim() || (n > 1 ? `${name} – photo ${i + 1} of ${n}` : name);
}

function reducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ChevronIcon({ dir, className }: { dir: 'left' | 'right'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path d={dir === 'left' ? 'M15 5 8 12l7 7' : 'm9 5 7 7-7 7'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ExpandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-5', className)} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

const OVERLAY_BUTTON =
  'flex size-11 items-center justify-center rounded-full bg-(--sf-surface)/90 text-(--sf-ink) shadow-sm backdrop-blur transition-opacity hover:bg-(--sf-surface) focus-visible:outline-2 focus-visible:outline-(--sf-ink) disabled:pointer-events-none disabled:opacity-0';

export function ProductGallery({
  photos,
  name,
  dimmed,
  badge,
  placeholder,
}: {
  photos: StorefrontPhoto[];
  name: string;
  dimmed?: boolean;
  badge?: ReactNode;
  placeholder: ReactNode;
}) {
  const count = photos.length;
  const [index, setIndex] = useState(0);
  const [magnify, setMagnify] = useState<{ x: number; y: number } | null>(null);
  const [lightbox, setLightbox] = useState<{ start: number; host: Element } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Keep the active thumbnail visible inside its strip/rail (without
  // scrollIntoView, which would also scroll the page).
  useEffect(() => {
    const rail = railRef.current;
    const thumb = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !thumb) return;
    const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth';
    if (rail.scrollHeight > rail.clientHeight + 1) {
      rail.scrollTo({ top: thumb.offsetTop - (rail.clientHeight - thumb.offsetHeight) / 2, behavior });
    } else if (rail.scrollWidth > rail.clientWidth + 1) {
      rail.scrollTo({ left: thumb.offsetLeft - (rail.clientWidth - thumb.offsetWidth) / 2, behavior });
    }
  }, [index]);

  function go(i: number, smooth = true) {
    const next = Math.max(0, Math.min(count - 1, i));
    const track = trackRef.current;
    const slide = track?.children[next] as HTMLElement | undefined;
    setIndex(next);
    setMagnify(null);
    if (track && slide) track.scrollTo({ left: slide.offsetLeft, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' });
  }

  // Swipes / trackpad scrolls update the active photo.
  function onScroll() {
    const track = trackRef.current;
    if (!track || count < 2) return;
    const first = track.children[0] as HTMLElement;
    const second = track.children[1] as HTMLElement;
    const step = second.offsetLeft - first.offsetLeft || first.offsetWidth;
    const max = track.scrollWidth - track.clientWidth;
    const i = track.scrollLeft >= max - 2 ? count - 1 : Math.round(track.scrollLeft / step);
    setIndex(Math.max(0, Math.min(count - 1, i)));
  }

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      go(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      go(index - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open(index);
    }
  }

  // Hover magnifier: mouse on a wide screen only (touch gets the lightbox).
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType !== 'mouse' || !window.matchMedia('(min-width: 768px)').matches) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setMagnify({ x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 });
  }

  function open(start: number) {
    // Portalled into the shop root (not document.body) so the .sf-root
    // palette and typeface still apply, while escaping the sticky column's
    // stacking context.
    const host = trackRef.current?.closest('.sf-root') ?? document.body;
    setMagnify(null);
    setLightbox({ start, host });
  }

  if (count === 0) {
    return (
      <div className="relative -mx-4 aspect-[4/5] overflow-hidden bg-(--sf-shell) sm:mx-0 sm:rounded-3xl">
        {placeholder}
        {badge}
      </div>
    );
  }

  const multi = count > 1;

  return (
    <div className={cn('flex min-w-0 flex-col gap-3', multi && 'md:grid md:grid-cols-[4.5rem_minmax(0,1fr)] md:gap-3 lg:grid-cols-[5rem_minmax(0,1fr)]')}>
      <div className="relative -mx-4 sm:mx-0 md:col-start-2 md:row-start-1">
        <div
          ref={trackRef}
          role="region"
          aria-roledescription="carousel"
          aria-label={`${name} photos`}
          tabIndex={0}
          onScroll={onScroll}
          onKeyDown={onKeyDown}
          className="relative flex snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-(--sf-ink) sm:gap-2 md:gap-0 md:rounded-3xl [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((photo, i) => {
            const active = i === index;
            const zoomed = active && magnify !== null;
            return (
              <div
                key={photo.url}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${count}`}
                onClick={() => open(i)}
                onPointerMove={active ? onPointerMove : undefined}
                onPointerLeave={() => setMagnify(null)}
                className={cn(
                  'relative aspect-[4/5] shrink-0 snap-start overflow-hidden bg-(--sf-shell) md:w-full md:cursor-zoom-in sm:rounded-2xl md:rounded-3xl',
                  multi ? 'w-[88%]' : 'w-full',
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.card}
                  srcSet={photoSrcSet(photo)}
                  sizes={MAIN_SIZES}
                  width={photo.width ?? undefined}
                  height={photo.height ?? undefined}
                  alt={photoAlt(photo, name, i, count)}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  fetchPriority={i === 0 ? 'high' : undefined}
                  decoding="async"
                  draggable={false}
                  className={cn('h-full w-full object-cover select-none', dimmed && 'opacity-70')}
                  style={zoomed ? { transform: 'scale(2.2)', transformOrigin: `${magnify.x}% ${magnify.y}%` } : undefined}
                />
                {zoomed ? (
                  // The large file on top once it has loaded - sharp detail.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.large}
                    alt=""
                    aria-hidden
                    decoding="async"
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover select-none"
                    style={{ transform: 'scale(2.2)', transformOrigin: `${magnify.x}% ${magnify.y}%` }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {badge}
        {multi ? (
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-(--sf-surface)/90 px-2.5 py-1 text-xs font-medium tabular-nums shadow-sm backdrop-blur">
            {index + 1} / {count}
          </span>
        ) : null}
        <button type="button" onClick={() => open(index)} aria-label="View photos full screen" className={cn(OVERLAY_BUTTON, 'absolute top-3 right-3 hidden md:flex', magnify && 'opacity-0')}>
          <ExpandIcon />
        </button>
        {multi ? (
          <>
            <button
              type="button"
              onClick={() => go(index - 1)}
              disabled={index === 0}
              aria-label="Previous photo"
              className={cn(OVERLAY_BUTTON, 'absolute top-1/2 left-3 hidden -translate-y-1/2 md:flex', magnify && 'opacity-0')}
            >
              <ChevronIcon dir="left" />
            </button>
            <button
              type="button"
              onClick={() => go(index + 1)}
              disabled={index === count - 1}
              aria-label="Next photo"
              className={cn(OVERLAY_BUTTON, 'absolute top-1/2 right-3 hidden -translate-y-1/2 md:flex', magnify && 'opacity-0')}
            >
              <ChevronIcon dir="right" />
            </button>
          </>
        ) : null}
      </div>

      {multi ? (
        <div className="relative md:col-start-1 md:row-start-1">
          <div
            ref={railRef}
            className="relative flex gap-2 overflow-x-auto [scrollbar-width:none] md:absolute md:inset-0 md:flex-col md:overflow-x-hidden md:overflow-y-auto [&::-webkit-scrollbar]:hidden"
          >
            {photos.map((photo, i) => (
              <Thumb
                key={photo.url}
                photo={photo}
                active={i === index}
                label={`Show photo ${i + 1} of ${count}`}
                onClick={() => go(i)}
                onHover={() => go(i, false)}
                className="w-14 sm:w-16 md:w-full"
              />
            ))}
          </div>
        </div>
      ) : null}

      {lightbox
        ? createPortal(
            <Lightbox
              photos={photos}
              name={name}
              start={lightbox.start}
              onClose={(last) => {
                setLightbox(null);
                go(last, false);
              }}
            />,
            lightbox.host,
          )
        : null}
    </div>
  );
}

function Thumb({
  photo,
  active,
  label,
  onClick,
  onHover,
  className,
}: {
  photo: StorefrontPhoto;
  active: boolean;
  label: string;
  onClick: () => void;
  onHover?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={(e) => {
        if (onHover && e.pointerType === 'mouse' && !active) onHover();
      }}
      aria-label={label}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'relative aspect-[4/5] shrink-0 overflow-hidden rounded-xl bg-(--sf-shell) transition-opacity focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--sf-ink)',
        active ? 'opacity-100' : 'opacity-60 hover:opacity-100',
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.thumb} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover select-none" />
      <span aria-hidden className={cn('absolute inset-0 rounded-xl border-2', active ? 'border-(--sf-ink)' : 'border-transparent')} />
    </button>
  );
}

// ---------------------------------------------------------------- lightbox

interface View {
  s: number;
  x: number;
  y: number;
}

const MAX_ZOOM = 4;
const STEP_ZOOM = 2.5;
const IDENTITY: View = { s: 1, x: 0, y: 0 };

type Gesture =
  | { mode: 'none' }
  | { mode: 'swipe'; startX: number; startY: number; moved: boolean }
  | { mode: 'pan'; startX: number; startY: number; from: View; moved: boolean }
  | { mode: 'pinch'; dist: number; mid: { x: number; y: number }; from: View };

function Lightbox({ photos, name, start, onClose }: { photos: StorefrontPhoto[]; name: string; start: number; onClose: (index: number) => void }) {
  const count = photos.length;
  const [index, setIndex] = useState(start);
  const [view, setViewState] = useState<View>(IDENTITY);
  const [drag, setDrag] = useState(0);
  const [touching, setTouching] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const viewRef = useRef<View>(IDENTITY);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture>({ mode: 'none' });
  const lastTap = useRef<{ t: number; x: number; y: number } | null>(null);
  const indexRef = useRef(start);
  const onCloseRef = useRef(onClose);
  const [animate] = useState(() => !reducedMotion());

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  function setView(v: View) {
    viewRef.current = v;
    setViewState(v);
  }

  function goTo(i: number) {
    const next = Math.max(0, Math.min(count - 1, i));
    indexRef.current = next;
    setIndex(next);
    setView(IDENTITY);
    setDrag(0);
  }

  // Stage-centred coordinates (the zoom transform's origin is the centre).
  function local(clientX: number, clientY: number) {
    const rect = stageRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left - rect.width / 2, y: clientY - rect.top - rect.height / 2 };
  }

  // Keep the zoomed photo covering the stage: no panning past its edges.
  function clamp(v: View): View {
    const stage = stageRef.current;
    if (!stage || v.s <= 1) return { s: Math.max(1, v.s), x: 0, y: 0 };
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const img = stage.querySelector<HTMLImageElement>('[data-current] img');
    let dw = w;
    let dh = h;
    if (img?.naturalWidth && img.naturalHeight) {
      const fit = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      dw = img.naturalWidth * fit;
      dh = img.naturalHeight * fit;
    }
    const mx = Math.max(0, (dw * v.s - w) / 2);
    const my = Math.max(0, (dh * v.s - h) / 2);
    return { s: v.s, x: Math.max(-mx, Math.min(mx, v.x)), y: Math.max(-my, Math.min(my, v.y)) };
  }

  // Zoom to `s` keeping the photo point under `at` (stage coords) still.
  function zoomAt(s: number, at = { x: 0, y: 0 }) {
    const from = viewRef.current;
    const next = Math.max(1, Math.min(MAX_ZOOM, s));
    const qx = (at.x - from.x) / from.s;
    const qy = (at.y - from.y) / from.s;
    setView(clamp({ s: next, x: at.x - next * qx, y: at.y - next * qy }));
  }

  // Esc / arrows / +/- keys, focus trap, body scroll lock, focus restore.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.({ preventScroll: true });
    };
  }, []);

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCloseRef.current(indexRef.current);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goTo(index - 1);
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoomAt(viewRef.current.s * 1.5);
    } else if (e.key === '-') {
      e.preventDefault();
      zoomAt(viewRef.current.s / 1.5);
    } else if (e.key === 'Tab') {
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])');
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setTouching(true);
    const pts = [...pointers.current.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture.current = {
        mode: 'pinch',
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: local((a.x + b.x) / 2, (a.y + b.y) / 2),
        from: viewRef.current,
      };
      setDrag(0);
    } else if (viewRef.current.s > 1) {
      gesture.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, from: viewRef.current, moved: false };
    } else {
      gesture.current = { mode: 'swipe', startX: e.clientX, startY: e.clientY, moved: false };
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (g.mode === 'pinch') {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const mid = local((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = Math.max(1, Math.min(MAX_ZOOM, (g.from.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist));
      const qx = (g.mid.x - g.from.x) / g.from.s;
      const qy = (g.mid.y - g.from.y) / g.from.s;
      setView(clamp({ s, x: mid.x - s * qx, y: mid.y - s * qy }));
    } else if (g.mode === 'pan') {
      const dx = e.clientX - g.startX;
      const dy = e.clientY - g.startY;
      if (Math.hypot(dx, dy) > 6) g.moved = true;
      setView(clamp({ s: g.from.s, x: g.from.x + dx, y: g.from.y + dy }));
    } else if (g.mode === 'swipe') {
      const dx = e.clientX - g.startX;
      if (Math.abs(dx) > 6) g.moved = true;
      // Rubber-band at the first/last photo.
      const atEdge = (index === 0 && dx > 0) || (index === count - 1 && dx < 0);
      setDrag(atEdge ? dx / 3 : dx);
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    const cancelled = e.type === 'pointercancel';

    if (g.mode === 'pinch') {
      const rest = [...pointers.current.values()][0];
      if (viewRef.current.s < 1.05) setView(IDENTITY);
      // One finger still down: carry on as a pan from here.
      gesture.current = rest ? { mode: 'pan', startX: rest.x, startY: rest.y, from: viewRef.current, moved: true } : { mode: 'none' };
      if (!rest) setTouching(false);
      return;
    }

    gesture.current = { mode: 'none' };
    setTouching(false);
    if (cancelled) {
      setDrag(0);
      return;
    }

    if (g.mode === 'swipe' && g.moved) {
      const dx = e.clientX - g.startX;
      const threshold = Math.min(80, (stageRef.current?.clientWidth ?? 400) * 0.15);
      if (dx < -threshold && index < count - 1) goTo(index + 1);
      else if (dx > threshold && index > 0) goTo(index - 1);
      else setDrag(0);
      return;
    }

    if ((g.mode === 'swipe' || g.mode === 'pan') && !g.moved) {
      // Double tap / double click toggles zoom at that point.
      const now = performance.now();
      const prev = lastTap.current;
      if (prev && now - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 30) {
        lastTap.current = null;
        if (viewRef.current.s > 1) setView(IDENTITY);
        else zoomAt(STEP_ZOOM, local(e.clientX, e.clientY));
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY };
      }
    }
  }

  const zoomed = view.s > 1;
  const transition = animate && !touching;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} - photo ${index + 1} of ${count}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[70] flex flex-col outline-none bg-(--sf-bg) text-(--sf-ink) motion-safe:animate-in motion-safe:fade-in"
    >
      <div className="flex shrink-0 items-center gap-1 py-2 pr-2 pl-4">
        <span className="text-sm tabular-nums" aria-live="polite">
          {index + 1} / {count}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomAt(viewRef.current.s / 1.5)}
            disabled={!zoomed}
            aria-label="Zoom out"
            className="flex size-11 items-center justify-center rounded-full text-xl hover:bg-(--sf-shell) disabled:opacity-30"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => zoomAt(viewRef.current.s * 1.5)}
            disabled={view.s >= MAX_ZOOM}
            aria-label="Zoom in"
            className="flex size-11 items-center justify-center rounded-full text-xl hover:bg-(--sf-shell) disabled:opacity-30"
          >
            +
          </button>
          <button
            ref={closeRef}
            type="button"
            onClick={() => onCloseRef.current(indexRef.current)}
            aria-label="Close photos"
            className="flex size-11 items-center justify-center rounded-full hover:bg-(--sf-shell) focus-visible:outline-2 focus-visible:outline-(--sf-ink)"
          >
            <svg viewBox="0 0 24 24" aria-hidden className="size-6" fill="none" stroke="currentColor" strokeWidth={1.6}>
              <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={cn('relative min-h-0 flex-1 touch-none overflow-hidden select-none', zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${drag}px), 0, 0)`,
            transition: transition ? 'transform 300ms cubic-bezier(.2,.7,.2,1)' : 'none',
          }}
        >
          {photos.map((photo, i) => {
            const current = i === index;
            return (
              <div key={photo.url} data-current={current ? '' : undefined} aria-hidden={!current} className="flex h-full w-full shrink-0 items-center justify-center overflow-hidden">
                {Math.abs(i - index) <= 1 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photo.large}
                    alt={photoAlt(photo, name, i, count)}
                    width={photo.width ?? undefined}
                    height={photo.height ?? undefined}
                    decoding="async"
                    draggable={false}
                    className="h-full w-full object-contain select-none"
                    style={
                      current
                        ? {
                            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.s})`,
                            transition: transition ? 'transform 250ms ease-out' : 'none',
                          }
                        : undefined
                    }
                  />
                ) : null}
              </div>
            );
          })}
        </div>
        {count > 1 ? (
          <>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => goTo(index - 1)}
              disabled={index === 0}
              aria-label="Previous photo"
              className={cn(OVERLAY_BUTTON, 'absolute top-1/2 left-4 hidden -translate-y-1/2 md:flex')}
            >
              <ChevronIcon dir="left" />
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => goTo(index + 1)}
              disabled={index === count - 1}
              aria-label="Next photo"
              className={cn(OVERLAY_BUTTON, 'absolute top-1/2 right-4 hidden -translate-y-1/2 md:flex')}
            >
              <ChevronIcon dir="right" />
            </button>
          </>
        ) : null}
        <p className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <span className="rounded-full bg-(--sf-surface)/90 px-3 py-1 text-xs text-(--sf-muted) shadow-sm backdrop-blur">
            {zoomed ? (
              'Drag to look around'
            ) : (
              <>
                <span className="md:hidden">Double-tap or pinch to zoom</span>
                <span className="hidden md:inline">Double-click or press + to zoom</span>
              </>
            )}
          </span>
        </p>
      </div>

      {count > 1 ? (
        <div className="flex shrink-0 justify-center-safe gap-2 overflow-x-auto px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {photos.map((photo, i) => (
            <Thumb key={photo.url} photo={photo} active={i === index} label={`Show photo ${i + 1} of ${count}`} onClick={() => goTo(i)} className="w-12 sm:w-14 md:w-16" />
          ))}
        </div>
      ) : null}
    </div>
  );
}
