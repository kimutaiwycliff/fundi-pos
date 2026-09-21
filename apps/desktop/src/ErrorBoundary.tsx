import { Component, type ErrorInfo, type ReactNode } from "react";
import { WrenchIcon } from "./icons";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// Catches uncaught render-time crashes anywhere below it - React's error
// boundary API only works as a class component, there's no hook
// equivalent. Deliberately separate from Toast.tsx's error toasts: a toast
// is for a recoverable, transient failure (a failed API call, a rejected
// promise) that the rest of the app carries on through just fine. Landing
// here means React itself gave up mid-render, so local state can't be
// trusted anymore either - a full reload is the simplest reliable way back
// for a Tauri WebView, there's no in-app state worth preserving through a
// genuine render crash.
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="login-shell">
        <div className="login-card">
          <div className="login-brand">
            <span className="brand-mark">
              <WrenchIcon />
            </span>
            <div className="login-brand-text">
              <h1>Something went wrong</h1>
              <p>The till hit an unexpected error and needs to restart.</p>
            </div>
          </div>
          <p className="error-banner">{this.state.error.message}</p>
          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </main>
    );
  }
}
