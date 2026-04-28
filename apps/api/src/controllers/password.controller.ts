// apps/api/src/controllers/password.controller.ts
// Handlers HTTP para o fluxo de redefinição de senha via OTP.
//
// Fluxo de 3 etapas:
//   1. POST /auth/password/forgot     → envia OTP por e-mail (sempre retorna 200)
//   2. POST /auth/password/verify-otp → valida OTP e retorna resetToken (JWT 10 min)
//   3. POST /auth/password/reset      → usa resetToken para definir nova senha
//
// Cada handler segue o contrato:
//   Sucesso → { success: true, data: { ... } }
//   Erro    → { success: false, message: '<chave i18n>' }

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  forgotPasswordSchema,
  verifyOtpSchema,
  resetPasswordSchema,
} from '@blendi/shared';
import { UserModel } from '../models/User';
import { EmailService } from '../services/email.service';
import { createOtpRecord, validateOtpRecord } from '../services/otp.service';
import {
  generateResetToken,
  verifyResetToken,
  isTokenExpiredError,
} from '../services/auth.service';

const emailService = new EmailService();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

// ─── Forgot Password ──────────────────────────────────────────────────────────

/**
 * POST /auth/password/forgot
 *
 * Inicia o fluxo de redefinição de senha enviando um OTP de 6 dígitos por e-mail.
 *
 * Segurança — email enumeration prevention:
 *   A resposta é SEMPRE idêntica (200 + mesma mensagem), independentemente de
 *   o e-mail existir ou não. Isso impede que atacantes descubram quais endereços
 *   estão cadastrados pela diferença nas respostas.
 */
export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const { email } = parsed.data;

    // Resposta imediata — não vazar se o e-mail existe ou não
    res.status(200).json({
      success: true,
      data: {
        message: 'errors.auth.forgot_password_sent',
      },
    });

    // Fire-and-forget após o response ser enviado.
    // Erros aqui são logados mas não afetam o cliente.
    const user = await UserModel.findOne({ email }).select('name email locale').lean();
    if (!user) return;

    const otp = await createOtpRecord(email);
    await emailService.sendPasswordResetEmail(user.name, email, otp, user.locale);
  } catch (err) {
    next(err);
  }
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

/**
 * POST /auth/password/verify-otp
 *
 * Valida o OTP recebido por e-mail e, se correto, retorna um resetToken JWT
 * de uso único com expiração de 10 minutos.
 *
 * O resetToken deve ser enviado no próximo passo (POST /reset) para autorizar
 * a troca de senha. Não é armazenado no banco — sua validade é verificada
 * pela assinatura JWT (JWT_RESET_SECRET) e pelo campo `used` do registro OTP.
 */
export async function verifyOtp(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const { email, otp } = parsed.data;

    const isValid = await validateOtpRecord(email, otp);
    if (!isValid) {
      res.status(400).json({
        success: false,
        message: 'errors.auth.invalid_or_expired_code',
      });
      return;
    }

    const resetToken = generateResetToken(email);

    res.status(200).json({
      success: true,
      data: { resetToken },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Reset Password ───────────────────────────────────────────────────────────

/**
 * POST /auth/password/reset
 *
 * Redefine a senha do usuário usando o resetToken obtido em /verify-otp.
 *
 * O pré-save hook do UserModel aplica Argon2id na nova senha automaticamente —
 * não é necessário chamar hashPassword() manualmente aqui.
 *
 * TODO (Fase 3 — Gerenciamento de Sessões):
 *   Incrementar `tokenVersion` do usuário para invalidar todos os refresh tokens
 *   ativos. Atualmente, sessões existentes permanecem válidas até expirar.
 *   Implementar quando o campo `tokenVersion` for adicionado ao UserModel.
 */
export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const { resetToken, newPassword } = parsed.data;

    let payload;
    try {
      payload = verifyResetToken(resetToken);
    } catch (err) {
      const message = isTokenExpiredError(err)
        ? 'errors.auth.reset_token_expired'
        : 'errors.auth.invalid_or_expired_code';

      res.status(400).json({ success: false, message });
      return;
    }

    if (payload.purpose !== 'password_reset') {
      res.status(400).json({
        success: false,
        message: 'errors.auth.invalid_or_expired_code',
      });
      return;
    }

    // payload.sub é o e-mail do usuário (definido em generateResetToken)
    const user = await UserModel.findOne({ email: payload.sub }).select('+password +passwordChangedAt');
    if (!user) {
      // Não vazar se o e-mail existe — resposta genérica
      res.status(400).json({
        success: false,
        message: 'errors.auth.invalid_or_expired_code',
      });
      return;
    }

    // Proteção contra reutilização do resetToken:
    // Se a senha já foi trocada após a emissão deste token, rejeitá-lo.
    // payload.iat está em segundos; passwordChangedAt.getTime() em ms.
    if (user.passwordChangedAt && user.passwordChangedAt.getTime() >= payload.iat * 1000) {
      res.status(401).json({
        success: false,
        message: 'errors.auth.reset_token_already_used',
      });
      return;
    }

    // O pré-save hook do UserModel aplica Argon2id automaticamente
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      data: { message: 'errors.auth.password_reset_success' },
    });
  } catch (err) {
    next(err);
  }
}
