// apps/api/src/utils/macroCalculation.utils.ts
//
// Núcleo de cálculo de BMR/TDEE/macros (fórmula de Mifflin-St Jeor com idade
// e sexo reais). Extraído de `calculateMacros` (user.controller.ts) pra ser
// reaproveitado também pelo recálculo automático de `updateMe` — nenhum dos
// dois pode reimplementar esta fórmula; os dois sempre chamam esta função.
//
// Idade nunca é um parâmetro armazenado: é sempre derivada de `birthDate` e
// de `now` (a data do servidor, nunca aceita do cliente) no momento exato do
// cálculo — ver `calculateAge`.

import {
  AUTO_CALORIE_TARGET_MIN_SUGGESTION,
  DAILY_PROTEIN_TARGET_MAX,
  DAILY_PROTEIN_TARGET_MIN,
} from '@blendi/shared';

import type { ActivityLevel, BiologicalSex, UserGoal, WeightGoal } from '../models/User';

export type ImcClassification = 'underweight' | 'normal' | 'overweight' | 'obese';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  lightlyActive: 1.375,
  moderatelyActive: 1.55,
  veryActive: 1.725,
  extremelyActive: 1.9,
};

// Ajuste calórico por objetivo de PESO (perder/manter/ganhar) — não confundir
// com `goal` (Muscle/Wellness/Energy/Recovery), que é a proposta do blend e,
// a partir desta correção, não tem mais nenhuma relação com ajuste calórico.
const WEIGHT_GOAL_CALORIE_ADJUSTMENTS: Record<WeightGoal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
};

const PROTEIN_MULTIPLIERS: Record<UserGoal, number> = {
  Muscle: 2.0,
  Wellness: 1.6,
  Energy: 1.8,
  Recovery: 2.2,
};

// Aproximação padrão de mercado pra variação de peso corporal (1kg de
// gordura ≈ 7700kcal) — NÃO é um valor fisiológico exato (a composição real
// da variação de peso varia por pessoa, água corporal, massa magra, etc.),
// é a constante que praticamente todo app do segmento usa pra estimar prazo.
const KCAL_PER_KG_BODY_WEIGHT_CHANGE = 7700;

export type WeightTargetEtaUnavailableReason = 'weightGoal_is_maintain' | 'contradictory_direction';

export type WeightTargetEta =
  | { etaDays: number; etaUnavailableReason?: undefined }
  | { etaDays: null; etaUnavailableReason: WeightTargetEtaUnavailableReason };

export interface MacroCalculationInput {
  /** Peso em quilogramas — já convertido para métrico pelo caller. */
  weight: number;
  /** Altura em centímetros — já convertida para métrico pelo caller. */
  height: number;
  birthDate: Date;
  biologicalSex: BiologicalSex;
  activityLevel: ActivityLevel;
  goal: UserGoal;
  weightGoal: WeightGoal;
}

export interface MacroCalculationResult {
  imc: number;
  imcUnit: 'kg/m²';
  imcClassification: ImcClassification;
  dailyCalorieTarget: number;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyFatTarget: number;
  /** BMR arredondado — exposto pra ser reaproveitado por evaluateManualMacroEditWarnings, sem recalcular a fórmula em outro lugar. */
  bmr: number;
  tdee: number;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Idade real derivada de `birthDate` e de `now`. A diferença simples entre
 * os anos superestima a idade em 1 ano sempre que o aniversário deste ano
 * ainda não aconteceu — por isso o ajuste de -1 abaixo.
 */
export function calculateAge(birthDate: Date, now: Date): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();

  const birthdayNotYetReachedThisYear =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());

  if (birthdayNotYetReachedThisYear) {
    age -= 1;
  }

  return age;
}

/**
 * Previsão de prazo (em dias) pra atingir `targetWeight` a partir de
 * `currentWeight`, dado o ajuste calórico do `weightGoal` atual. Única
 * função — reaproveitada por `calculateMacros` e pelo recálculo de
 * `updateMe`, nunca duplicada.
 *
 * `null` + motivo em dois casos, nenhum dos dois bloqueia o PATCH que
 * salva `targetWeight` — só a previsão fica indisponível:
 *   - `weightGoal === 'maintain'`: ajuste calórico é 0, divisão por zero.
 *   - Direção contraditória: `lose` com alvo >= peso atual, ou `gain` com
 *     alvo <= peso atual.
 */
export function calculateWeightTargetEta(
  currentWeight: number,
  targetWeight: number,
  weightGoal: WeightGoal
): WeightTargetEta {
  if (weightGoal === 'maintain') {
    return { etaDays: null, etaUnavailableReason: 'weightGoal_is_maintain' };
  }

  const isContradictoryDirection =
    (weightGoal === 'lose' && targetWeight >= currentWeight) ||
    (weightGoal === 'gain' && targetWeight <= currentWeight);

  if (isContradictoryDirection) {
    return { etaDays: null, etaUnavailableReason: 'contradictory_direction' };
  }

  const etaDays = Math.round(
    (Math.abs(currentWeight - targetWeight) * KCAL_PER_KG_BODY_WEIGHT_CHANGE) /
      Math.abs(WEIGHT_GOAL_CALORIE_ADJUSTMENTS[weightGoal])
  );

  return { etaDays };
}

/**
 * Fórmula de Mifflin-St Jeor com idade e sexo reais:
 *   BMR = 10×peso + 6,25×altura − 5×idade + (5 se homem, −161 se mulher)
 *   TDEE = round(BMR × multiplicador de atividade)
 * calorieTarget = TDEE + ajuste de weightGoal, clampado a um piso de
 * sanidade (CP-A.2.3, AUTO_CALORIE_TARGET_MIN_SUGGESTION) — só a SUGESTÃO
 * automática; a validação de edição manual do schema não muda.
 * fatCalories = 30% do calorieTarget JÁ CLAMPADO (ordem corrigida no
 * CP-A.2.3: antes a gordura era calculada depois do clamp de proteína, sem
 * depender dele; agora precisa vir antes, porque o reclamp de proteína
 * abaixo depende do valor de gordura).
 * Proteína = peso × multiplicador do goal, clampado 10-400 (inalterado),
 * depois RECLAMPADO (CP-A.2.3) ao que resta do orçamento calórico depois
 * da gordura — garante carboidrato (resto) nunca negativo por construção.
 */
export function calculateMacroTargets(
  input: MacroCalculationInput,
  now: Date = new Date()
): MacroCalculationResult {
  const { weight, height, birthDate, biologicalSex, activityLevel, goal, weightGoal } = input;

  const heightInMeters = height / 100;
  const imc = roundToOneDecimal(weight / (heightInMeters * heightInMeters));
  const imcClassification: ImcClassification =
    imc < 18.5 ? 'underweight' : imc < 25 ? 'normal' : imc < 30 ? 'overweight' : 'obese';

  const age = calculateAge(birthDate, now);
  const sexConstant = biologicalSex === 'male' ? 5 : -161;
  const basalMetabolism = (10 * weight) + (6.25 * height) - (5 * age) + sexConstant;
  const tdee = Math.round(basalMetabolism * ACTIVITY_MULTIPLIERS[activityLevel]);
  const rawDailyCalorieTarget = Math.round(tdee + WEIGHT_GOAL_CALORIE_ADJUSTMENTS[weightGoal]);
  // Piso de sanidade só da sugestão automática (CP-A.2.3) — perfis pequenos
  // + sedentários + déficit podiam sugerir calorias negativas (ver
  // cp-a.2-macros-complementares.md, força bruta do CP-A.2.2).
  const dailyCalorieTarget = Math.max(rawDailyCalorieTarget, AUTO_CALORIE_TARGET_MIN_SUGGESTION);

  // Gordura calculada ANTES do clamp de proteína (CP-A.2.3) — o reclamp por
  // orçamento abaixo precisa desse valor.
  const dailyFatCalories = dailyCalorieTarget * 0.3;

  // Proteína bruta (peso × multiplicador do goal), travada dentro dos
  // limites já definidos em @blendi/shared pro próprio campo dailyProteinTarget
  // — sem isso, pesos/goals extremos produzem um valor que o schema (Zod e
  // Mongoose) rejeitaria inteiro no save/update (ver cp-a1-macros.md,
  // achado 4 do CP-A).
  const rawDailyProteinTarget = Math.round(weight * PROTEIN_MULTIPLIERS[goal]);
  const dailyProteinTargetClampedByFixedRange = Math.min(
    Math.max(rawDailyProteinTarget, DAILY_PROTEIN_TARGET_MIN),
    DAILY_PROTEIN_TARGET_MAX
  );
  // Reclamp pelo orçamento calórico disponível (CP-A.2.3) — perfis pesados
  // com goal de multiplicador alto podiam consumir, em proteína + gordura,
  // mais calorias do que o total disponível, deixando carboidrato negativo
  // (ver achado do CP-A.2.2, peso 180kg + Recovery). Math.floor (não round)
  // pra NUNCA ultrapassar o orçamento, garantindo carboidrato >= 0 por
  // construção matemática, não só na prática.
  const calorieBudgetProteinCeiling = Math.floor((dailyCalorieTarget - dailyFatCalories) / 4);
  const dailyProteinTarget = Math.min(dailyProteinTargetClampedByFixedRange, calorieBudgetProteinCeiling);

  // Carboidrato deriva do valor JÁ DUPLAMENTE CLAMPADO de proteína — garante
  // que os 3 macros somam exatamente a meta calórica final que o usuário
  // vê, nunca um valor bruto teórico que nunca chega a ser exibido/salvo.
  const dailyCarbTarget = Math.round(
    (dailyCalorieTarget - (dailyProteinTarget * 4) - dailyFatCalories) / 4
  );
  // dailyFatTarget é só a mesma dailyFatCalories (já usada acima pro resto de
  // carboidrato) convertida de kcal pra gramas (9 kcal/g) — não muda em nada
  // o cálculo de dailyCarbTarget, que continua lendo dailyFatCalories direto.
  // Reaproveita calculateFatTargetFromCalories (mesma fórmula, fonte única)
  // em vez de repetir a conta aqui.
  const dailyFatTarget = calculateFatTargetFromCalories(dailyCalorieTarget);

  return {
    imc,
    imcUnit: 'kg/m²',
    imcClassification,
    dailyCalorieTarget,
    dailyProteinTarget,
    dailyCarbTarget,
    dailyFatTarget,
    bmr: Math.round(basalMetabolism),
    tdee,
  };
}

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

// ─── Avisos de edição manual de proteína/calorias (CP-A.2, Tarefa 6) ────────
// Faixas fixas e globais (não relativas ao multiplicador de `goal` da
// pessoa) — decisão já tomada no prompt, não reavaliada aqui.
export const PROTEIN_PER_KG_WARNING_MIN = 0.8;
export const PROTEIN_PER_KG_WARNING_MAX = 3.5;
// Piso de calorias = 1×BMR (sem multiplicador — BMR já é invariante por
// atividade). Teto = 1,6×TDEE (TDEE já embute o nível de atividade da
// pessoa; nunca usar BMR para o teto).
export const CALORIE_TARGET_TDEE_CEILING_MULTIPLIER = 1.6;
// Aviso suave simétrico de carboidrato (CP-A.2.3) — mesma mecânica de
// proteína/calorias acima, mesma faixa fixa e global (não relativa ao
// multiplicador de `goal`).
export const CARB_PER_KG_WARNING_MIN = 0.5;
export const CARB_PER_KG_WARNING_MAX = 8;
// Aviso suave simétrico de gordura — mesma mecânica dos 3 avisos acima,
// faixa fixa e global. Piso (0,5g/kg) igual ao de carboidrato: mesmo
// racional de "mínimo estrutural" (abaixo disso, ingestão de ácidos graxos
// essenciais e absorção de vitaminas lipossolúveis fica comprometida em
// qualquer dieta). Teto (2g/kg): o próprio cálculo automático deste app
// produz gordura ≈ 30% das calorias, o que pra um adulto de atividade
// moderada gira em torno de ~1g/kg — o teto de 2g/kg dá margem generosa
// pra dietas de maior proporção de gordura sem deixar de sinalizar um
// valor manual claramente fora de qualquer faixa plausível.
export const FAT_PER_KG_WARNING_MIN = 0.5;
export const FAT_PER_KG_WARNING_MAX = 2;

export type MacroEditWarningField =
  | 'dailyProteinTarget'
  | 'dailyCalorieTarget'
  | 'dailyCarbTarget'
  | 'dailyFatTarget';

export interface MacroEditWarning {
  field: MacroEditWarningField;
  code: string;
  message: string;
}

export interface ManualMacroEditWarningInput {
  dailyProteinTarget?: number;
  dailyCalorieTarget?: number;
  dailyCarbTarget?: number;
  dailyFatTarget?: number;
  /** Peso atual do usuário (antes do PATCH) — necessário pros avisos de proteína, carboidrato e gordura. */
  currentWeight?: number;
  /** BMR/TDEE atuais do usuário (de calculateMacroTargets, não recalculados aqui) — necessários só pro aviso de calorias. */
  bmr?: number;
  tdee?: number;
}

/**
 * Avalia `dailyProteinTarget`/`dailyCalorieTarget` contra faixas de bom senso
 * — NUNCA bloqueia nada, só sinaliza. Chamada apenas quando o PATCH é edição
 * manual pura (nenhum campo-gatilho no mesmo body — ver updateMe), porque só
 * nesse caminho o valor avaliado é de fato o valor que vai ser salvo.
 */
export function evaluateManualMacroEditWarnings(
  input: ManualMacroEditWarningInput
): MacroEditWarning[] {
  const warnings: MacroEditWarning[] = [];

  if (input.dailyProteinTarget !== undefined && typeof input.currentWeight === 'number') {
    const proteinPerKg = input.dailyProteinTarget / input.currentWeight;

    if (proteinPerKg < PROTEIN_PER_KG_WARNING_MIN) {
      warnings.push({
        field: 'dailyProteinTarget',
        code: 'macros/protein-below-range',
        message: 'warnings.manualMacroEdit.proteinBelowRange',
      });
    } else if (proteinPerKg > PROTEIN_PER_KG_WARNING_MAX) {
      warnings.push({
        field: 'dailyProteinTarget',
        code: 'macros/protein-above-range',
        message: 'warnings.manualMacroEdit.proteinAboveRange',
      });
    }
  }

  if (
    input.dailyCalorieTarget !== undefined &&
    typeof input.bmr === 'number' &&
    typeof input.tdee === 'number'
  ) {
    if (input.dailyCalorieTarget < input.bmr) {
      warnings.push({
        field: 'dailyCalorieTarget',
        code: 'macros/calories-below-bmr',
        message: 'warnings.manualMacroEdit.caloriesBelowBmr',
      });
    } else if (input.dailyCalorieTarget > CALORIE_TARGET_TDEE_CEILING_MULTIPLIER * input.tdee) {
      warnings.push({
        field: 'dailyCalorieTarget',
        code: 'macros/calories-above-tdee',
        message: 'warnings.manualMacroEdit.caloriesAboveTdee',
      });
    }
  }

  if (input.dailyCarbTarget !== undefined && typeof input.currentWeight === 'number') {
    const carbPerKg = input.dailyCarbTarget / input.currentWeight;

    if (carbPerKg < CARB_PER_KG_WARNING_MIN) {
      warnings.push({
        field: 'dailyCarbTarget',
        code: 'macros/carb-below-range',
        message: 'warnings.manualMacroEdit.carbBelowRange',
      });
    } else if (carbPerKg > CARB_PER_KG_WARNING_MAX) {
      warnings.push({
        field: 'dailyCarbTarget',
        code: 'macros/carb-above-range',
        message: 'warnings.manualMacroEdit.carbAboveRange',
      });
    }
  }

  if (input.dailyFatTarget !== undefined && typeof input.currentWeight === 'number') {
    const fatPerKg = input.dailyFatTarget / input.currentWeight;

    if (fatPerKg < FAT_PER_KG_WARNING_MIN) {
      warnings.push({
        field: 'dailyFatTarget',
        code: 'macros/fat-below-range',
        message: 'warnings.manualMacroEdit.fatBelowRange',
      });
    } else if (fatPerKg > FAT_PER_KG_WARNING_MAX) {
      warnings.push({
        field: 'dailyFatTarget',
        code: 'macros/fat-above-range',
        message: 'warnings.manualMacroEdit.fatAboveRange',
      });
    }
  }

  return warnings;
}
