// apps/api/src/services/email.service.ts
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  sendWelcomeEmail e sendPasswordResetEmail enviam de verdade via SMTP ║
// ║  (Google Workspace) quando ENABLE_DEV_EMAIL_LOG=false. Com a flag    ║
// ║  true, continuam só logando no console (ver config/env.ts).          ║
// ║                                                                      ║
// ║  sendVerificationEmail permanece um stub — nenhuma rota do backend   ║
// ║  o chama hoje (ver diagnóstico de 2026-10-09).                       ║
// ║                                                                      ║
// ║  Controllers importam EmailService, nunca o transporter.             ║
// ╚══════════════════════════════════════════════════════════════════════╝

import nodemailer, { type Transporter } from 'nodemailer';
import { createElement } from 'react';
import { render } from '@react-email/render';
import { env } from '../config/env';
import { WelcomeEmail, type WelcomeEmailContent } from './email-templates/welcomeEmail';
import { PasswordResetEmail } from './email-templates/passwordResetEmail';

// ─── Locale templates ─────────────────────────────────────────────────────────
// Todos os textos de e-mail ficam nos arquivos de locale — nenhum hardcode aqui.
// Fase 4: estes templates serão usados diretamente no Resend (HTML/texto puro).

import emailEn from '../locales/email-en.json';
import emailPtBr from '../locales/email-pt-br.json';

type EmailLocale = typeof emailEn;

/** Mapa de locale → template. Locale desconhecido faz fallback para inglês. */
const EMAIL_TEMPLATES: Record<string, EmailLocale> = {
  en: emailEn,
  'pt-BR': emailPtBr,
};

/** Resolve o locale do usuário para o template correspondente. Fallback: inglês. */
function resolveEmailTemplate(locale: string): EmailLocale {
  return EMAIL_TEMPLATES[locale] ?? emailEn;
}

/**
 * Substitui placeholders `{key}` no template pelo valor correspondente em `vars`.
 * Placeholders sem correspondência são mantidos intactos.
 */
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => vars[key] ?? `{${key}}`);
}

// ─── Transporter SMTP ──────────────────────────────────────────────────────────
// Criado de forma lazy (só quando um envio real é de fato tentado) e
// memoizado — reaproveita a mesma conexão/pool entre chamadas.

let cachedTransporter: Transporter | null = null;

/** Retorna o transporter SMTP, ou `null` se alguma variável obrigatória estiver ausente. */
function getSmtpTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;

  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM) {
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 465,
    secure: true,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  return cachedTransporter;
}

// ─── Interface pública ────────────────────────────────────────────────────────
// Estabiliza o contrato entre controllers e o serviço.
// Quando Resend for integrado, basta trocar a implementação abaixo —
// nenhum controller precisará ser alterado.

export interface IEmailService {
  /**
   * Envia o e-mail de boas-vindas após o registro.
   * O idioma do e-mail é determinado pelo locale do usuário.
   *
   * @param name   - Nome de exibição do destinatário
   * @param email  - Endereço de e-mail do destinatário
   * @param locale - Locale do usuário (ex: 'en', 'pt-BR'). Fallback: 'en'
   */
  sendWelcomeEmail(name: string, email: string, locale: string): Promise<void>;

  /**
   * Envia o e-mail com o código de verificação de conta.
   * @param name  - Nome de exibição do destinatário
   * @param email - Endereço de e-mail do destinatário
   * @param code  - Código de verificação gerado pelo servidor (ex: '483920')
   */
  sendVerificationEmail(name: string, email: string, code: string): Promise<void>;

  /**
   * Envia o e-mail com o código OTP para redefinição de senha.
   * O idioma do e-mail é determinado pelo locale do usuário.
   *
   * @param name   - Nome de exibição do destinatário
   * @param email  - Endereço de e-mail do destinatário
   * @param code   - Código OTP de 6 dígitos gerado pelo servidor
   * @param locale - Locale do usuário (ex: 'en', 'pt-BR'). Fallback: 'en'
   */
  sendPasswordResetEmail(name: string, email: string, code: string, locale: string): Promise<void>;
}

// ─── Implementação: console logger (desenvolvimento) ─────────────────────────

export class EmailService implements IEmailService {
  /**
   * Envia o e-mail de boas-vindas. O conteúdo vem do locale do usuário, mesma
   * resolução usada em sendPasswordResetEmail. Com ENABLE_DEV_EMAIL_LOG=true,
   * só loga no console. Não lança exceção — falha de e-mail nunca deve
   * bloquear o registro.
   */
  async sendWelcomeEmail(name: string, email: string, locale: string): Promise<void> {
    const templates = resolveEmailTemplate(locale);
    const t = templates.welcome;
    const vars: Record<string, string> = { name };

    const subject = interpolate(t.subject, vars);
    const content: WelcomeEmailContent = {
      greeting: interpolate(t.greeting, vars),
      opening: t.opening,
      steps: t.steps,
      featuresHeading: t.features_heading,
      features: t.features,
      moreText: t.more_text,
      closing: t.closing,
    };

    try {
      if (env.ENABLE_DEV_EMAIL_LOG) {
        console.log('\n📧  [EmailService] Welcome email would be sent to:');
        console.log(`    To:      ${name} <${email}>`);
        console.log(`    Subject: ${subject}`);
        console.log(`    ${content.greeting}`);
        console.log(`    ${content.opening}`);
        content.steps.forEach((step, i) => console.log(`    ${i + 1}. ${step}`));
        console.log(`    ${content.featuresHeading}:`);
        content.features.forEach(f => console.log(`      - ${f.name}: ${f.description}`));
        console.log(`    ${content.moreText}`);
        console.log(`    ${content.closing}\n`);
        return;
      }

      const transporter = getSmtpTransporter();
      if (!transporter) {
        console.warn(
          `[EmailService] Email provider not configured — welcome email NOT sent to ${email}`
        );
        return;
      }

      const element = createElement(WelcomeEmail, { content });
      const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

      await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: email,
        subject,
        text,
        html,
      });
    } catch (err) {
      // Falha silenciosa: o usuário já foi criado. Não propagar erro para o controller.
      console.error('[EmailService] Failed to send welcome email:', err);
    }
  }

  /**
   * Simula o envio do e-mail de verificação de conta logando no console.
   * O código é exibido em destaque no terminal para facilitar testes manuais.
   *
   * TODO (Phase 4): replace with Resend + verification code template (Golden Ticket flow).
   */
  async sendVerificationEmail(name: string, email: string, code: string): Promise<void> {
    try {
      if (env.ENABLE_DEV_EMAIL_LOG) {
        console.log('\n📧  [EmailService] Verification email would be sent to:');
        console.log(`    To:      ${name} <${email}>`);
        console.log(`    Subject: Verify your BLENDi Pulse account`);
        console.log(`    Code:    ┌─────────────┐`);
        console.log(`             │   ${code}   │  ← verification code`);
        console.log(`             └─────────────┘\n`);
        return;
      }

      // Phase 4 placeholder:
      // const resend = new Resend(env.RESEND_API_KEY);
      // await resend.emails.send({ from: 'noreply@blendipulse.com', to: email, ... });
      console.warn(
        `[EmailService] Email provider not configured — verification email NOT sent to ${email}`
      );
    } catch (err) {
      console.error('[EmailService] Failed to send verification email:', err);
    }
  }

  /**
   * Envia o e-mail com código OTP de redefinição de senha.
   *
   * O conteúdo é carregado do arquivo de locale correspondente ao idioma do usuário
   * (apps/api/src/locales/email-{locale}.json). Fallback automático para inglês.
   * Nenhum texto é hardcoded aqui — toda string vem do template de locale.
   * Com ENABLE_DEV_EMAIL_LOG=true, só loga no console (não envia de verdade).
   */
  async sendPasswordResetEmail(
    name: string,
    email: string,
    code: string,
    locale: string
  ): Promise<void> {
    try {
      const templates = resolveEmailTemplate(locale);
      const t = templates.password_reset;
      const vars: Record<string, string> = { name, code };

      const subject = interpolate(t.subject, vars);
      const greeting = interpolate(t.greeting, vars);
      const body = interpolate(t.body, vars);
      const codeLabel = interpolate(t.code_label, vars);
      const expires = interpolate(t.expires, vars);
      const ignore = interpolate(t.ignore, vars);

      if (env.ENABLE_DEV_EMAIL_LOG) {
        console.log(`\n🔑  [EmailService] Password reset OTP for ${name} <${email}>: ${code}`);
        console.log(`    Subject:  ${subject}`);
        console.log(`    ─────────────────────────────────────────────────────`);
        console.log(`    ${greeting}`);
        console.log(`    ${body}`);
        console.log(`    ${codeLabel}:`);
        console.log(`    ┌─────────────┐`);
        console.log(`    │   ${code}   │`);
        console.log(`    └─────────────┘`);
        console.log(`    ${expires}`);
        console.log(`    ${ignore}\n`);
        return;
      }

      const transporter = getSmtpTransporter();
      if (!transporter) {
        console.warn(
          `[EmailService] Email provider not configured — password reset email NOT sent to ${email}`
        );
        return;
      }

      const element = createElement(PasswordResetEmail, {
        content: { greeting, body, codeLabel, expires, ignore },
        code,
      });
      const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

      await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: email,
        subject,
        text,
        html,
      });
    } catch (err) {
      // Falha silenciosa: o cliente já recebeu 200. Não vazar detalhes internos.
      console.error('[EmailService] Failed to send password reset email:', err);
    }
  }
}
