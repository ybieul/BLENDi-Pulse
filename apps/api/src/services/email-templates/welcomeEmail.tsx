// apps/api/src/services/email-templates/welcomeEmail.tsx
// Sem CTA/botão — o e-mail de boas-vindas é só tutorial + destaque de
// funcionalidades (ver decisão no CP de redesign com React Email).

import { Row, Column, Text, Heading, Hr } from '@react-email/components';
import { lightColors, fontSizes, fontWeights } from '@blendi/shared';
import { EmailLayout, Paragraph, bodyFontFamily, displayFontFamily } from './layout';

export interface WelcomeEmailFeature {
  name: string;
  description: string;
}

export interface WelcomeEmailContent {
  /** Saudação já interpolada (ex: "Hi, John!"). Usada como heading do e-mail. */
  greeting: string;
  opening: string;
  steps: string[];
  featuresHeading: string;
  features: WelcomeEmailFeature[];
  moreText: string;
  closing: string;
}

function StepRow({ number, text }: { number: number; text: string }) {
  return (
    <Row style={{ marginBottom: 12 }}>
      <Column style={{ width: 28, verticalAlign: 'top' }}>
        <Text
          style={{
            margin: 0,
            width: 20,
            height: 20,
            lineHeight: '20px',
            textAlign: 'center',
            borderRadius: 9999,
            backgroundColor: lightColors.brand.pulse,
            color: lightColors.text.inverse,
            fontFamily: bodyFontFamily,
            fontSize: fontSizes.xs,
            fontWeight: fontWeights.bold,
          }}
        >
          {number}
        </Text>
      </Column>
      <Column style={{ verticalAlign: 'top' }}>
        <Text
          style={{
            margin: 0,
            fontFamily: bodyFontFamily,
            fontSize: fontSizes.md,
            color: lightColors.text.secondary,
          }}
        >
          {text}
        </Text>
      </Column>
    </Row>
  );
}

function FeatureBlock({ feature }: { feature: WelcomeEmailFeature }) {
  return (
    <Text style={{ margin: '0 0 16px', fontFamily: bodyFontFamily, fontSize: fontSizes.md }}>
      <strong style={{ color: lightColors.text.primary }}>{feature.name}</strong>
      <br />
      <span style={{ color: lightColors.text.secondary }}>{feature.description}</span>
    </Text>
  );
}

export function WelcomeEmail({ content }: { content: WelcomeEmailContent }) {
  return (
    <EmailLayout previewText={content.opening} heading={content.greeting}>
      <Paragraph>{content.opening}</Paragraph>

      {content.steps.map((step, index) => (
        <StepRow key={step} number={index + 1} text={step} />
      ))}

      <Hr style={{ margin: '24px 0', borderColor: lightColors.overlay.plum[12] }} />

      <Heading
        as="h2"
        style={{
          margin: '0 0 16px',
          fontFamily: displayFontFamily,
          fontSize: fontSizes.lg,
          fontWeight: fontWeights.bold,
          color: lightColors.text.primary,
        }}
      >
        {content.featuresHeading}
      </Heading>

      {content.features.map(feature => (
        <FeatureBlock key={feature.name} feature={feature} />
      ))}

      <Paragraph muted>{content.moreText}</Paragraph>
      <Paragraph>{content.closing}</Paragraph>
    </EmailLayout>
  );
}
