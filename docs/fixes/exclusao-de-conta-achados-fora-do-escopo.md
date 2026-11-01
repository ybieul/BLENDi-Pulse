# Exclusão de conta (fix-before-launch) — achados fora do escopo (Tarefa 5)

**Contexto:** checkpoint "Fix Before Launch" #1 do feature brief de outubro/2026
(requisito de loja — Apple Guideline 5.1.1(v) / Google Play). Implementado em
4 tarefas: `DELETE /users/me` transacional (Tarefa 1), varredura de handlers
contra usuário já excluído (Tarefa 2), botão + confirmação forte no mobile
(Tarefa 3), integração store/API (Tarefa 4). Este documento cobre só a
Tarefa 5 — achados relevantes encontrados no caminho, **sem nenhuma correção**,
conforme pedido no brief.

---

## 1 — Cobertura de coleções: confirmada completa, nenhuma lacuna

A investigação prévia de 2026-10-23 (`investigacao-cascade-exclusao-conta.md`)
já havia mapeado **12 collections** com campo `userId` candidatas a ficar
órfãs sem cascade explícito. Reconferi essa lista contra o código atual
(`grep -l "userId" apps/api/src/models/*.ts`) e ela continua exata: `AiCache`,
`BlendLog`, `Conversation`, `DailyMission`, `Favorite`, `HydrationLog`,
`NotificationLog`, `ShoppingList`, `SupplementLog`, `UserPhoto`,
`WeeklyReport`, `XPLog`.

O `deleteAccount` implementado na Tarefa 1 cobre as 12: as 11 primeiras via
`Model.deleteMany({ userId }, { session })` dentro da transação, e `AiCache`
via `invalidateUserCache(userId, session)` (reaproveitada, agora aceitando a
sessão da transação). **Nenhuma das 12 ficou de fora** — confirmado também
pelo teste real contra o Atlas (zero documentos remanescentes nas 12 + no
próprio `User`, ver relatório de validação na conversa de implementação).

Os únicos dois outros arquivos de modelo do backend são `User.ts` (apagado
como último passo da transação) e `Otp.ts` — ver achado 2 abaixo.

## 2 — `Otp` não é coberto pela cascade (e não precisa ser)

`Otp.ts` referencia o usuário por **`email`**, não por `userId` — não está na
lista de 12 collections e portanto não entra no `deleteAccount`. Na prática
isso é inofensivo: o OTP de redefinição de senha já tem TTL curto
(`expiresAt` com `expireAfterSeconds: 0`) e é de uso único (`used` + `attempts`
limitado). O único cenário residual possível é alguém excluir a conta com um
OTP de reset de senha pendente e, na mesma janela de minutos, **recriar uma
conta com o mesmo e-mail** — o OTP antigo sobreviveria até expirar por conta
própria, mas não pode ser usado para nada no novo usuário (o fluxo de
verify-otp valida contra o hash do código, não contra `userId`). Não é um bug
de segurança, só uma anotação para não confundir no futuro.

## 3 — `getFavorites` não verifica existência do usuário (inconsistência, não bug)

Todos os outros handlers autenticados revisados na Tarefa 2 (perfil, blend
log, Pulse AI, e também favorite/hydration/supplementLog/supplementStack/
dailyMission/weeklyReport/conversation/shoppingList/pantryScanner/purchase,
revisados por iniciativa própria além do escopo mínimo pedido) buscam o
`User` e respondem `404 resource/not-found` antes de prosseguir.
`getFavorites` (`apps/api/src/controllers/favorite.controller.ts:83-118`) é a
única exceção: ele não consulta `UserModel` e simplesmente faz
`FavoriteModel.find({ userId })`. Com um access token de uma conta recém-
excluída (dentro da janela de até 15 min antes de expirar), isso **não
quebra** — responde `200` com lista vazia, já que a cascade também apagou os
`Favorite` do usuário — mas é inconsistente com o contrato `404` que todos os
outros endpoints equivalentes seguem. Comportamento inofensivo, não corrigido
aqui por estar fora do escopo pontual da Tarefa 2 (que pedia corrigir só o
que "quebra com erro não tratado").

## 4 — Escopo da varredura da Tarefa 2

O brief pediu varredura só nos handlers "mais usados (perfil, blend log,
Pulse AI)". Esses três grupos foram confirmados limpos. Adicionalmente,
revisei por conta própria os 10 controllers restantes (favorite, hydration,
supplementLog, supplementStack, dailyMission, weeklyReport, conversation,
shoppingList, pantryScanner, purchase) — todos seguem o mesmo padrão de
checagem de usuário, com a única exceção do achado 3 acima. Não há mais
nenhuma lacuna conhecida.

## 5 — Partes explicitamente fora de escopo (reconfirmadas, não implementadas)

- **Revogação de token Apple:** reconfirmado que não existe nenhum campo de
  identidade Apple em `User.ts` nem fluxo de Sign in with Apple no código —
  a decisão do brief de adiar isso para quando aquele checkpoint existir
  continua correta, nada a fazer agora.
- **Página web pública de exclusão:** reconfirmado que não existe `apps/web`
  neste monorepo — fora do alcance deste checkpoint, como já previsto.
- **Cancelamento de assinatura RevenueCat/Apple/Google:** não é possível via
  API nesta integração (já documentado em checkpoints anteriores) — a tela
  de confirmação do mobile avisa o usuário sobre isso em vez de tentar fazer.

---

## Status

Investigação complementar concluída (2026-10-29), nenhuma correção aplicada
— por design, essa é a natureza da Tarefa 5. Nenhum achado aqui bloqueia a
conclusão do checkpoint de exclusão de conta.
