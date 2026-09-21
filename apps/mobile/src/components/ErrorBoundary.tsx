import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from './ErrorScreen';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Class component because React's error-boundary API
// (getDerivedStateFromError/componentDidCatch) only exists on class
// components - there's no hook equivalent. Meant to wrap this app's true
// root (see index.js's registerRootComponent(App) and App.tsx's exported
// `App`) so an otherwise-uncaught render error anywhere in the tree shows
// ErrorScreen instead of leaving a blank/crashed screen. There's no remote
// error-reporting service wired up anywhere in this app (confirmed via grep
// for Sentry/Bugsnag/Crashlytics) so this only logs locally via
// console.error - wiring one up is out of scope here.
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught a render error:', error, errorInfo);
  }

  // Resets the boundary's own state so React attempts to render the tree
  // again. This doesn't fix whatever caused the original error - it just
  // avoids a permanent blank/crashed screen for what may be a transient
  // render error.
  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  override render() {
    if (this.state.hasError) {
      return <ErrorScreen onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
