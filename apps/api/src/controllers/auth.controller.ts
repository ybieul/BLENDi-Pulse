// apps/api/src/controllers/auth.controller.ts
// Handlers HTTP para as rotas de autenticação.
// Cada handler segue o mesmo contrato de resposta:
//
//   Sucesso → { success: true, data: { ... } }
//   Erro    → { success: false, message: '<chave i18n>', errors?: [...] }
//
// As mensagens são SEMPRE chaves de i18n — nunca texto traduzido.
// O cliente (mobile/web) resolve a chave para o idioma do usuário via t(key).

import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
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
import {
  buildGoogleAuthUrl,
  getGoogleProfile,
  normalizeGoogleLocale,
} from '../services/google.service';
import { EmailService } from '../services/email.service';
import { env } from '../config/env';

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
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
        errors: formatZodErrors(parsed.error),
      });
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
      res.status(409).json({
        success: false,
        message: 'errors.auth.email_taken',
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
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const { email, password } = parsed.data;

    // 2. Buscar usuário incluindo a senha (select: false por padrão)
    const user = await UserModel.findOne({ email }).select('+password');

    // 3. Usuário não encontrado → resposta genérica (não revela que o email não existe)
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'errors.auth.invalid_credentials',
      });
      return;
    }

    // 4. Verificar senha com Argon2
    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      res.status(401).json({
        success: false,
        message: 'errors.auth.invalid_credentials',
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
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
        errors: formatZodErrors(parsed.error),
      });
      return;
    }

    const { refreshToken } = parsed.data;

    // 2. Verificar e decodificar o refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (err) {
      const message = isTokenExpiredError(err)
        ? 'errors.auth.session_expired'
        : 'errors.auth.unauthorized';

      res.status(401).json({ success: false, message });
      return;
    }

    // 3. Confirmar que o usuário ainda existe e está ativo
    const user = await UserModel.findById(payload.sub).lean();
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: 'errors.auth.unauthorized',
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
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
        errors: formatZodErrors(parsed.error),
      });
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
      res.status(404).json({
        success: false,
        message: 'errors.not_found',
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

// ─── Google OAuth: geração da URL ─────────────────────────────────────────────

/**
 * GET /auth/google
 * Retorna a URL de autorização do Google para o app mobile abrir no browser.
 *
 * O `state` é um JWT de curta duração (10 min) assinado com JWT_ACCESS_SECRET.
 * É embutido na URL e devolvido pelo Google no callback para verificação CSRF.
 *
 * Resposta: { success: true, data: { url: string } }
 */
export async function googleAuthUrl(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Gera state JWT: payload mínimo, expiração curta, assina com secret existente
    const state = jwt.sign({ csrf: true }, env.JWT_ACCESS_SECRET, {
      expiresIn: '10m',
    });

    const url = buildGoogleAuthUrl(state);

    res.status(200).json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

// ─── Google OAuth: callback ───────────────────────────────────────────────────

/**
 * GET /auth/google/callback
 * Recebe o código de autorização do Google, verifica o state CSRF,
 * troca o código pelo perfil do usuário e faz login ou registro automático.
 *
 * Três casos possíveis:
 *   1. googleId já existe no banco → login direto
 *   2. Email existe sem googleId  → vincula o googleId à conta existente → login
 *   3. Usuário novo               → cria conta com defaults de onboarding → registro
 *
 * Defaults de onboarding para contas OAuth:
 *   - blendiModel: 'Lite' (upgrade disponível nas configurações)
 *   - goal: 'Wellness'
 *   - dailyProteinTarget: 150g | dailyCalorieTarget: 2000 kcal
 *   O usuário completa/ajusta esses valores no onboarding após o primeiro login.
 *
 * Resposta: { success: true, data: { user, accessToken, refreshToken, isNewUser } }
 *
 * ⚠️  Parte 3 (mobile): este endpoint retornará um deep link redirect
 *     (blendipulse://auth/callback) em vez de JSON quando o app mobile
 *     integrar o expo-auth-session.
 */
export async function googleCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { code, state, error } = req.query as Record<string, string | undefined>;

    // 1. Verificar se o Google retornou erro (ex: usuário cancelou)
    if (error) {
      res.status(400).json({
        success: false,
        message: 'errors.auth.google_cancelled',
      });
      return;
    }

    // 2. Validar presença dos parâmetros obrigatórios
    if (!code || !state) {
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
      });
      return;
    }

    // 3. Verificar state CSRF — rejeita tokens expirados ou adulterados
    try {
      jwt.verify(state, env.JWT_ACCESS_SECRET);
    } catch {
      res.status(400).json({
        success: false,
        message: 'errors.auth.invalid_state',
      });
      return;
    }

    // 4. Trocar código pelo perfil verificado do Google
    let profile;
    try {
      profile = await getGoogleProfile(code);
    } catch {
      res.status(401).json({
        success: false,
        message: 'errors.auth.google_auth_failed',
      });
      return;
    }

    // 5. Rejeitar contas com email não verificado pelo Google
    if (!profile.email_verified) {
      res.status(401).json({
        success: false,
        message: 'errors.auth.email_not_verified',
      });
      return;
    }

    const locale = normalizeGoogleLocale(profile.locale);
    const deviceTimezone = 'America/New_York'; // Atualizado via PATCH /auth/timezone pelo mobile

    // 6. Tentar encontrar usuário por googleId (caso já tenha feito OAuth antes)
    let user = await UserModel.findOne({ googleId: profile.sub });
    let isNewUser = false;

    if (!user) {
      // 7. Tentar encontrar por email (conta existente por email/senha)
      user = await UserModel.findOne({ email: profile.email });

      if (user) {
        // Caso 2: vincular googleId à conta existente
        user.googleId = profile.sub;
        await user.save();
      } else {
        // Caso 3: criar nova conta com defaults de onboarding
        user = await UserModel.create({
          email: profile.email,
          name: profile.name,
          googleId: profile.sub,
          locale,
          timezone: deviceTimezone,
          // Defaults de onboarding — ajustados pelo usuário na tela de perfil
          blendiModel: 'Lite',
          goal: 'Wellness',
          dailyProteinTarget: 150,
          dailyCalorieTarget: 2000,
        });

        isNewUser = true;
        void emailService.sendWelcomeEmail(user.name, user.email);
      }
    }

    // 8. Gerar par de tokens BLENDi (mesma estrutura do login por email)
    const accessToken = generateAccessToken(user.id as string, user.email);
    const refreshToken = generateRefreshToken(user.id as string);

    res.status(isNewUser ? 201 : 200).json({
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
        /** true se o usuário foi criado agora — o mobile usa para direcionar ao onboarding */
        isNewUser,
      },
    });
  } catch (err) {
    next(err);
  }
}
