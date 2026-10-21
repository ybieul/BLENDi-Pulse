# CP-A.8 — `dailyFatTarget` ausente na criação de conta e sem campo de edição no mobile

**Data:** 2026-10-21
**Base:** [cp-a.7-fallback-onboarding-calculate-macros.md](cp-a.7-fallback-onboarding-calculate-macros.md) (mesma linha de correções de macro/onboarding) e [cp-a.3-targetweight-piso-e-gordura-manual.md](cp-a.3-targetweight-piso-e-gordura-manual.md) (que já tinha implementado edição manual de `dailyFatTarget` no backend — validação Zod, recálculo automático em `updateMe` e aviso não-bloqueante de faixa — mas nunca expôs isso no app mobile).
**Escopo:** backend (criação de conta nos 2 fluxos existentes + 7 pontos de resposta de API) + mobile (tipos TS, sheet de edição, tela de settings, i18n en/pt-BR) + backfill real no Atlas, nas 3 contas pré-existentes que já estavam sem o campo. Nenhuma outra funcionalidade tocada — avisos de edição manual (`macroEditWarnings`) continuam não exibidos no mobile para nenhum macro (pré-existente, não é escopo desta correção), e prompts de IA (Pulse AI/Pantry Scanner) continuam sem menção à meta de gordura (extensão de produto, não bug).
**Método:** subi o servidor de dev (`pnpm --filter @blendi/shared build` + `pnpm dev` em `apps/api`, porta 3000) conectado ao MongoDB Atlas real (banco `test`). Dois scripts de teste temporários (`cpfat-verify-tmp.ts`, antes da correção, e `cpfat-verify2-tmp.ts`, depois) criaram e removeram suas próprias contas descartáveis, com confirmação independente de limpeza em processo separado nos dois casos. Um terceiro script (`cpfat-spotcheck-tmp.ts`) leu, sem modificar, os documentos reais já existentes na coleção pra conferir o resultado do backfill. Todos os scripts temporários foram apagados ao final; o script de backfill (`apps/api/scripts/backfill-daily-fat-target.ts`) foi mantido no repositório, por ser um utilitário operacional (mesmo padrão de `apps/api/scripts/validate-notifications.ts`, já existente), não um script de teste descartável.

---

## Origem

Ao testar no Expo Go após a finalização do CP-A, o usuário notou que não existe nenhum campo para editar a meta de gordura na tela de perfil (só proteína/carboidratos/calorias existem). Investigação inicial (sem alterar código) confirmou duas lacunas distintas, não uma só:

1. **Mobile**: nenhuma linha de settings, nenhum `editingType`, nenhum tipo TS mencionava `dailyFatTarget` em lugar nenhum do app — o app nunca tinha pedido nem lido esse valor.
2. **Backend**: `dailyFatTarget` nunca é setado em `UserModel.create()` (nem no registro direto, nem no login via Google), e o schema Mongoose não tem `default` para ele — diferente de `dailyCarbTarget`, que tem `default: 200` (`apps/api/src/models/User.ts:509-521`, não alterado por esta correção).

## Tarefa 1 — Diagnóstico: causa raiz confirmada por teste real (antes da correção)

Conta de teste descartável criada via `POST /auth/register`, documento lido **bruto** direto da coleção `users` no Atlas (driver nativo do Mongo, sem nenhuma camada de serialização/default do Mongoose por cima):

```
REGISTER_STATUS: 201
HAS_dailyFatTarget_KEY: false
HAS_dailyCarbTarget_KEY: true
dailyFatTarget_VALUE: undefined
dailyCarbTarget_VALUE: 200
```

**Confirmado:** a chave `dailyFatTarget` simplesmente não existia no documento — não era `0`, nem "não exibido", estava mesmo ausente. Consistente com a leitura de código: nem `auth.controller.ts` nem `google.controller.ts` tocam nesse campo na criação, e nenhum `default` no schema o preenche.

## Tarefa 2 — Correção backend

### 2.1 — Fórmula extraída como função reutilizável, fonte única

`dailyFatTarget` já era calculado dentro de `calculateMacroTargets` como `30% das calorias ÷ 9 kcal/g` (`apps/api/src/utils/macroCalculation.utils.ts`). Essa fórmula depende só de `dailyCalorieTarget` — nenhum dos outros inputs físicos (peso/altura/idade/sexo/atividade) entra nela —, o que permite reaproveitá-la em lugares que não têm esses outros dados disponíveis (criação de conta, fallback de leitura). Extraída como função exportada, citação literal (`macroCalculation.utils.ts:228-240`):

```ts
/**
 * Meta de gordura derivada só de dailyCalorieTarget (30% das calorias,
 * 9 kcal/g) — extraída de dentro de calculateMacroTargets pra ser
 * reaproveitada onde os outros inputs físicos (peso/altura/idade/sexo) não
 * estão disponíveis: criação de conta (auth/google) e fallback de leitura
 * pra contas sem dailyFatTarget salvo (ver
 * docs/fixes/cp-a.8-dailyfattarget-criacao-de-conta-e-campo-mobile.md).
 * Resultado sempre dentro de DAILY_FAT_TARGET_MIN/MAX (0-600), já que
 * dailyCalorieTarget é clampado em 300-15000 (15000×0,3÷9=500).
 */
export function calculateFatTargetFromCalories(dailyCalorieTarget: number): number {
  return Math.round((dailyCalorieTarget * 0.3) / 9);
}
```

A linha original dentro de `calculateMacroTargets` (antes: `const dailyFatTarget = Math.round(dailyFatCalories / 9);`) foi substituída por uma chamada a essa função (`macroCalculation.utils.ts:213`: `const dailyFatTarget = calculateFatTargetFromCalories(dailyCalorieTarget);`) — fórmula com fonte única, sem duplicação, sem mudar nenhum valor já calculado (`dailyCalorieTarget * 0.3 / 9` é exatamente a mesma conta de antes, só reescrita como função).

**Desvio deliberado do padrão de `dailyCarbTarget`:** `dailyCarbTarget: 200` no schema é um número fixo arbitrário, correto só por coincidência para quem tem uma meta calórica próxima da assumida. Gordura, ao contrário de carboidrato, é uma função direta e simples das calorias — por isso a correção não copiou o padrão "`default` fixo no Mongoose", e sim computou o valor certo a partir da `dailyCalorieTarget` real de cada conta, tanto na criação quanto em toda leitura. Nenhuma mudança foi feita em `apps/api/src/models/User.ts` (nem no schema nem na interface `IUser`) — o problema foi resolvido inteiramente na camada de controllers, não adicionando um `default` que seria impreciso para qualquer `dailyCalorieTarget` diferente do assumido.

### 2.2 — Criação de conta passa a setar o campo de verdade

- `apps/api/src/controllers/auth.controller.ts:116` (dentro do `UserModel.create` de `register`): `dailyFatTarget: calculateFatTargetFromCalories(dailyCalorieTarget),` — usa a `dailyCalorieTarget` que o próprio cliente envia no registro (campo obrigatório de `registerSchema`), nunca um valor fixo.
- `apps/api/src/controllers/google.controller.ts:197` (dentro do `UserModel.create` do Case 3 — primeira conta via Google): `dailyFatTarget: calculateFatTargetFromCalories(2000),` — `2000` é o mesmo valor fixo que esse fluxo já usa pra `dailyCalorieTarget` nesse ponto (`google.controller.ts`, linha logo acima), não um número novo inventado por esta correção.
- Import de `calculateFatTargetFromCalories` adicionado nos dois arquivos (`auth.controller.ts:26`, `google.controller.ts:39`).

### 2.3 — Toda resposta de API que já tratava `dailyCarbTarget ?? 200` passa a tratar `dailyFatTarget` do mesmo jeito, com fallback **calculado** (não fixo)

Padrão aplicado em cada um dos 7 pontos: `dailyFatTarget: user.dailyFatTarget ?? calculateFatTargetFromCalories(user.dailyCalorieTarget),` — isso resolve o bug também para as contas **já existentes**, sem depender de backfill: o valor correto aparece computado na hora, a partir da própria `dailyCalorieTarget` salva de cada usuário.

| Arquivo | Linha(s) | Resposta |
|---|---|---|
| `auth.controller.ts` | 147-148 | `POST /auth/register` |
| `auth.controller.ts` | 228-229 | `POST /auth/login` |
| `google.controller.ts` | 231-232 | callback OAuth do Google (`userPayload`) |
| `user.controller.ts` | 233-234 | `GET /users/me` (`getMe`) — **antes desta correção, essa rota não devolvia `dailyFatTarget` em nenhuma hipótese**, mesmo quando o campo já existia salvo |
| `user.controller.ts` | 1021-1022 | `PATCH /users/me` (`updateMe`) — já devolvia o campo antes, mas sem nenhum fallback (`user.dailyFatTarget` cru, podendo vir `undefined`) |
| `purchase.controller.ts` | 103 | `buildPurchaseProfileResponse` (resposta de verificação de compra) |

`purchase.controller.ts` precisou de um import novo de `calculateFatTargetFromCalories` (linha 18), já que esse arquivo não importava nada de `macroCalculation.utils.ts` antes.

## Tarefa 3 — Correção mobile

### 3.1 — Tipos TypeScript (`dailyFatTarget?: number`, espelhando `dailyCarbTarget`)

- `apps/mobile/src/services/auth.service.ts:40` — interface `AuthUser`.
- `apps/mobile/src/store/auth.store.ts:82` (tipo inline da resposta de `GET /users/me`) **e** `auth.store.ts:130` (objeto de fato retornado por `fetchCurrentUserProfile()` — as duas edições eram necessárias, o tipo sozinho não bastava).
- `apps/mobile/src/services/purchase.service.ts:43` — interface `PurchaseVerifiedUser`.
- `apps/mobile/src/screens/MeScreen.tsx:229` — interface local `UserProfileData`.

### 3.2 — `apps/mobile/src/components/me/EditSettingSheet.tsx`

- `EditSettingType` (linha 42): `'fat'` adicionado ao union.
- `TITLE_KEYS` (linha 71): `fat: 'me.edit.fatTitle'` — esse é um `Record<EditSettingType, TranslationKey>`, então o TypeScript já obrigaria essa entrada a existir (rede de segurança do compilador).
- `isNumericType()` (linha 130): `type === 'fat'` adicionado à condição — sem isso, o sheet renderizaria texto livre em vez de teclado numérico.
- Nada mais precisou mudar nesse arquivo: `renderBody()` já cai no mesmo fallback numérico genérico usado por protein/carbs/calories/hydration, e nenhum dos quatro tem validação de min/max no client (só o backend valida, via Zod em `updateUserSchema`).

### 3.3 — `apps/mobile/src/screens/MeScreen.tsx`

Caso `"fat"` adicionado nos 3 switches por `editingType`, sempre logo depois de `"calories"` (mesma ordem visual da seção de settings):

- `getCurrentEditValue` (linhas 660-661): `return profile?.dailyFatTarget ?? authUser?.dailyFatTarget ?? 67;` — `67` é o resultado da própria fórmula pro baseline de 2000 kcal (mesmo padrão dos outros fallbacks hardcoded já existentes nesse switch: `120` pra proteína, `150` pra carboidrato, `2000` pra calorias — nenhum deles vem de uma fonte "oficial", são só placeholders visuais pro instante antes do perfil carregar).
- Switch de `body` em `handleConfirmEdit` (linhas 705-706): `body = { dailyFatTarget: Number(nextValue) };`.
- Switch de `updateUserProfile` (atualização otimista local, linhas 741-742): `updateUserProfile({ dailyFatTarget: Number(nextValue) });`.
- Novo `SettingRow` (linhas 1762-1764), inserido depois do bloco de calorias e antes do de hidratação:
```tsx
<SettingRow
  label={t("profile.fields.fat_target")}
  value={formatCount(profile?.dailyFatTarget ?? authUser?.dailyFatTarget ?? 0) + t("common.units.grams")}
  onPress={() => { setEditingType("fat"); }}
/>
```
Concatenação do sufixo de unidade sem espaço antes de `t("common.units.grams")` — mesmo padrão exato de protein/carbs (calories é a exceção, com espaço literal antes de `t("common.units.kilocalories")`; fat segue protein/carbs, não calories).

### 3.4 — i18n (`apps/mobile/src/locales/en.json` e `pt-BR.json`)

- `profile.fields.fat_target` (linha 362 nos dois arquivos) — segue o padrão de `protein_target`/`calories_target` (maioria 2-de-3 dos campos existentes nesse namespace; `carbs` é a exceção pré-existente, com chave em `me.settingCarbs`, fora de escopo):
  - en: `"Fat target"`
  - pt-BR: `"Meta de gordura"`
- `me.edit.fatTitle` (linha 691 nos dois arquivos) — padrão 100% consistente entre os 4 títulos já existentes nesse bloco:
  - en: `"Daily Fat Target"`
  - pt-BR: `"Meta de Gordura Diária"`

`common.macros.fat` (já existia antes desta correção, usado em pílulas de macro de receita/blend) não foi tocado — namespace diferente, já correto pro seu próprio uso, sem relação com a tela de settings.

## Tarefa 4 — Backfill real no Atlas

### 4.1 — Script

`apps/api/scripts/backfill-daily-fat-target.ts` (mantido no repositório — não é um script de teste descartável, é um utilitário operacional, mesmo padrão de conexão de `apps/api/scripts/validate-notifications.ts`, já existente). Usa `updateMany` com pipeline de agregação (`$set` computado por documento via `$round`/`$divide`/`$multiply` sobre o próprio `$dailyCalorieTarget` de cada conta — nunca um valor fixo), filtrado por `{ dailyFatTarget: { $exists: false } }`, garantindo que nenhum valor já salvo é sobrescrito.

### 4.2 — Execução real

Rodado contra o banco `test` do Atlas:

```
MISSING_BEFORE: 3
MATCHED: 3 MODIFIED: 3
MISSING_AFTER: 0
```

Conferência pós-backfill (`cpfat-spotcheck-tmp.ts`, lido direto do banco, sem alterar nada, depois apagado) — as 3 contas reais pré-existentes que estavam sem o campo, cada uma com seu próprio `dailyCalorieTarget` salvo, todas batendo exatamente com `round(dailyCalorieTarget × 0,3 ÷ 9)`:

| `dailyCalorieTarget` salvo | `dailyFatTarget` aplicado pelo backfill | Esperado pela fórmula | Bate? |
|---|---|---|---|
| 3317 | 111 | 111 | sim |
| 2000 | 67 | 67 | sim |
| 3234 | 108 | 108 | sim |

(E-mails das 3 contas omitidos deste documento por serem dados reais de usuário — conferidos ao vivo durante a implementação, não incluídos aqui por não serem necessários pra validar a correção.)

## Tarefa 5 — Teste real pós-correção (conta nova, do zero)

Nova conta de teste descartável, `dailyCalorieTarget: 2800` no registro:

```
REGISTER_STATUS: 201
REGISTER_dailyFatTarget_IN_RESPONSE: 93
EXPECTED_dailyFatTarget (2800kcal): 93
HAS_dailyFatTarget_KEY: true
dailyFatTarget_VALUE_IN_DB: 93
MATCHES_FORMULA: true
LOGIN_STATUS: 200
LOGIN_dailyFatTarget_IN_RESPONSE: 93
GETME_STATUS: 200
GETME_dailyFatTarget_IN_RESPONSE: 93
DELETE_RESULT: {"acknowledged":true,"deletedCount":1}
```

**Confirmado:** a chave já nasce presente no documento (ao contrário da Tarefa 1), e as 3 rotas que um app mobile normalmente usa pra popular o perfil (registro, login, `getMe`) devolvem o valor certo — inclusive `getMe`, que antes da correção não devolvia esse campo em hipótese alguma. Conta de teste removida ao final; confirmação independente de limpeza, em processo separado, de 0 remanescentes.

## Limpeza e verificação de ambiente

Durante esta correção, foi identificado e corrigido um achado à parte, não relacionado ao escopo funcional: processos `tsx watch` órfãos de **sessões anteriores** (duas gerações, de conversas passadas) continuavam rodando em segundo plano sem nunca terem sido encerrados — violando a própria convenção já estabelecida nesta linha de correções (encerrar o servidor de dev e confirmar `lsof -i :3000` vazio ao final de cada tarefa). Todos finalizados junto com o servidor usado nesta correção. `git status` final idêntico ao esperado — só os arquivos desta correção modificados/criados, nenhum script temporário remanescente.

---

## Veredito

| Critério de aceite | Resultado |
|---|---|
| Causa raiz do campo ausente identificada e confirmada por teste real | **Confirmado** — Tarefa 1, documento bruto do Mongo sem a chave `dailyFatTarget` antes da correção |
| Criação de conta (registro direto e Google) passa a setar `dailyFatTarget` corretamente | **Confirmado** — Tarefa 5, `HAS_dailyFatTarget_KEY: true` e `MATCHES_FORMULA: true` numa conta nova |
| Toda resposta de API que expõe o perfil do usuário devolve `dailyFatTarget` (inclusive `getMe`, que antes nem incluía a chave) | **Confirmado** — Tarefa 5, os 3 testes (`REGISTER`/`LOGIN`/`GETME`) devolveram o valor certo |
| Contas já existentes sem o campo corrigidas, sem sobrescrever nenhum valor já salvo | **Confirmado** — Tarefa 4.2, 3 de 3 contas corrigidas, valores batendo exatamente com a fórmula aplicada ao `dailyCalorieTarget` real de cada uma |
| Campo de edição de meta de gordura existe no app mobile, seguindo exatamente o mesmo padrão de proteína/carboidratos/calorias | **Confirmado** — Tarefa 3, typecheck limpo em `@blendi/mobile` |
| Nenhuma regressão nos outros macros (proteína/carboidrato/calorias/hidratação) | **Confirmado** — nenhuma lógica pré-existente alterada, só adições; typecheck limpo nos 3 pacotes (`@blendi/shared`, `@blendi/api`, `@blendi/mobile`) |

## Fora de escopo (decisão explícita, não um esquecimento)

- **Avisos de edição manual** (`macroEditWarnings`/`warnings.manualMacroEdit.fatBelowRange` etc., já implementados no backend desde CP-A.3): o mobile nunca exibe esse campo da resposta do `PATCH /users/me`, pra nenhum macro — não é uma lacuna só da gordura, é pré-existente e mais ampla. Corrigir isso é um item separado.
- **Prompts da IA** (Pulse AI / Pantry Scanner): hoje não mencionam a meta de gordura do usuário, ao contrário de proteína/carboidrato/calorias. Ensinar a IA sobre isso é extensão de produto, não correção de bug.
- **Inconsistência de naming `me.settingCarbs` vs `profile.fields.*_target`**: pré-existente, não introduzida nem agravada por esta correção — `fat_target` seguiu a convenção majoritária (`profile.fields.*_target`), deixando a exceção de `carbs` como estava.

## Resumo

`dailyFatTarget` nunca era setado na criação de conta (nem registro direto, nem Google) e o schema não tinha `default` pra ele — diferente de `dailyCarbTarget` (`default: 200`). Corrigido computando o valor real a partir da `dailyCalorieTarget` de cada conta (fórmula já existente, `30% ÷ 9 kcal/g`, extraída como `calculateFatTargetFromCalories`), tanto na criação quanto em 7 pontos de resposta de API — resolvendo o bug tanto para contas novas quanto para as já existentes, sem depender de backfill (ainda que o backfill tenha sido rodado mesmo assim, pra deixar o dado persistido e não só computado na leitura). No mobile, o campo de edição foi adicionado ao `MeScreen` seguindo exatamente o mesmo padrão de proteína/carboidratos/calorias — tipos TS, sheet de edição, `SettingRow` e i18n em en/pt-BR. Nenhum comportamento pré-existente de outros macros foi alterado.
