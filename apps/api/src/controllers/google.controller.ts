// apps/api/src/controllers/google.controller.ts
// Handlers HTTP para o fluxo Google OAuth 2.0.
//
// Cada handler segue o contrato padrão da API:
//   Sucesso → { success: true, data: { ... } }
//   Erro    → { success: false, message: '<chave i18n>' }
//
// As mensagens são SEMPRE chaves de i18n — nunca texto traduzido.
//
// ── Fluxo completo ────────────────────────────────────────────────────────────
//
//   1. App mobile chama GET /auth/google/url
//      → recebe a URL de autorização do Google
//
//   2. App mobile abre a URL no browser
//      → usuário autoriza no Google
//      → Google redireciona para GET /auth/google/callback?code=...&state=...
//
//   3. Backend valida o state (CSRF), troca o código pelo perfil do usuário
//      e executa login, vinculação ou registro automático
//
//   4. (CP-1.1.1d) Em vez de tokens, o callback cria um código de uso único
//      e redireciona para blendipulse://auth/callback?code=... — sem tokens
//      nem dados do usuário na URL. O app troca o código + o verificador
//      (PKCE) em POST /auth/google/exchange pelos tokens e pelo usuário.
//      No Android, outro app que registre o esquema blendipulse:// pode
//      receber o deep link; sem o verificador, que só o app tem em memória,
//      o código não serve para nada.

import type { Request, Response, NextFunction } from 'express';
import { addMonths } from 'date-fns';
import jwt from 'jsonwebtoken';
import {
  googleAuthUrlQuerySchema,
  googleCallbackSchema,
  googleExchangeSchema,
  GOOGLE_CODE_CHALLENGE_PATTERN,
} from '@blendi/shared';
import { UserModel, type UserDocument } from '../models/User';
import {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  getUserInfoFromToken,
} from '../services/google.service';
import {
  generateAccessToken,
  generateRefreshToken,
} from '../services/auth.service';
import { EmailService } from '../services/email.service';
import {
  consumeGoogleAuthCode,
  createGoogleAuthCode,
} from '../services/googleAuthCode.service';
import { env } from '../config/env';
import { getAccountCreationBodyProfileDefaults } from '../utils/accountDefaults.utils';
import { calculateFatTargetFromCalories } from '../utils/macroCalculation.utils';
import {
  sendErrorResponse,
  VALIDATION_ERROR_CODE,
  VALIDATION_ERROR_MESSAGE,
} from '../utils/error.utils';
import { serializeUserProfile } from '../utils/userProfile.utils';

// Instância única compartilhada pelos handlers
const emailService = new EmailService();

function isDuplicateKeyError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

/** Extrai o desafio PKCE do payload do state já verificado. */
function getCodeChallengeFromState(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('codeChallenge' in payload)) {
    return null;
  }

  const { codeChallenge } = payload as { codeChallenge?: unknown };
  return typeof codeChallenge === 'string' && GOOGLE_CODE_CHALLENGE_PATTERN.test(codeChallenge)
    ? codeChallenge
    : null;
}

// ─── Handler 1: GET /auth/google/url ─────────────────────────────────────────

/**
 * Gera e retorna a URL de autorização do Google para o app mobile.
 *
 * Query obrigatória: `codeChallenge` — SHA-256 do verificador gerado pelo
 * app, em base64url (43 caracteres). Sem ele (ou fora do formato): 400.
 *
 * O `state` é um JWT de 10 minutos assinado com JWT_ACCESS_SECRET.
 * Serve como proteção CSRF: o Google o devolve intacto no callback,
 * onde é verificado antes de processar o código de autorização. Leva
 * também o desafio, para o callback ligá-lo ao código de uso único.
 *
 * Resposta: { success: true, data: { url: string } }
 */
export async function getGoogleUrl(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = googleAuthUrlQuerySchema.safeParse({
      codeChallenge: req.query.codeChallenge,
    });

    if (!parsed.success) {
      sendErrorResponse(res, {
        statusCode: 400,
        code: VALIDATION_ERROR_CODE,
        message: VALIDATION_ERROR_MESSAGE,
        errors: [{ field: 'codeChallenge', message: 'errors.validation.invalid_option' }],
      });
      return;
    }

    // State JWT: payload mínimo, expiração curta, assina com o secret existente.
    // Leva a flag de origem e o desafio PKCE (hash público, não é segredo:
    // sem o verificador, que nunca sai do app até a troca, ele não serve).
    const state = jwt.sign(
      { csrf: true, codeChallenge: parsed.data.codeChallenge },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '10m' }
    );

    const url = getAuthorizationUrl(state);

    res.status(200).json({ success: true, data: { url } });
  } catch (err) {
    next(err);
  }
}

// ─── Handler 2: GET /auth/google/callback ─────────────────────────────────────

/**
 * Processa o callback do Google após autorização do usuário.
 *
 * Recebe `code`, `state` e opcionalmente `error` na query string.
 * Executa validação CSRF, troca de código e lógica de login/vinculação/registro.
 *
 * ── Três casos possíveis ──────────────────────────────────────────────────────
 *
 *   Caso 1 — googleId já existe no banco:
 *     Usuário já fez login via Google antes → login direto.
 *
 *   Caso 2 — Email existe no banco sem googleId:
 *     Usuário se cadastrou com email/senha → vincula o googleId (e foto de perfil)
 *     à conta existente sem perder nenhum dado → login.
 *
 *   Caso 3 — Nenhum usuário encontrado:
 *     Primeiro acesso via Google → cria nova conta com valores padrão de onboarding.
 *     O app mobile pedirá os dados complementares (modelo, meta, targets) após o login.
 *
 * Resposta: redirect para blendipulse://auth/callback?code=<código de uso único>
 *   - Nenhum token nem dado do usuário na URL (CP-1.1.1d): o app troca o
 *     código + verificador em POST /auth/google/exchange.
 *   - O browser detecta o esquema blendipulse:// e fecha automaticamente.
 *   - openAuthSessionAsync captura a URL e a entrega ao hook useGoogleAuth.
 *   - Erros redirecionam com ?error=<chave_i18n> para que o app exiba a mensagem correta.
 */
export async function handleGoogleCallback(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { error, code, state } = req.query as Record<string, string | undefined>;

    // ── Passo 1: verificar se o usuário cancelou a autorização no Google ───────
    if (error) {
      res.redirect('blendipulse://auth/callback?error=errors.auth.google_cancelled');
      return;
    }

    // ── Passo 2: verificar state CSRF ─────────────────────────────────────────
    // O state deve existir e ser um JWT válido e não expirado.
    // Protege contra ataques onde um agente externo forja o callback.
    if (!state) {
      res.redirect('blendipulse://auth/callback?error=errors.auth.invalid_state');
      return;
    }

    let codeChallenge: string | null;
    try {
      const statePayload = jwt.verify(state, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
      codeChallenge = getCodeChallengeFromState(statePayload);
    } catch {
      res.redirect('blendipulse://auth/callback?error=errors.auth.invalid_state');
      return;
    }

    // State sem desafio (ex.: emitido antes desta versão): não há como ligar
    // o código a um verificador, então é tratado como state inválido.
    if (!codeChallenge) {
      res.redirect('blendipulse://auth/callback?error=errors.auth.invalid_state');
      return;
    }

    // ── Passo 3: validar código com Zod ───────────────────────────────────────
    // googleCallbackSchema valida que `code` é uma string não vazia.
    const parsed = googleCallbackSchema.safeParse({ code });
    if (!parsed.success) {
      res.redirect('blendipulse://auth/callback?error=errors.validation.required');
      return;
    }

    // ── Passo 4: trocar código pelo perfil verificado do Google ───────────────
    // exchangeCodeForTokens → id_token (JWT assinado pelo Google)
    // getUserInfoFromToken → verifica assinatura RS256 + extrai dados do usuário
    let userInfo;
    try {
      const idToken = await exchangeCodeForTokens(parsed.data.code);
      userInfo = await getUserInfoFromToken(idToken);
    } catch {
      // Código inválido, expirado, já utilizado ou falha na verificação do token
      res.redirect('blendipulse://auth/callback?error=errors.auth.google_auth_failed');
      return;
    }

    // Rejeita ANTES de qualquer lookup no banco — usar um e-mail não
    // verificado tanto para login/registro (Caso 3) quanto, principalmente,
    // para vincular a uma conta existente (Caso 2) permitiria que alguém
    // com um e-mail que não controla de verdade assumisse a conta de quem
    // já tem esse endereço cadastrado no BLENDi.
    if (!userInfo.emailVerified) {
      res.redirect('blendipulse://auth/callback?error=errors.auth.email_not_verified');
      return;
    }

    // ── Passo 5: lógica de login / vinculação / registro ──────────────────────

    let user: UserDocument | null = await UserModel.findOne({ googleId: userInfo.googleId });
    let isNewUser = false;

    if (!user) {
      // Nenhuma conta com esse googleId — buscar por email
      // select('+googleId') — precisa do valor atual pra checar conflito
      // abaixo (select: false por padrão).
      // Cast: a sobrecarga de .select(string) do Mongoose não propaga
      // IUserMethods no tipo de retorno (limitação conhecida da tipagem) —
      // o método comparePassword existe em runtime independente da
      // projeção, só a inferência de tipo não reflete isso aqui.
      user = (await UserModel.findOne({ email: userInfo.email }).select('+googleId')) as
        | UserDocument
        | null;

      if (user) {
        // Caso 2: conta existente com email/senha → vincula o Google
        if (user.googleId && user.googleId !== userInfo.googleId) {
          // Esta conta já está vinculada a uma conta Google DIFERENTE —
          // nunca sobrescrever silenciosamente (perderia o vínculo antigo
          // sem que o usuário saiba). Cenário improvável (o mesmo email
          // verificado pertencendo a duas contas Google distintas), mas sem
          // esta checagem o segundo login resolveria a mesma conta sem
          // nenhum aviso.
          res.redirect('blendipulse://auth/callback?error=errors.auth.google_account_conflict');
          return;
        }

        // Salva googleId e foto de perfil sem alterar nenhum outro dado
        user.googleId = userInfo.googleId;
        user.profilePhoto = userInfo.picture;
        await user.save();
      } else {
        // Caso 3: primeiro acesso via Google → cria nova conta
        // Valores padrão de onboarding — o app mobile pedirá os dados reais
        // na tela de onboarding logo após o primeiro login
        //
        // weightGoal/biologicalSex/activityLevel/birthDate (getAccountCreationBodyProfileDefaults)
        // são placeholders pelo mesmo motivo de auth.controller.ts (register):
        // obrigatórios no modelo desde cp-a-macros.md, mas o Google OAuth não
        // fornece nenhum deles — sem isso, esta chamada sempre falhava com
        // ValidationError (causa raiz do cadastro via Google quebrado).
        try {
          user = await UserModel.create({
            email: userInfo.email,
            name: userInfo.name,
            googleId: userInfo.googleId,
            profilePhoto: userInfo.picture,
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
          // E-mail de boas-vindas — disparo não bloqueante, falha silenciosa
          void emailService.sendWelcomeEmail(user.name, user.email, user.locale);
        } catch (err) {
          // Corrida entre os lookups acima (googleId/email) e este create: duas
          // chamadas concorrentes do callback (ex: duplo toque em "Entrar com
          // Google") resolvem a mesma conta Google e ambas chegam aqui sem ver
          // a conta ainda. Sem este catch, o MongoServerError (E11000) subia cru
          // até o errorHandler — que o trata como "deliberado" só por ter
          // `.code` numérico definido, e devolve esse código crú (não no formato
          // domínio/erro) com a mensagem interna do driver exposta, mesmo em
          // produção. Aqui, a segunda requisição apenas recupera a conta que a
          // primeira já criou e segue o login normalmente — nenhuma delas falha.
          if (!isDuplicateKeyError(err)) {
            throw err;
          }

          const recoveredUser = await UserModel.findOne({
            $or: [{ googleId: userInfo.googleId }, { email: userInfo.email }],
          });

          if (!recoveredUser) {
            throw err;
          }

          user = recoveredUser;
          isNewUser = false;
        }
      }
    }

    // ── Passo 6: código de uso único e redirect para o deep link do app ───────
    // Sem tokens nem usuário na URL: só o código, que exige o verificador do
    // app na troca (POST /auth/google/exchange) e vale por ~2 minutos.
    // O browser detecta o esquema blendipulse:// e fecha automaticamente.
    const appCode = await createGoogleAuthCode({
      userId: user.id as string,
      codeChallenge,
      isNewUser,
    });

    const params = new URLSearchParams({ code: appCode });
    res.redirect(`blendipulse://auth/callback?${params.toString()}`);
  } catch (err) {
    next(err);
  }
}

// ─── Handler 3: POST /auth/google/exchange ───────────────────────────────────

const GOOGLE_EXCHANGE_FAILED = {
  statusCode: 401,
  code: 'auth/google-exchange-failed',
  message: 'Google sign-in could not be completed. Please try again.',
} as const;

/**
 * Troca o código de uso único do deep link + o verificador PKCE pelos tokens
 * e pelo usuário (CP-1.1.1d).
 *
 * Body: { code, codeVerifier }
 *
 * O código é consumido de forma atômica (uso único, mesmo que a checagem do
 * verificador falhe depois). Qualquer falha — corpo inválido, código
 * inexistente, já usado, expirado ou verificador errado, usuário apagado —
 * devolve o MESMO erro genérico, sem dizer o motivo.
 *
 * Resposta: { success: true, data: { user, accessToken, refreshToken, isNewUser } }
 *   — mesmo formato do login por e-mail (mais isNewUser, como no Apple), com
 *   o usuário completo pelo serializador do GET /users/me.
 */
export async function exchangeGoogleCode(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const parsed = googleExchangeSchema.safeParse(req.body);
    if (!parsed.success) {
      sendErrorResponse(res, GOOGLE_EXCHANGE_FAILED);
      return;
    }

    const consumed = await consumeGoogleAuthCode(parsed.data.code, parsed.data.codeVerifier);
    if (!consumed) {
      sendErrorResponse(res, GOOGLE_EXCHANGE_FAILED);
      return;
    }

    // Lido de novo (e não do callback) para devolver o estado atual completo.
    const user = await UserModel.findById(consumed.userId).lean();
    if (!user) {
      sendErrorResponse(res, GOOGLE_EXCHANGE_FAILED);
      return;
    }

    const userId = String(user._id);
    const accessToken = generateAccessToken(userId, user.email);
    const refreshToken = generateRefreshToken(userId, user.tokenVersion);

    res.status(200).json({
      success: true,
      data: {
        user: serializeUserProfile(user),
        accessToken,
        refreshToken,
        isNewUser: consumed.isNewUser,
      },
    });
  } catch (err) {
    next(err);
  }
}
