// apps/api/src/services/email-templates/passwordResetEmail.tsx
// Mesmo conteúdo de antes (saudação, corpo, código OTP, avisos) — só a
// forma de montar o HTML mudou, pra React Email.

import { Section, Text, Hr } from '@react-email/components';
import { lightColors, fontSizes, fontWeights } from '@blendi/shared';
import { EmailLayout, Paragraph, monoFontFamily } from './layout';

export interface PasswordResetEmailContent {
  /** Saudação já interpolada (ex: "Hi, John!"). Usada como heading do e-mail. */
  greeting: string;
  body: string;
  codeLabel: string;
  expires: string;
  ignore: string;
}

export function PasswordResetEmail({
  content,
  code,
}: {
  content: PasswordResetEmailContent;
  code: string;
}) {
  return (
    <EmailLayout previewText={content.body} heading={content.greeting}>
      <Paragraph>{content.body}</Paragraph>

      <Section
        style={{
          textAlign: 'center',
          backgroundColor: lightColors.background.tertiary,
          borderRadius: 12,
          padding: 20,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            margin: '0 0 8px',
            fontFamily: monoFontFamily,
            fontSize: fontSizes.sm,
            color: lightColors.text.tertiary,
          }}
        >
          {content.codeLabel}
        </Text>
        <Text
          style={{
            margin: 0,
            fontFamily: monoFontFamily,
            fontSize: fontSizes['3xl'],
            fontWeight: fontWeights.bold,
            letterSpacing: 8,
            color: lightColors.text.primary,
          }}
        >
          {code}
        </Text>
      </Section>

      <Hr style={{ margin: '16px 0', borderColor: lightColors.overlay.plum[12] }} />

      <Paragraph muted>{content.expires}</Paragraph>
      <Paragraph muted>{content.ignore}</Paragraph>
    </EmailLayout>
  );
}
