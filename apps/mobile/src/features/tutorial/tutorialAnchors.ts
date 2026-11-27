// CP-C2 — Catálogo das âncoras que ESTA versão do app tem.
//
// O roteiro pode vir do servidor com etapas de uma versão mais nova do app.
// Etapa cuja âncora não está aqui é pulada sem esperar (e continua "não
// vista": aparece no modo novidades quando o usuário atualizar o app).
// Um teste (tutorialAnchors.test.ts) garante que toda âncora daqui é usada
// em alguma tela e que toda âncora do roteiro inicial está aqui.
export const TUTORIAL_ANCHOR_IDS = [
  // Home
  'home.header',
  'home.logWater',
  'home.quickBlend',
  'home.rings',
  'home.streak',
  'home.missions',
  'home.protocols',
  'home.dailyRecipe',
  // Pulse AI
  'pulseAi.input',
  'pulseAi.howToUse',
  'pulseAi.usage',
  'pulseAi.history',
  'pulseAi.favorites',
  'pulseAi.pantry',
  // Blend
  'blend.modeToggle',
  'blend.timer',
  'blend.controls',
  // Track
  'track.shoppingLists',
  'track.hydration',
  'track.stack',
  'track.history',
  // Me
  'me.level',
  'me.weeklyReport',
  'me.badges',
  'me.modelGoal',
  'me.nutritionGoals',
  'me.allergies',
  'me.preferences',
  'me.replay',
  'me.plan',
] as const;

export type TutorialAnchorId = (typeof TUTORIAL_ANCHOR_IDS)[number];

const KNOWN_ANCHORS: ReadonlySet<string> = new Set(TUTORIAL_ANCHOR_IDS);

export function isKnownTutorialAnchor(id: string): id is TutorialAnchorId {
  return KNOWN_ANCHORS.has(id);
}
