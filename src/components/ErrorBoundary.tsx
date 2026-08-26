import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('GalNavi UI error', error.message, info.componentStack); }
  render() {
    if (this.state.error) return <main className="fatal-error"><h1>GalNavi 遇到问题</h1><p>{this.state.error.message}</p><button onClick={() => location.reload()}>重新载入</button></main>;
    return this.props.children;
  }
}
