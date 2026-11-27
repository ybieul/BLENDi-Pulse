# CP-L1a — IMC com vírgula em pt-BR e anéis de meta acessíveis

**Data:** 27/11/2026 · **Base:** CP-L1 (sem commit). Sem commit.

## IMC

- `screens/onboarding/OnboardingBodyScreen.tsx`: `result.imc.toFixed(1)` → `formatFixedDecimal(result.imc, locale)`. Fica "IMC 22,5" em pt-BR e "BMI 22.5" em en, sempre com uma casa, como antes.
- **Outros lugares com IMC:** nenhum. Busquei `imc`/`bmi` no app e na API. O `onboarding.store` guarda o número mas nenhuma tela o mostra; Completar perfil e Minhas metas não exibem IMC; os avisos do backend (`warnings` do PATCH) não citam IMC. A API só calcula e devolve o número (`macroCalculation.utils.ts`).

## Anéis acessíveis

- `components/ui/GoalRing.tsx`: prop nova `accessibilityLabel`. Com ela, o anel vira um elemento só para o leitor de tela: `accessible`, `accessibilityRole="progressbar"` e `accessibilityValue` (`min` 0, `max` = meta, `now` = valor limitado à meta, para VoiceOver e TalkBack anunciarem o percentual; sem valor quando a meta é 0). Nenhum texto fixo dentro do componente: sem a prop, o anel fica como antes. O visual não mudou.
- **Rótulo** vem de quem usa, no formato de número do idioma (`useFormatNumbers`, o mesmo do número visível):
  - `home.ringA11y`: "Protein: 80 of 150 g" / "Proteína: 80 de 150 g".
  - `home.ringA11yGoalReached`: "…, goal reached" / "…, meta atingida", quando `current >= target` com `target > 0`. É o mesmo padrão da barra de água (`home.hydrationBarGoalReached`).
  - Unidades: `common.units.grams` ("g") e `common.units.kilocalories` ("kcal").

**Usos do GoalRing:**

| Onde | Rótulo |
|---|---|
| Home, proteína (`GoalRingsSection.tsx`) | `home.ringA11y(GoalReached)` com "g" |
| Home, carboidratos | idem, "g" |
| Home, calorias | idem, "kcal" |
| Relatório Semanal, aderência a suplementos (`WeeklyReportScreen.tsx`, antes com `label=""` e nada para o leitor de tela) | `weeklyReport.adherenceRate`, o texto que a tela já mostra ao lado ("85% adherence" / "85% de adesão"). Não é uma meta, então não leva "meta atingida" |

## Testes

- `OnboardingBodyScreen.test.tsx`: IMC 22,5 em en ("22.5") e pt-BR ("22,5").
- `components/ui/GoalRing.a11y.test.tsx` (anéis de verdade, textos reais do en.json e pt-BR.json):
  - abaixo, igual e acima da meta em en;
  - pt-BR com "de", vírgula, separador de milhar e "meta atingida";
  - meta zero não conta como batida e não declara valor;
  - sem rótulo de quem usa, o anel não muda.

## Verificação

Typecheck (3 workspaces) e lint limpos. Shared 25/25, API 1639/1639 e mobile 1231/1231 (antes 1225; +2 IMC, +4 anéis).

Checklist do aparelho: acrescentado ao `docs/fixes/cp-l1-limpeza.md` (IMC com vírgula no onboarding em pt-BR; VoiceOver/TalkBack nos anéis da Home).
