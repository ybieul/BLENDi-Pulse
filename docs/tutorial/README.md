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

   Regras do texto (o teste `apps/api/src/services/tutorialContent.test.ts` checa): sem travessão, sem exclamação, Title Case no título em inglês, título até 48 caracteres e texto até 300, os dois idiomas obrigatórios, "no ice" nunca (o Lite é "made for powders and fresh fruit"), números de nutrição como estimativa, texto neutro para quem não tem BLENDi (nada de "seu BLENDi" sem `condition: 'hasBlendi'`).

4. **Suba `contentVersion`** no topo do roteiro (1 → 2). Mudou só um texto? Suba também: é o que diz "este roteiro mudou". O ETag da API é calculado do conteúdo, então o app baixa o roteiro novo mesmo se alguém esquecer.

5. **Rode os testes:** `pnpm --filter @blendi/shared build`, `pnpm --filter @blendi/api test` e `pnpm --filter @blendi/mobile test`.

Condição nova (fora das quatro) ou mudança no formato: suba `TUTORIAL_SCHEMA_VERSION`. App antigo recusa o roteiro do servidor inteiro e fica com a cópia embutida dele (não quebra, só não vê as novidades).

## O que acontece com quem já viu o tour

- O progresso fica na conta (`tutorial_progress`): `seenStepIds` são as etapas já tratadas.
- Ao **Concluir** ou **Pular**, todas as etapas que aquela versão do app sabe mostrar entram em `seenStepIds`, inclusive as de condição falsa e as cuja âncora não apareceu. Assim o tour não volta sozinho.
- Na próxima abertura da Home depois de uma atualização, entram só as etapas com id ainda não visto (**modo novidades**), com a abertura `whatsNewIntro`. Sem etapa nova aplicável, nada aparece.
- Etapa que aponta para tela ou âncora que a versão instalada não tem (roteiro do servidor mais novo que o app) **não** entra em `seenStepIds`: aparece como novidade quando a pessoa atualizar o app.
- Mudou só o texto de uma etapa existente: quem já viu não vê de novo (o id é o mesmo). Para mostrar de novo, crie uma etapa com id novo.
- "Ver tutorial de novo" (Me) apaga o progresso e começa da primeira etapa.

## Como testar

- **Automático:** `features/tutorial/*.test.ts(x)` usam um roteiro de teste (`testUtils/tutorialTestKit.ts`), não o real. O roteiro real é testado por `tutorialAnchors.test.ts` (âncoras e telas existem) e pela API (`tutorialContent.test.ts`, schema e regras de texto).
- **No aparelho, tour completo:** Me → "Ver tutorial de novo".
- **Modo novidades no aparelho (dev):** adicione uma etapa com id novo no roteiro, suba `contentVersion`, rode a API local e abra o app numa conta que já concluiu o tour.
- **Sem rede:** com o modo avião, o app usa o último roteiro baixado ou a cópia embutida; o progresso fica no aparelho e vai para o servidor quando a rede volta.
- Logs em dev: `[tutorial] etapa pulada: <id> (<motivo>)`. Motivos: `condition`, `route`, `anchorUnknown`, `anchorTimeout`, `duplicate`.

## Quando o tour abre (e quando não)

- Na Home, uma vez por sessão do app, 0,9 s depois de a Home ficar livre.
- Nunca com folha/modal aberto, celebração de nível, rota de raiz por cima (paywall, Minhas metas, Alergias...) ou alerta do sistema (app `inactive`). Se um desses aparecer no meio, o tour pausa e retoma a mesma etapa.
- Âncora que não aparece em 5 s (tela sem dados, elemento condicional como o seletor Timer/Passo a passo sem receita) é pulada em silêncio.

## Analytics (PostHog)

`tutorial_started` (`mode`: full, whatsNew, review), `tutorial_step_viewed` (`step_id`, `index`, `total`), `tutorial_skipped` (`step_id`, `mode`), `tutorial_completed` (`mode`), `tutorial_step_unavailable` (`step_id`, `reason`). Nenhum dado pessoal.
