import { cn } from '@/lib/utils';

const PHONE_NUMBER = '254716522948';
const DEFAULT_MESSAGE = "Hi! I'm interested in Fundi POS for my business.";

// Plain server component - a wa.me link needs no client-side state, so no
// 'use client' directive (matches logo-mark.tsx's convention: inline SVG,
// no interactivity). lucide-react has no WhatsApp brand glyph, hence the
// inline SVG rather than an icon import.
export function WhatsAppButton({ message = DEFAULT_MESSAGE, className }: { message?: string; className?: string }) {
  const href = `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={cn(
        'fixed right-5 bottom-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-xl transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#25D366]',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" fill="currentColor" aria-hidden className="size-7">
        <path d="M16.004 2.667c-7.363 0-13.333 5.97-13.333 13.333 0 2.351.615 4.646 1.782 6.667L2.667 29.333l6.836-1.793a13.29 13.29 0 0 0 6.5 1.727h.006c7.363 0 13.333-5.97 13.333-13.333 0-3.56-1.386-6.907-3.903-9.424a13.24 13.24 0 0 0-9.435-3.843Zm0 24.4h-.005a11.08 11.08 0 0 1-5.646-1.546l-.405-.24-4.057 1.064 1.083-3.955-.264-.406a11.05 11.05 0 0 1-1.694-5.884c0-6.122 4.983-11.104 11.11-11.104a11.04 11.04 0 0 1 7.86 3.257 11.04 11.04 0 0 1 3.25 7.856c-.003 6.123-4.986 11.958-11.232 11.958Zm6.098-8.316c-.334-.167-1.98-.977-2.287-1.088-.307-.111-.53-.167-.753.167-.223.334-.865 1.088-1.06 1.311-.195.223-.39.25-.723.083-.334-.167-1.409-.52-2.684-1.657-.992-.885-1.662-1.978-1.856-2.312-.195-.334-.02-.514.146-.68.15-.15.334-.39.5-.585.167-.195.223-.334.334-.557.111-.223.056-.418-.028-.585-.084-.167-.753-1.815-1.032-2.486-.272-.653-.548-.565-.753-.576a14.4 14.4 0 0 0-.641-.012.923.923 0 0 0-.669.223c-.223.223-.865.845-.865 2.062 0 1.216.886 2.39 1.008 2.556.125.167 1.744 2.663 4.226 3.734.59.255 1.05.407 1.409.52.592.188 1.13.161 1.556.098.475-.07 1.464-.598 1.67-1.176.204-.578.204-1.073.14-1.176-.06-.104-.223-.167-.446-.278Z" />
      </svg>
    </a>
  );
}
