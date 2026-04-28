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

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { googleCallbackSchema } from '@blendi/shared';
import { UserModel } from '../models/User';
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
import { env } from '../config/env';

// Instância única compartilhada pelos handlers
const emailService = new EmailService();

// ─── Handler 1: GET /auth/google/url ─────────────────────────────────────────

/**
 * Gera e retorna a URL de autorização do Google para o app mobile.
 *
 * O `state` é um JWT de 10 minutos assinado com JWT_ACCESS_SECRET.
 * Serve como proteção CSRF: o Google o devolve intacto no callback,
 * onde é verificado antes de processar o código de autorização.
 *
 * Resposta: { success: true, data: { url: string } }
 */
export async function getGoogleUrl(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // State JWT: payload mínimo, expiração curta, assina com o secret existente.
    // Não contém dados sensíveis — apenas a flag que identifica a origem da requisição.
    const state = jwt.sign({ csrf: true }, env.JWT_ACCESS_SECRET, {
      expiresIn: '10m',
    });

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
 * Resposta: { success: true, data: { user, accessToken, refreshToken, isNewUser } }
 *   - Status 201 se nova conta criada, 200 para login ou vinculação.
 *   - isNewUser: true direciona o app mobile para o fluxo de onboarding.
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
      res.status(400).json({
        success: false,
        message: 'errors.auth.google_cancelled',
      });
      return;
    }

    // ── Passo 2: verificar state CSRF ─────────────────────────────────────────
    // O state deve existir e ser um JWT válido e não expirado.
    // Protege contra ataques onde um agente externo forja o callback.
    if (!state) {
      res.status(400).json({
        success: false,
        message: 'errors.auth.invalid_state',
      });
      return;
    }

    try {
      jwt.verify(state, env.JWT_ACCESS_SECRET);
    } catch {
      res.status(400).json({
        success: false,
        message: 'errors.auth.invalid_state',
      });
      return;
    }

    // ── Passo 3: validar código com Zod ───────────────────────────────────────
    // googleCallbackSchema valida que `code` é uma string não vazia.
    const parsed = googleCallbackSchema.safeParse({ code });
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: 'errors.validation.required',
      });
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
      res.status(401).json({
        success: false,
        message: 'errors.auth.google_auth_failed',
      });
      return;
    }

    // ── Passo 5: lógica de login / vinculação / registro ──────────────────────

    let user = await UserModel.findOne({ googleId: userInfo.googleId });
    let isNewUser = false;

    if (!user) {
      // Nenhuma conta com esse googleId — buscar por email
      user = await UserModel.findOne({ email: userInfo.email });

      if (user) {
        // Caso 2: conta existente com email/senha → vincula o Google
        // Salva googleId e foto de perfil sem alterar nenhum outro dado
        user.googleId = userInfo.googleId;
        user.profilePhoto = userInfo.picture;
        await user.save();
      } else {
        // Caso 3: primeiro acesso via Google → cria nova conta
        // Valores padrão de onboarding — o app mobile pedirá os dados reais
        // na tela de onboarding logo após o primeiro login
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
        });

        isNewUser = true;
        // E-mail de boas-vindas — disparo não bloqueante, falha silenciosa
        void emailService.sendWelcomeEmail(user.name, user.email);
      }
    }

    // ── Passo 6: gerar par de tokens BLENDi ───────────────────────────────────
    const accessToken = generateAccessToken(user.id as string, user.email);
    const refreshToken = generateRefreshToken(user.id as string);

    res.status(isNewUser ? 201 : 200).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          profilePhoto: user.profilePhoto,
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
        /** true se conta criada agora — o mobile usa para direcionar ao onboarding */
        isNewUser,
      },
    });
  } catch (err) {
    next(err);
  }
}
