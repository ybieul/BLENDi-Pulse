// apps/mobile/src/components/ui/ErrorBoundary.tsx
//
// Sem isso, um erro de render em qualquer tela derrubava o app inteiro sem
// UI de fallback (crash puro do RN/Hermes em produção) — achado de Alta do
// diagnóstico de resiliência (Tarefa 7).
//
// IMPORTANTE: React só permite capturar erros de render (durante o render,
// em métodos de lifecycle, e em construtores de componentes de classe) via
// Error Boundary. Erros em handlers de evento, Promises, e timers NÃO são
// capturados aqui — esses já são tratados pelo sistema de toast e pelo
// onError das mutations (Área 3). Este componente não substitui esse
// tratamento, só cobre a lacuna que ele nunca cobriu.

import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSizes, fontWeights, spacing } from '@blendi/shared';

import { AuthButton } from './AuthButton';
import { useAppTranslation, type UseAppTranslationReturn } from '../../hooks/useAppTranslation';

interface ErrorBoundaryClassProps extends PropsWithChildren {
  t: UseAppTranslationReturn['t'];
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryClass extends Component<ErrorBoundaryClassProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Sem Sentry/crash reporting configurado ainda (integração prevista para
    // a Fase 4) — console.error é a solução temporária, inclusive em
    // produção, pra não perder o sinal de que um crash aconteceu.
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  handleRetry = (): void => {
    // Tenta remontar a árvore. Resolve o erro se a causa foi uma resposta
    // efêmera de API ou um estado transitório; se a causa for estado
    // persistido (MMKV/cache) corrompido, vai crashar de novo — comportamento
    // esperado até um botão de "limpar dados e reiniciar" existir (ver abaixo).
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.message}>{this.props.t('errors.unexpected_error')}</Text>
        <AuthButton onPress={this.handleRetry}>
          {this.props.t('common.actions.retry')}
        </AuthButton>
        {/*
          TODO (Fase 4): botão "Limpar dados e reiniciar". Limpar MMKV e o
          cache do React Query requer avaliação cuidadosa de quais dados
          remover (token de sessão, preferências, cache offline com edições
          pendentes) — não implementado ainda de propósito. Até lá, o retry
          acima já resolve a maioria dos casos reais (erro vindo de uma
          resposta de API, não de estado persistido).
        */}
      </View>
    );
  }
}

export function ErrorBoundary({ children }: PropsWithChildren): ReactNode {
  const { t } = useAppTranslation();

  return <ErrorBoundaryClass t={t}>{children}</ErrorBoundaryClass>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.background.primary,
  },
  message: {
    fontFamily: fonts.body,
    fontSize: fontSizes.md,
    fontWeight: fontWeights.medium,
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing['3xl'],
  },
});
