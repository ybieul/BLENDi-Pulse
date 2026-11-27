// CP-C2a / CP-L1 — Fonte única dos limites do plano (e do bônus de XP das
// missões, XP_EVENTS.missionBonus): valores atuais e um guarda que
// falha se alguém voltar a escrever um destes números numa cópia local na
// API ou no app (constante própria, padrão de parâmetro, literal no lugar).
// Rodar com: pnpm --filter @blendi/shared test
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';

import {
  DAILY_MISSIONS_PER_DAY,
  FREE_PANTRY_PREVIEWS_PER_CYCLE,
  FREE_PANTRY_SCANS_PER_MONTH,
  FREE_PULSE_AI_MESSAGES_PER_DAY,
  FREE_PULSE_AI_PREVIEWS_PER_DAY,
  PLAN_LIMITS,
  QUICK_WATER_GLASS_ML,
} from './planLimits';

const REPO = join(__dirname, '..', '..', '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const files = ['apps/api/src', 'apps/mobile/src'].flatMap(dir =>
  sourceFiles(join(REPO, dir)).map(path => ({ path: relative(REPO, path), code: readFileSync(path, 'utf8') }))
);

/** Padrões das cópias que existiam antes do CP-C2a (e variações óbvias). */
const FORBIDDEN: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'constante local de limite com número',
    pattern:
      /\b(DAILY_FREE_LIMIT|DAILY_FREE_PREVIEW_LIMIT|DAILY_QUERY_LIMIT|FREE_MONTHLY_SCAN_LIMIT|FREE_MONTHLY_SCAN_PREVIEW_LIMIT|FREE_TIER_SCAN_LIMIT|PANTRY_SCAN_LIMIT_FREE|PANTRY_SCANNER_MONTHLY_LIMIT|WATER_CONFIRMATION_AMOUNT_ML|DEFAULT_HYDRATION_AMOUNT_ML|MISSIONS_PER_DAY)\s*[:=]\s*\d/,
  },
  { label: 'logWater com número', pattern: /logWater\(\s*\d/ },
  { label: 'padrão de amountMl com número', pattern: /amountMl(\??:\s*number)?\s*=\s*\d/ },
  { label: 'missões contadas com número', pattern: /(selectedTypes\.length|selectedTypeSet\.size|missions\.length)\s*[<>=!]+\s*\d/ },
  { label: 'contador de missões com número', pattern: /completedCount\}\/\d/ },
  { label: 'padrão de hidratação com número no modelo', pattern: /amountMl:\s*\{[^}]*default:\s*\d/s },
  // CP-L1: bônus de completar as missões do dia (XP_EVENTS.missionBonus).
  { label: 'bônus de XP das missões com número', pattern: /bonusAwarded\s*\?\s*0\s*:\s*\d/ },
  { label: 'XP das missões somado com número', pattern: /xpAvailable\w*\s*[+=][^;]*\+\s*\d/ },
];

describe('CP-C2a — limites do plano', () => {
  it('valores atuais (mudar aqui muda a política comercial)', () => {
    assert.deepEqual(PLAN_LIMITS, {
      freePulseAiMessagesPerDay: 3,
      freePulseAiPreviewsPerDay: 1,
      freePantryScansPerMonth: 3,
      freePantryPreviewsPerCycle: 1,
      dailyMissionsPerDay: 3,
      quickWaterGlassMl: 250,
    });
    assert.equal(FREE_PULSE_AI_MESSAGES_PER_DAY, PLAN_LIMITS.freePulseAiMessagesPerDay);
    assert.equal(FREE_PULSE_AI_PREVIEWS_PER_DAY, PLAN_LIMITS.freePulseAiPreviewsPerDay);
    assert.equal(FREE_PANTRY_SCANS_PER_MONTH, PLAN_LIMITS.freePantryScansPerMonth);
    assert.equal(FREE_PANTRY_PREVIEWS_PER_CYCLE, PLAN_LIMITS.freePantryPreviewsPerCycle);
    assert.equal(DAILY_MISSIONS_PER_DAY, PLAN_LIMITS.dailyMissionsPerDay);
    assert.equal(QUICK_WATER_GLASS_ML, PLAN_LIMITS.quickWaterGlassMl);
  });

  it('o guarda enxerga os dois apps', () => {
    assert.ok(files.some(file => file.path.startsWith('apps/api/src/controllers/')));
    assert.ok(files.some(file => file.path.startsWith('apps/mobile/src/screens/')));
  });

  it('nenhuma cópia local dos limites na API nem no app', () => {
    const hits = files.flatMap(({ path, code }) =>
      FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(({ label }) => `${path}: ${label}`)
    );
    assert.deepEqual(hits, []);
  });

  it('API e app usam a fonte única nos lugares que controlam os limites', () => {
    const uses: Record<string, string[]> = {
      'apps/api/src/controllers/pulseAi.controller.ts': ['FREE_PULSE_AI_MESSAGES_PER_DAY', 'FREE_PULSE_AI_PREVIEWS_PER_DAY'],
      'apps/api/src/controllers/pantryScanner.controller.ts': ['FREE_PANTRY_SCANS_PER_MONTH', 'FREE_PANTRY_PREVIEWS_PER_CYCLE'],
      'apps/api/src/services/missionProgress.service.ts': ['FREE_PANTRY_SCANS_PER_MONTH', 'DAILY_MISSIONS_PER_DAY'],
      'apps/api/src/models/DailyMission.ts': ['DAILY_MISSIONS_PER_DAY'],
      'apps/api/src/controllers/hydration.controller.ts': ['QUICK_WATER_GLASS_ML'],
      'apps/api/src/models/HydrationLog.ts': ['QUICK_WATER_GLASS_ML'],
      'apps/mobile/src/screens/PulseAIScreen.tsx': ['FREE_PULSE_AI_MESSAGES_PER_DAY', 'FREE_PANTRY_SCANS_PER_MONTH'],
      'apps/mobile/src/components/pulseAi/UsageIndicator.tsx': ['FREE_PULSE_AI_MESSAGES_PER_DAY'],
      'apps/mobile/src/screens/PantryScannerScreen.tsx': ['FREE_PANTRY_SCANS_PER_MONTH'],
      'apps/mobile/src/components/home/QuickActionTrigger.tsx': ['QUICK_WATER_GLASS_ML'],
      'apps/mobile/src/components/track/HydrationSection.tsx': ['QUICK_WATER_GLASS_ML'],
      'apps/mobile/src/services/hydration.service.ts': ['QUICK_WATER_GLASS_ML'],
      'apps/mobile/src/screens/TrackScreen.tsx': ['QUICK_WATER_GLASS_ML'],
      'apps/mobile/src/screens/HomeScreen.tsx': ['DAILY_MISSIONS_PER_DAY'],
      'apps/api/src/controllers/dailyMission.controller.ts': ['XP_EVENTS'],
    };
    for (const [path, names] of Object.entries(uses)) {
      const file = files.find(item => item.path === path);
      assert.ok(file, path);
      for (const name of names) {
        assert.match(file.code, new RegExp(`\\b${name}\\b`), `${path} não usa ${name}`);
      }
    }
  });
});
