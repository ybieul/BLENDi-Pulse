// CP-C2a — Valores dos marcadores do roteiro ({{waterGlass}}...). Números
// pela fonte única (@blendi/shared/planLimits); o copo de água vem já
// formatado pelo mesmo formatador do botão (useUnits().displayVolume),
// então conta imperial vê fl oz.
import {
  DAILY_MISSIONS_PER_DAY,
  FREE_PANTRY_SCANS_PER_MONTH,
  FREE_PULSE_AI_MESSAGES_PER_DAY,
  type TutorialMarkerValues,
} from '@blendi/shared';

export function buildTutorialMarkerValues(waterGlass: string): TutorialMarkerValues {
  return {
    waterGlass,
    freeAiPerDay: String(FREE_PULSE_AI_MESSAGES_PER_DAY),
    freeScansPerMonth: String(FREE_PANTRY_SCANS_PER_MONTH),
    missionsPerDay: String(DAILY_MISSIONS_PER_DAY),
  };
}
