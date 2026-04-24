// apps/api/src/services/email.service.ts
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  DEVELOPMENT STUB — DO NOT USE IN PRODUCTION AS-IS                  ║
// ║                                                                      ║
// ║  This service currently logs emails to the console instead of        ║
// ║  sending them. It must be replaced with Resend in Phase 4, when      ║
// ║  the Golden Ticket email sequence is implemented.                    ║
// ║                                                                      ║
// ║  The public interface (IEmailService) MUST NOT change when Resend    ║
// ║  is plugged in — only the internal implementation changes.           ║
// ║  Controllers import EmailService, never the transport layer.         ║
// ╚══════════════════════════════════════════════════════════════════════╝

import { env } from '../config/env';

// ─── Interface pública ────────────────────────────────────────────────────────
// Estabiliza o contrato entre controllers e o serviço.
// Quando Resend for integrado, basta trocar a implementação abaixo —
// nenhum controller precisará ser alterado.

export interface IEmailService {
  /**
   * Envia o e-mail de boas-vindas após o registro.
   * @param name  - Nome de exibição do destinatário
   * @param email - Endereço de e-mail do destinatário
   */
  sendWelcomeEmail(name: string, email: string): Promise<void>;

  /**
   * Envia o e-mail com o código de verificação de conta.
   * @param name  - Nome de exibição do destinatário
   * @param email - Endereço de e-mail do destinatário
   * @param code  - Código de verificação gerado pelo servidor (ex: '483920')
   */
  sendVerificationEmail(name: string, email: string, code: string): Promise<void>;
}

// ─── Implementação: console logger (desenvolvimento) ─────────────────────────

export class EmailService implements IEmailService {
  /**
   * Simula o envio do e-mail de boas-vindas logando no console.
   * Não lança exceção — falha de e-mail nunca deve bloquear o registro do usuário.
   *
   * TODO (Phase 4): replace with Resend transactional email + welcome template.
   */
  async sendWelcomeEmail(name: string, email: string): Promise<void> {
    try {
      if (env.NODE_ENV !== 'production') {
        console.log('\n📧  [EmailService] Welcome email would be sent to:');
        console.log(`    To:      ${name} <${email}>`);
        console.log(`    Subject: Welcome to BLENDi Pulse!`);
        console.log(`    Body:    Hi ${name}, your account is ready. Start blending! 🥤\n`);
        return;
      }

      // Phase 4 placeholder:
      // const resend = new Resend(env.RESEND_API_KEY);
      // await resend.emails.send({ from: 'noreply@blendipulse.com', to: email, ... });
      console.warn(
        `[EmailService] Email provider not configured — welcome email NOT sent to ${email}`
      );
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
      if (env.NODE_ENV !== 'production') {
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
}
