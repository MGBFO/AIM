import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  err: Error | null;
}

/** Catches render errors in a module so one bad module can't blank the app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { err: null };

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  componentDidCatch(err: Error, info: ErrorInfo) {
    console.error('AIM module error:', err, info);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="err-panel">
          <h2>Something failed to load</h2>
          <p style={{ color: 'var(--muted)' }}>
            A module ran into an unexpected problem. Your saved data is preserved.
          </p>
          <button className="btn gold" onClick={() => window.location.reload()}>
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
