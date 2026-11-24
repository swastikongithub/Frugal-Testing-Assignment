import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { telemetry, logCapped } from '../lib/telemetry';
import { toasts } from '../lib/toastBus';

interface Props {
  symbol: string;
  children: ReactNode;
}

/**
 * Per-row boundary around the order confirmation. If the confirmation cannot
 * be parsed safely, the row shows a fault panel instead of a wrong number, a
 * toast explains it, and the error is logged for monitoring.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[order-integrity] ${error.name}: ${error.message}`, info.componentStack ?? '');
    logCapped(telemetry.boundaryErrors, {
      at: performance.now(),
      symbol: this.props.symbol,
      name: error.name,
      message: error.message,
    });
    toasts.push('Order integrity check failed', `${this.props.symbol}: ${error.message}. The confirmation was not shown.`);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="boundary" data-testid="error-boundary" role="alert">
          <strong>INTEGRITY FAULT</strong> {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}
