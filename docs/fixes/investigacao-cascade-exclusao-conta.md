# Investigação — exclusão de conta e cascade de dados do usuário

**Pergunta:** a ausência de cascade encontrada durante a limpeza de testes do CP-C
(`UserModel.deleteMany` não apaga `Conversation`/`AiCache`/`DailyMission`/`XPLog`
órfãos) também existe num fluxo real de exclusão de conta em produção?
**Método:** investigação pura, nenhuma linha de código alterada — só leitura, em
2026-10-23.

---

## 1 — Existe algum fluxo de exclusão (ou desativação) de conta hoje?

**Não.** Busca completa, sem resultado:

- Nenhuma rota `DELETE` em toda a API apaga um `User`. Todas as rotas `DELETE`
  existentes (`apps/api/src/routes/*.ts`) são: `favoritesRouter.delete('/:id', ...)`,
  `shoppingListRouter.delete('/:listId', ...)`, `shoppingListRouter.delete('/:listId/items/checked', ...)`,
  `pulseAiRouter.delete('/cache', ...)`, `usersRouter.delete('/profile-photo', ...)`,
  `supplementStackRouter.delete('/:id/check', ...)`, `supplementStackRouter.delete('/:id', ...)`
  — nenhuma delas é `/users/me` ou equivalente.
- Nenhuma função exportada de `user.controller.ts` apaga o documento do usuário —
  lista completa das 11 funções exportadas: `getMe`, `uploadProfilePhoto`,
  `getMyProfilePhoto`, `deleteProfilePhoto` (apaga só a sub-coleção `UserPhoto`, não
  a conta), `updatePushToken`, `updateNotificationPreferences`, `updateDailyPulseTime`,
  `markCleaned`, `updateMe`, `getWeightHistory`, `calculateMacros`.
- Busca por termos (`deleteAccount`, `delete.?account`, `excluir.?conta`,
  `account.?deletion`) em `apps/api/src` e `apps/mobile/src`: zero ocorrências.
- O schema do `User` tem um campo `isActive: boolean` (`User.ts:59,217,299,700`),
  **lido** em `auth.controller.ts:281` (`if (!user || !user.isActive) {...}`, um
  gate de login) — ou seja, a infraestrutura para um "soft-delete"/desativação já
  existe no modelo de dados. Mas busca completa confirma que **nada no código
  jamais escreve `isActive: false`** num documento de usuário — é um campo com
  default (provavelmente `true`) que nunca é alterado por nenhum controller. É
  infraestrutura morta para uma funcionalidade que nunca foi conectada do lado da
  escrita.

**Conclusão do ponto 1: não há bug ativo em produção hoje**, porque não existe
nenhuma forma — soft ou hard — de um usuário excluir ou desativar a própria conta
neste app, nem no backend nem no mobile.

## 2 — Se esse fluxo for construído no futuro, o mesmo gap se repete?

Sim, do jeito mais simples de implementar (`UserModel.deleteOne({ _id: userId })`
sozinho, sem mais nada). Mapeamento completo de **todo** model que tem um campo
`userId` (candidato a ficar órfão numa exclusão sem cascade), por busca em todos os
arquivos de `apps/api/src/models/`:

| Coleção | Tem TTL? | Duração | Teria dado real de usuário órfão |
|---|---|---|---|
| `ConversationModel` | Sim | 90 dias (`CONVERSATION_TTL_SECONDS`) | Histórico de conversas com a Pulse AI |
| `AiCacheModel` | Sim | 7 dias (`CACHE_CONFIG.PULSE_AI_RESPONSES_TTL`) | Cache de receitas geradas |
| `DailyMissionModel` | Sim | 90 dias (`DAILY_MISSION_TTL_SECONDS`) | Progresso de missões diárias |
| `XPLogModel` | Sim | 90 dias (`XP_LOG_TTL_SECONDS`) | Histórico de XP ganho |
| `HydrationLogModel` | Sim | 365 dias (`HYDRATION_LOG_TTL_SECONDS`) | Histórico de hidratação |
| `SupplementLogModel` | Sim | 365 dias (`SUPPLEMENT_LOG_TTL_SECONDS`) | Histórico de suplementos tomados |
| `NotificationLogModel` | Sim | 3 dias (`NOTIFICATION_LOG_TTL_SECONDS`) | Histórico de notificações enviadas |
| `WeeklyReportModel` | Sim | 90 dias (`WEEKLY_REPORT_TTL_SECONDS`) | Relatórios semanais gerados |
| `BlendLogModel` | **Não** | — (permanente) | Histórico de blends/receitas feitas |
| `FavoriteModel` | **Não** | — (permanente) | Receitas favoritadas |
| `ShoppingListModel` | **Não** | — (permanente) | Listas de compras |
| `UserPhotoModel` | **Não** | — (permanente) | **Foto de perfil real do usuário** (binário, não só metadado) |

**O ponto mais sensível: 4 coleções não têm TTL nenhum** — `BlendLogModel`,
`FavoriteModel`, `ShoppingListModel` e `UserPhotoModel` persistiriam **para sempre**,
sem nenhuma autolimpeza, referenciando um `userId` que não corresponde a mais
nenhuma conta. `UserPhotoModel` é o caso mais delicado: não é só um registro
textual, é a foto de perfil real do usuário (binário), persistida indefinidamente
mesmo após uma eventual exclusão de conta — exatamente o tipo de dado que um
pedido de exclusão (LGPD/GDPR-like) deveria cobrir.

As outras 8 coleções têm TTL e eventualmente se autolimpam (3 dias a 1 ano,
dependendo da coleção) — então, para elas, o gap é uma questão de retenção
temporária indevida, não permanente.

## 3 — Isto é um achado novo ou só uma extensão do que já foi visto no CP-C?

É uma extensão do mesmo mecanismo (falta de cascade em `Conversation`/`AiCache`/
`DailyMission`/`XPLog`, descoberto durante a limpeza de testes do CP-C), mas
**mais abrangente**: a investigação de teste só cobriu as 4 coleções que os fluxos
de Pulse AI/Pantry Scanner tocam; o mapeamento aqui cobre as 12 coleções que
`userId` aparece em todo o backend, incluindo 4 sem nenhuma rede de segurança de
TTL.

---

## Resumo

Não há exclusão de conta implementada hoje (nem hard, nem soft) — então este não é
um bug ativo, é uma lacuna de funcionalidade futura. Se/quando um fluxo de exclusão
de conta for construído, ele vai precisar de cascade explícito para pelo menos 12
coleções, com atenção especial às 4 sem TTL (`BlendLog`, `Favorite`, `ShoppingList`,
`UserPhoto`) — persistência indefinida de dado de usuário excluído, a mais crítica
delas sendo `UserPhoto` por conter uma foto real. Nenhum código alterado nesta
investigação.
