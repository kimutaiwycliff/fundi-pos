import { WrenchIcon } from "./icons";

interface LoadingScreenProps {
  // Optional context line under the spinner - a caller that knows why it's
  // waiting (e.g. resuming a specific person's session) can say so; falls
  // back to a generic message otherwise.
  message?: string;
}

// Full-screen takeover for the one moment in this app that's actually worth
// blocking the whole screen for: establishing the initial PowerSync
// connection right after a successful login or a cached-PIN resume
// (App.tsx's "connecting" state - see the comment above that check for why
// every other busy moment, like submitting the login form itself or
// switching stores, keeps its existing inline button-label treatment
// instead of this).
export function LoadingScreen({ message = "Setting up your till..." }: LoadingScreenProps) {
  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <span className="brand-mark loading-screen-mark">
        <WrenchIcon />
      </span>
      <div className="loading-screen-spinner" aria-hidden />
      <p className="loading-screen-message">{message}</p>
    </main>
  );
}
