import { Component, type ErrorInfo, type ReactNode } from "react";
import { WrenchIcon } from "./icons";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

interface SectionErrorBoundaryProps {
  // Shown in the fallback: "Something went wrong loading {label}".
  label: string;
  children: ReactNode;
}

// Same idea as ErrorBoundary above (React's error boundary API is
// class-only), but scoped to a single AppShell section pane instead of the
// whole app. The top-level ErrorBoundary's only recovery is a full reload -
// right for a crash React can't attribute to any one part of the tree, but
// severe for a crash that's actually confined to, say, the Products screen:
// this is an online-only app with no session-resume (App.tsx), so a full
// reload silently signs the till out. A crash caught here instead leaves
// the sidebar, the session, and every other already-visited section intact -
// only the broken pane shows an error, with a retry that just re-attempts
// rendering its children (enough to recover from a bad response that's
// since changed; a genuinely broken render will just fail again, same as
// switching tabs away and back would).
export class SectionErrorBoundary extends Component<SectionErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Uncaught render error in ${this.props.label}:`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="pane-empty-state">
        <p className="pane-empty-state-title">Something went wrong loading {this.props.label}</p>
        <p className="pane-empty-state-hint">{this.state.error.message}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
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
