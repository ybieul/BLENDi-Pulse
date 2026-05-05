// apps/api/src/controllers/auth.controller.ts
// Handlers HTTP para as rotas de autenticação.
// Cada handler segue o mesmo contrato de resposta:
//
//   Sucesso → { success: true, data: { ... } }
//   Erro    → { success: false, code: 'dominio/erro', message: 'English message', errors?: [...] }

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  updateTimezoneSchema,
} from '@blendi/shared';
import { UserModel } from '../models/User';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  isTokenExpiredError,
} from '../services/auth.service';
import { EmailService } from '../services/email.service';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

// Instância única compartilhada pelos handlers — troca de implementação sem mudar controllers
const emailService = new EmailService();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Formata os erros do Zod no padrão { field, message } usando chaves de i18n. */
function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message, // já é uma chave i18n (ex: 'errors.validation.required')
    ...(issue.code === 'too_small' && { minimum: (issue as { minimum?: number }).minimum }),
    ...(issue.code === 'too_big' && { maximum: (issue as { maximum?: number }).maximum }),
  }));
}

function sendValidationError(res: Response, err: ZodError): void {
  sendErrorResponse(res, {
    statusCode: 400,
    code: VALIDATION_ERROR_CODE,
    message: VALIDATION_ERROR_MESSAGE,
    errors: formatZodErrors(err),
  });
}

// ─── Register ─────────────────────────────────────────────────────────────────

/**
 * POST /auth/register
 * Cria um novo usuário e retorna os tokens de sessão.
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validar body com Zod
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const {
      email,
      password,
      name,
      blendiModel,
      goal,
      preferredLanguage,
      timezone,
      dailyProteinTarget,
      dailyCalorieTarget,
    } = parsed.data;

    // 2. Verificar se o email já está cadastrado
    const existing = await UserModel.findOne({ email }).lean();
    if (existing) {
      sendErrorResponse(res, {
        statusCode: 409,
        code: 'auth/email-already-exists',
        message: 'Email already exists.',
      });
      return;
    }

    // 3. Criar usuário — a senha é hasheada pelo pre-save hook do modelo (Argon2id)
    const user = await UserModel.create({
      email,
      password,
      name,
      blendiModel,
      goal,
      locale: preferredLanguage,
      timezone,
      dailyProteinTarget,
      dailyCalorieTarget,
    });

    // 4. Gerar par de tokens
    const accessToken = generateAccessToken(user.id as string, user.email);
    const refreshToken = generateRefreshToken(user.id as string);

    // 5. Disparar e-mail de boas-vindas (não bloqueia — falha silenciosa)
    void emailService.sendWelcomeEmail(user.name, user.email);

    // 6. Retornar 201 com dados públicos do usuário + tokens
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          blendiModel: user.blendiModel,
          goal: user.goal,
          locale: user.locale,
          timezone: user.timezone,
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCalorieTarget: user.dailyCalorieTarget,
          createdAt: user.createdAt,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────

/**
 * POST /auth/login
 * Autentica um usuário existente e retorna novos tokens.
 *
 * ⚠️  Respostas intencionalmente genéricas para não vazar quais emails estão cadastrados.
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validar body
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { email, password } = parsed.data;

    // 2. Buscar usuário incluindo a senha (select: false por padrão)
    const user = await UserModel.findOne({ email }).select('+password');

    // 3. Usuário não encontrado → resposta genérica (não revela que o email não existe)
    if (!user) {
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'auth/invalid-credentials',
        message: 'Invalid email or password.',
      });
      return;
    }

    // 4. Verificar senha com Argon2
    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'auth/invalid-credentials',
        message: 'Invalid email or password.',
      });
      return;
    }

    // 5. Gerar novos tokens
    const accessToken = generateAccessToken(user.id as string, user.email);
    const refreshToken = generateRefreshToken(user.id as string);

    // 6. Retornar 200 com dados públicos + tokens
    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          blendiModel: user.blendiModel,
          goal: user.goal,
          locale: user.locale,
          timezone: user.timezone,
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCalorieTarget: user.dailyCalorieTarget,
          createdAt: user.createdAt,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

/**
 * POST /auth/refresh
 * Refresh Token Rotation: invalida o token atual e emite um novo par.
 *
 * Se um token de refresh antigo/inválido for apresentado, pode indicar roubo.
 * O padrão de rotação limita a janela de uso de tokens comprometidos.
 */
export async function refresh(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validar body
    const parsed = refreshTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { refreshToken } = parsed.data;

    // 2. Verificar e decodificar o refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      sendErrorResponse(res, {
        statusCode: 401,
        code: isTokenExpiredError(err) ? 'auth/session-expired' : 'auth/unauthorized',
        message: isTokenExpiredError(err) ? 'Session expired.' : 'Unauthorized.',
      });
      return;
    }

    // 3. Confirmar que o usuário ainda existe e está ativo
    const user = await UserModel.findById(payload.sub).lean();
    if (!user || !user.isActive) {
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'auth/unauthorized',
        message: 'Unauthorized.',
      });
      return;
    }

    // 4. Emitir novo par de tokens (rotação)
    const newAccessToken = generateAccessToken(String(user._id), user.email);
    const newRefreshToken = generateRefreshToken(String(user._id));

    // 5. Retornar novos tokens
    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── Update Timezone ──────────────────────────────────────────────────────────

/**
 * PATCH /auth/timezone
 * Atualiza o timezone IANA do usuário autenticado.
 *
 * Chamado pelo app mobile automaticamente quando detecta divergência entre
 * o timezone salvo no servidor e o timezone atual do dispositivo.
 * Requer autenticação (middleware authenticate).
 */
export async function updateTimezone(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validar body
    const parsed = updateTimezoneSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { timezone } = parsed.data;

    // 2. req.user é garantido pelo middleware authenticate
    const userId = req.user!.sub;

    // 3. Atualizar timezone — sem transformações, salvo exatamente como recebido
    const user = await UserModel.findByIdAndUpdate(
      userId,
      { timezone },
      { new: true, runValidators: true }
    ).lean();

    if (!user) {
      sendErrorResponse(res, {
        statusCode: 404,
        code: 'resource/not-found',
        message: 'User not found.',
      });
      return;
    }

    // 4. Retornar 200 com os dados públicos atualizados
    res.status(200).json({
      success: true,
      data: {
        id: String(user._id),
        timezone: user.timezone,
      },
    });
  } catch (err) {
    next(err);
  }
}
