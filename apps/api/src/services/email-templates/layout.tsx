// apps/api/src/services/email-templates/layout.tsx
// Layout HTML compartilhado entre os e-mails transacionais (boas-vindas,
// redefinição de senha), montado com @react-email/components. Cores/fontes
// vêm de @blendi/shared (fonte única da verdade do design system) — e-mail
// não acompanha o tema escuro do app, por isso usa sempre a paleta clara
// (lightColors), fixa. Conteúdo dinâmico (nome, código) é escapado
// automaticamente pelo React — nenhuma função de escape manual é necessária.

import type { ReactNode } from 'react';
import { Html, Head, Preview, Body, Container, Section, Heading, Text } from '@react-email/components';
import { lightColors, fonts, fontSizes, fontWeights, lineHeights, borderRadius } from '@blendi/shared';

export const bodyFontFamily = `'${fonts.body}', Helvetica, Arial, sans-serif`;
export const displayFontFamily = `'${fonts.display}', Georgia, serif`;
export const monoFontFamily = `'${fonts.mono}', 'Courier New', monospace`;

/** Parágrafo de corpo de texto. `muted` usa tamanho menor e cor terciária (expiração, disclaimers). */
export function Paragraph({ muted, children }: { muted?: boolean; children: ReactNode }) {
  const color = muted ? lightColors.text.tertiary : lightColors.text.secondary;
  const fontSize = muted ? fontSizes.sm : fontSizes.md;

  return (
    <Text
      style={{
        margin: '0 0 16px',
        fontFamily: bodyFontFamily,
        fontSize,
        lineHeight: lineHeights.normal,
        color,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Layout base: cabeçalho com a marca, heading e rodapé. `previewText` é o
 * preheader — texto exibido na lista de e-mails do cliente antes de abrir.
 */
export function EmailLayout({
  previewText,
  heading,
  children,
}: {
  previewText: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: lightColors.background.primary }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>
          <Section
            style={{
              backgroundColor: lightColors.background.secondary,
              borderRadius: borderRadius.lg,
              padding: '32px',
            }}
          >
            <Text
              style={{
                margin: 0,
                fontFamily: displayFontFamily,
                fontSize: fontSizes.lg,
                fontWeight: fontWeights.extrabold,
                color: lightColors.brand.pulse,
              }}
            >
              BLENDi Pulse
            </Text>
            <Heading
              as="h1"
              style={{
                margin: '16px 0 16px',
                fontFamily: displayFontFamily,
                fontSize: fontSizes.xl,
                lineHeight: lineHeights.tight,
                fontWeight: fontWeights.bold,
                color: lightColors.text.primary,
              }}
            >
              {heading}
            </Heading>
            {children}
          </Section>
          <Section style={{ padding: '20px 32px', textAlign: 'center' }}>
            <Text
              style={{
                margin: 0,
                fontFamily: bodyFontFamily,
                fontSize: fontSizes.sm,
                color: lightColors.text.tertiary,
              }}
            >
              BLENDi Pulse &middot; blendiblender.com
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
