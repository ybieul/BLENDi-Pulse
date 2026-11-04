// apps/api/src/controllers/apple.controller.ts
// Handler HTTP para o fluxo de Sign in with Apple.
//
//   Sucesso → { success: true, data: { ... } }
//   Erro    → { success: false, code: 'dominio/erro', message: 'English message', errors?: [...] }
//
// ── Por que não é redirect, como o Google? ───────────────────────────────────
// O fluxo da Apple no app nativo não usa browser: o SDK nativo
// (expo-apple-authentication, mobile — CP separada) entrega o identityToken
// e o authorizationCode direto pro app, que manda os dois num único POST.
// Por isso a resposta aqui é JSON direto, no mesmo formato de register/login
// — nunca um redirect de deep link como em google.controller.ts.
//
// ── Três casos possíveis (mesma estrutura de handleGoogleCallback) ───────────
//
//   Caso 1 — appleUserId já existe no banco:
//     Usuário já fez login via Apple antes → login direto. appleRefreshToken
//     é sobrescrito com o valor mais recente (pode mudar entre logins).
//
//   Caso 2 — email_verified=true e email existe no banco sem appleUserId:
//     Usuário se cadastrou por outro meio → vincula appleUserId e
//     appleRefreshToken à conta existente, sem alterar nenhum outro dado.
//
//   Caso 3 — Nenhum dos dois:
//     Primeiro acesso via Apple → cria nova conta com valores padrão de
//     onboarding (mesmos defaults do Google/register).

import type { Request, Response, NextFunction } from 'express';
import type { ZodError } from 'zod';
import { addMonths } from 'date-fns';
import { appleSignInSchema } from '@blendi/shared';
import { UserModel, type UserDocument } from '../models/User';
import {
  verifyAppleIdentityToken,
  exchangeAppleAuthorizationCode,
} from '../services/apple.service';
import { generateAccessToken, generateRefreshToken } from '../services/auth.service';
import { EmailService } from '../services/email.service';
import { getAccountCreationBodyProfileDefaults } from '../utils/accountDefaults.utils';
import { calculateFatTargetFromCalories } from '../utils/macroCalculation.utils';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';

// Instância única compartilhada pelo handler — mesmo padrão de auth.controller.ts/google.controller.ts
const emailService = new EmailService();

function formatZodErrors(err: ZodError) {
  return err.issues.map(issue => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
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

function isDuplicateKeyError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

/**
 * Deriva um nome de exibição razoável quando o app não envia `fullName` —
 * isso é esperado em todo login além do primeiro (a Apple só entrega o nome
 * uma vez). Usa a parte local do email quando disponível; caso contrário,
 * cai num literal fixo — o modelo exige `name` não vazio.
 */
function resolveDisplayName(fullName: string | undefined, email: string | undefined): string {
  if (fullName && fullName.trim().length > 0) {
    return fullName.trim();
  }

  if (email) {
    const [localPart] = email.split('@');
    if (localPart && localPart.length > 0) {
      return localPart;
    }
  }

  return 'Apple User';
}

// ─── Handler: POST /auth/apple ────────────────────────────────────────────────

/**
 * Processa o login/registro via Sign in with Apple.
 *
 * Body: { identityToken, authorizationCode, fullName? } — ver appleSignInSchema.
 *
 * Resposta de sucesso (200): { success: true, data: { user, accessToken, refreshToken, isNewUser } }
 * — mesmo formato de POST /auth/register e POST /auth/login.
 */
export async function handleAppleSignIn(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Validar body
    const parsed = appleSignInSchema.safeParse(req.body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }

    const { identityToken, authorizationCode, fullName } = parsed.data;

    // 2. Verificar o identityToken — assinatura, iss, aud e expiração
    // (ver apple.service.ts). Qualquer falha aqui é um identityToken
    // inválido/adulterado/expirado — rejeitado com um erro claro, antes de
    // qualquer chamada de rede adicional ou lookup no banco.
    let claims;
    try {
      claims = await verifyAppleIdentityToken(identityToken);
    } catch (err) {
      // Logado explicitamente — diferente de um identityToken forjado por um
      // cliente malicioso (esperado, ruído), isso também é o único sinal
      // visível de um erro de CONFIGURAÇÃO (Key ID/Team ID/bundle id
      // errados), que do contrário afetaria 100% dos logins e passaria
      // despercebido (nenhum outro ponto do fluxo reporta isso).
      console.error('[apple.controller] identityToken verification failed', { err });
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'auth/apple-auth-failed',
        message: 'Apple sign-in verification failed.',
      });
      return;
    }

    // 3. Trocar o authorizationCode por um refresh token da Apple
    let appleRefreshToken: string;
    try {
      appleRefreshToken = await exchangeAppleAuthorizationCode(authorizationCode);
    } catch (err) {
      console.error('[apple.controller] authorizationCode exchange failed', { err });
      sendErrorResponse(res, {
        statusCode: 401,
        code: 'auth/apple-auth-failed',
        message: 'Apple sign-in verification failed.',
      });
      return;
    }

    // 4. Lógica de login / vinculação / registro
    let user: UserDocument | null = await UserModel.findOne({ appleUserId: claims.sub });
    let isNewUser = false;

    if (user) {
      // Caso 1: login — o refresh token da Apple pode mudar entre logins
      user.appleRefreshToken = appleRefreshToken;
      await user.save();
    } else if (claims.emailVerified && claims.email) {
      // Caso 2 (só tentado com email_verified=true — ver AppleIdentityTokenClaims.emailVerified):
      // conta existente com esse email → vincula a Apple sem alterar nenhum outro dado
      // select('+appleUserId') — precisa do valor atual pra checar conflito abaixo.
      // Cast: a sobrecarga de .select(string) do Mongoose não propaga
      // IUserMethods no tipo de retorno (limitação conhecida da tipagem) —
      // o método comparePassword existe em runtime independente da projeção,
      // só a inferência de tipo não reflete isso aqui.
      user = (await UserModel.findOne({ email: claims.email }).select('+appleUserId')) as
        | UserDocument
        | null;

      if (user) {
        if (user.appleUserId && user.appleUserId !== claims.sub) {
          // Esta conta já está vinculada a uma Apple ID DIFERENTE — nunca
          // sobrescrever silenciosamente (perderia o vínculo antigo sem que
          // o usuário saiba). Mesma proteção aplicada ao googleId em
          // google.controller.ts. Cenário improvável (o mesmo email
          // verificado pertencendo a duas contas Apple distintas).
          sendErrorResponse(res, {
            statusCode: 409,
            code: 'auth/apple-account-conflict',
            message: 'This account is already linked to a different Apple ID.',
          });
          return;
        }

        user.appleUserId = claims.sub;
        user.appleRefreshToken = appleRefreshToken;
        await user.save();
      }
    }

    if (!user) {
      // Caso 3: primeiro acesso via Apple → cria nova conta
      if (!claims.email) {
        // Defensivo: a Apple documenta que o identityToken sempre inclui
        // `email` (mesmo com "Hide My Email" ativo) — mas sem ele não há
        // como criar a conta (campo obrigatório no modelo). Checagem
        // explícita em vez de deixar UserModel.create() lançar um
        // ValidationError genérico: o errorHandler global não distingue
        // isso de um bug de código e devolveria um 500 "unexpected error"
        // em produção, em vez de um erro claro de autenticação.
        console.error('[apple.controller] identityToken sem claim "email" — não é possível criar conta', {
          sub: claims.sub,
        });
        sendErrorResponse(res, {
          statusCode: 401,
          code: 'auth/apple-auth-failed',
          message: 'Apple sign-in verification failed.',
        });
        return;
      }

      // Mesmos defaults de onboarding do Google/register (o app mobile pedirá
      // os dados reais na tela de onboarding logo após o primeiro login).
      try {
        user = await UserModel.create({
          email: claims.email,
          emailVerified: claims.emailVerified,
          name: resolveDisplayName(fullName, claims.email),
          appleUserId: claims.sub,
          appleRefreshToken,
          locale: 'en',
          timezone: 'America/New_York', // sobrescrito pelo PATCH /auth/timezone no boot do app
          blendiModel: 'Lite',
          goal: 'Wellness',
          dailyProteinTarget: 150,
          dailyCalorieTarget: 2000,
          dailyFatTarget: calculateFatTargetFromCalories(2000),
          scanCount: 0,
          scanResetDate: addMonths(new Date(), 1),
          ...getAccountCreationBodyProfileDefaults(),
        });

        isNewUser = true;
        void emailService.sendWelcomeEmail(user.name, user.email, user.locale);
      } catch (err) {
        // Corrida entre os lookups acima e este create — mesmo padrão TOCTOU
        // de register (auth.controller.ts) e handleGoogleCallback
        // (google.controller.ts): duas chamadas concorrentes (ex: duplo toque
        // em "Entrar com Apple") resolvem a mesma conta e ambas chegam aqui
        // sem ver a conta ainda. A segunda apenas recupera a conta que a
        // primeira já criou e segue o login normalmente.
        if (!isDuplicateKeyError(err)) {
          throw err;
        }

        // claims.email é garantidamente não-undefined aqui (early return
        // acima, antes de qualquer tentativa de criação) — nenhum fallback
        // necessário.
        const recoveredUser = await UserModel.findOne({
          $or: [{ appleUserId: claims.sub }, { email: claims.email }],
        });

        if (!recoveredUser) {
          throw err;
        }

        user = recoveredUser;
        isNewUser = false;
      }
    }

    // 5. Gerar par de tokens de sessão (mesmas funções usadas por todos os outros fluxos de login)
    const accessToken = generateAccessToken(user.id as string, user.email);
    const refreshToken = generateRefreshToken(user.id as string, user.tokenVersion);

    // 6. Responder como JSON direto — nunca redirect — mesmo formato de register/login
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
          unitSystem: user.unitSystem,
          timezone: user.timezone,
          dailyProteinTarget: user.dailyProteinTarget,
          dailyCalorieTarget: user.dailyCalorieTarget,
          dailyCarbTarget: user.dailyCarbTarget ?? 200,
          dailyFatTarget:
            user.dailyFatTarget ?? calculateFatTargetFromCalories(user.dailyCalorieTarget),
          longestStreak: user.longestStreak ?? 0,
          createdAt: user.createdAt,
        },
        accessToken,
        refreshToken,
        isNewUser,
      },
    });
  } catch (err) {
    next(err);
  }
}
