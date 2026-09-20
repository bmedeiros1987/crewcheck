import React from 'react';
import {MinimalHome} from './MinimalHome';

/**
 * Fronteira de erro do app da TV.
 *
 * Sem isto, qualquer excecao durante o render desmonta a arvore do React e a
 * TV fica preta, sem mensagem e sem saida. Componente de classe porque e a
 * unica forma de capturar erro de render no React; roda igual no Chromium 53
 * depois do esbuild.
 */

export type ErrorBoundaryProps = {
  children: React.ReactNode;
  /** Recebe so um codigo normalizado, nunca a mensagem crua do erro. */
  onError?: (code: string) => void;
  onReset?: () => void;
};

type ErrorBoundaryState = { failed: boolean; code: string | null };

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {failed: false, code: null};
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return {failed: true, code: 'UI-RENDER'};
  }

  componentDidCatch(error: unknown) {
    // A mensagem do erro nunca vai para a tela nem para o armazenamento:
    // so o codigo. Isso evita vazar URL com credencial numa stack.
    try {
      this.props.onError?.('UI-RENDER');
    } catch { /* diagnostico nunca pode derrubar a fronteira */ }
    if (typeof console !== 'undefined' && console.error) {
      console.error('[tv] erro de render capturado pela fronteira', (error as Error)?.name || 'Error');
    }
  }

  private reset = () => {
    this.setState({failed: false, code: null});
    try {
      this.props.onReset?.();
    } catch { /* ignorado */ }
  };

  render() {
    if (!this.state.failed) return this.props.children as React.ReactElement;
    return (
      <MinimalHome
        reason="Tive um problema para desenhar a tela completa. O essencial continua aqui."
        diagnosticCode={this.state.code}
        onRetry={this.reset}
        retryLabel="Tentar de novo"
      />
    );
  }
}

export default ErrorBoundary;
