# Tutorial guiado (coach marks)

O tour que passa por Home, Pulse AI, Blend, Track e Me. O **roteiro é dado**: um arquivo só, servido pela API e embutido no app. O **motor** (mobile) não sabe nada de etapas específicas: lê o roteiro, navega, espera a âncora, destaca e mostra o balão.

| Peça | Onde |
|---|---|
| Schema (formato, limites, condições) | `packages/shared/src/schemas/tutorial.ts` |
| Roteiro (fonte única, en e pt-BR) | `packages/shared/src/tutorial/tutorial.content.ts` |
| API | `apps/api/src/routes/tutorial.ts`, `controllers/tutorial.controller.ts`, `services/tutorial.service.ts`, `models/TutorialProgress.ts` |
| Motor | `apps/mobile/src/features/tutorial/` |
| Catálogo de âncoras desta versão do app | `apps/mobile/src/features/tutorial/tutorialAnchors.ts` |
| Telas por onde o tour passa | `apps/mobile/src/features/tutorial/tutorialScreens.ts` |
| Rotas | `docs/api/endpoints.md`, seção "Tutorial" |

## Como adicionar uma etapa

1. **Marque a âncora na tela.** Embrulhe o elemento:

   ```tsx
   import { TutorialAnchor } from '../features/tutorial/TutorialAnchor';

   <TutorialAnchor id="track.newThing">
     <NewThing />
   </TutorialAnchor>
   ```

   - O id segue `area.nome` (camelCase, separado por ponto).
   - Se o elemento dependia do pai para o layout (`flex: 1` numa linha, padding de seção), passe o mesmo estilo para a âncora (`style={styles.rowPad}`) e tire do filho. O layout tem que ficar igual.
   - Elemento dentro de uma tela com rolagem: a tela já registra o `ScrollView` (`useTutorialScrollRef`). Tela nova com rolagem precisa registrar também.
   - Folha ou modal novo (`<Modal>`): chame `useTutorialBlockingSurface(visível)` no componente. Sem isso, o tour pode tentar abrir com a folha aberta.

2. **Ponha o id no catálogo** (`tutorialAnchors.ts`). O teste `tutorialAnchors.test.ts` quebra se a âncora do roteiro não estiver no catálogo ou se o catálogo tiver id que nenhuma tela usa.

3. **Escreva a etapa no roteiro** (`tutorial.content.ts`):

   ```ts
   {
     id: 'track.newThing',          // estável; nunca reaproveite id de etapa removida
     order: 335,                     // posição; deixe folga (10 em 10)
     screen: 'TrackMain',            // uma das telas de tutorialScreens.ts
     anchor: 'track.newThing',       // sem anchor = balão no centro, sem destaque
     placement: 'below',             // above | below | auto (padrão auto)
     condition: 'notPro',            // opcional: isPro | notPro | hasBlendi | noBlendi
     addedInVersion: 2,              // a contentVersion em que a etapa entrou
     text: {
       en: { title: 'New Thing', body: 'What it does, in one or two sentences.' },
       'pt-BR': { title: 'Coisa nova', body: 'O que faz, em uma ou duas frases.' },
     },
   },
   ```

   Regras do texto (o teste `packages/shared/src/tutorial/tutorialContent.test.ts` checa): sem travessão, sem exclamação, Title Case no título em inglês, título até 48 caracteres e texto até 300 (medidos com cada marcador no maior valor possível), número de limite sempre por marcador (nunca escrito à mão), os dois idiomas obrigatórios, "no ice" nunca (o Lite é "made for powders and fresh fruit"), números de nutrição como estimativa, texto neutro para quem não tem BLENDi (nada de "seu BLENDi" sem `condition: 'hasBlendi'`).

4. **Número no texto? Use marcador** (seção abaixo).

5. **Suba `contentVersion`** no topo do roteiro (1 → 2). Mudou só um texto? Suba também: é o que diz "este roteiro mudou". O ETag da API é calculado do conteúdo, então o app baixa o roteiro novo mesmo se alguém esquecer.

6. **Rode os testes:** `pnpm test` na raiz (build do shared + suítes do shared, da API e do mobile), ou cada um: `pnpm --filter @blendi/shared test`, `pnpm --filter @blendi/api test`, `pnpm --filter @blendi/mobile test`.

Condição nova (fora das quatro) ou mudança no formato: suba `TUTORIAL_SCHEMA_VERSION`. App antigo recusa o roteiro do servidor inteiro e fica com a cópia embutida dele (não quebra, só não vê as novidades).

## Marcadores no texto

Número de limite do plano ou quantidade que depende da conta não vai escrito no texto: vai como marcador, e o app preenche na hora de mostrar a etapa.

| Marcador | Vira | Fonte |
|---|---|---|
| `{{waterGlass}}` | copo da ação rápida na unidade da conta: "250 ml" (métrico) ou "8.5 fl oz" (imperial) | `QUICK_WATER_GLASS_ML` formatado por `useUnits().displayVolume`, o mesmo formatador do botão |
| `{{freeAiPerDay}}` | receitas do Pulse AI por dia no plano grátis | `FREE_PULSE_AI_MESSAGES_PER_DAY` |
| `{{freeScansPerMonth}}` | scans do Pantry por mês no plano grátis | `FREE_PANTRY_SCANS_PER_MONTH` |
| `{{missionsPerDay}}` | missões diárias | `DAILY_MISSIONS_PER_DAY` |

Os números ficam em `packages/shared/src/planLimits.ts`, a fonte única que a API e o app também usam para aplicar os limites. Mudou um limite lá, o tour acompanha sozinho.

Escreva exatamente `{{nome}}`, sem espaços. Marcador desconhecido, chave solta (`{{` ou `}}` sobrando) ou marcador vazio deixam o roteiro inválido no schema.

### Como criar um marcador novo

1. Ponha o nome em `TUTORIAL_MARKERS` e o tamanho máximo do valor preenchido em `TUTORIAL_MARKER_MAX_LENGTH` (`packages/shared/src/schemas/tutorial.ts`). O limite do balão é medido com esse tamanho.
2. Se for um número do produto, crie a constante em `planLimits.ts` e use-a também onde a API/app aplicam a regra.
3. Preencha o valor em `apps/mobile/src/features/tutorial/tutorialMarkers.ts` (`buildTutorialMarkerValues`). Valor que depende da conta (unidade, idioma) vem do `TutorialProvider`.
4. **Suba `TUTORIAL_SCHEMA_VERSION`.** O app antigo não conhece o marcador: recusa o roteiro do servidor (schemaVersion maior) e usa a cópia embutida dele, que não tem o marcador. Nunca mostra `{{...}}` cru. Como segunda proteção, se sobrar marcador depois de preencher, a etapa é pulada (`invalidText`).
5. Teste em `packages/shared/src/tutorial/tutorialContent.test.ts` e em `apps/mobile/src/features/tutorial/tutorialMarkers.test.tsx`.

A schemaVersion 1 nunca foi publicada sem marcadores (CP-C2 e CP-C2a saem juntos), então ela já inclui os quatro acima.

## O que acontece com quem já viu o tour

- O progresso fica na conta (`tutorial_progress`): `seenStepIds` são as etapas já tratadas.
- Ao **Concluir** ou **Pular**, todas as etapas que aquela versão do app sabe mostrar entram em `seenStepIds`, inclusive as de condição falsa e as cuja âncora não apareceu. Assim o tour não volta sozinho.
- Na próxima abertura da Home depois de uma atualização, entram só as etapas com id ainda não visto (**modo novidades**), com a abertura `whatsNewIntro`. Sem etapa nova aplicável, nada aparece.
- Etapa que aponta para tela ou âncora que a versão instalada não tem (roteiro do servidor mais novo que o app) **não** entra em `seenStepIds`: aparece como novidade quando a pessoa atualizar o app.
- Mudou só o texto de uma etapa existente: quem já viu não vê de novo (o id é o mesmo). Para mostrar de novo, crie uma etapa com id novo.
- "Ver tutorial de novo" (Me) apaga o progresso e começa da primeira etapa.

## Como testar

- **Automático:** `features/tutorial/*.test.ts(x)` usam um roteiro de teste (`testUtils/tutorialTestKit.ts`), não o real. O roteiro real é testado por `tutorialAnchors.test.ts` e `tutorialMarkers.test.tsx` no mobile (âncoras, telas, marcadores preenchidos) e no shared por `tutorialContent.test.ts` (schema, marcadores, regras de texto). A API testa o serviço (`tutorial.service.test.ts`) e as rotas.
- **No aparelho, tour completo:** Me → "Ver tutorial de novo".
- **Modo novidades no aparelho (dev):** adicione uma etapa com id novo no roteiro, suba `contentVersion`, rode a API local e abra o app numa conta que já concluiu o tour.
- **Sem rede:** com o modo avião, o app usa o último roteiro baixado ou a cópia embutida; o progresso fica no aparelho e vai para o servidor quando a rede volta.
- Logs em dev: `[tutorial] etapa pulada: <id> (<motivo>)`. Motivos: `condition`, `route`, `anchorUnknown`, `anchorTimeout`, `duplicate`, `invalidText`.

## Quando o tour abre (e quando não)

- Na Home, uma vez por sessão do app, 0,9 s depois de a Home ficar livre.
- Nunca com folha/modal aberto, celebração de nível, rota de raiz por cima (paywall, Minhas metas, Alergias...) ou alerta do sistema (app `inactive`). Se um desses aparecer no meio, o tour pausa e retoma a mesma etapa.
- Âncora que não aparece em 5 s (tela sem dados, elemento condicional como o seletor Timer/Passo a passo sem receita) é pulada em silêncio.

## Analytics (PostHog)

`tutorial_started` (`mode`: full, whatsNew, review), `tutorial_step_viewed` (`step_id`, `index`, `total`), `tutorial_skipped` (`step_id`, `mode`), `tutorial_completed` (`mode`), `tutorial_step_unavailable` (`step_id`, `reason`). Nenhum dado pessoal.
