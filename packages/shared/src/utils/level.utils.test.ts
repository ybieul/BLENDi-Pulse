import { calculateLevel } from './level.utils';

function assertEqual(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

function assertBetweenInclusive(value: number, min: number, max: number, message: string): void {
  if (value < min || value > max) {
    throw new Error(`${message}: expected value between ${min} and ${max}, received ${value}`);
  }
}

function runLevelUtilsTests(): void {
  assertEqual(calculateLevel(0).level, 1, 'calculateLevel(0) deve retornar nível 1');
  assertEqual(calculateLevel(100).level, 2, 'calculateLevel(100) deve retornar nível 2');
  assertEqual(calculateLevel(4099).level, 9, 'calculateLevel(4099) deve retornar nível 9');
  assertEqual(calculateLevel(4100).level, 10, 'calculateLevel(4100) deve retornar nível 10');

  const samples = [-100, Number.NaN, 0, 1, 99, 100, 249, 3250, 4099, 4100, 99999];

  for (const sample of samples) {
    assertBetweenInclusive(
      calculateLevel(sample).progress,
      0,
      1,
      `progress deve permanecer entre 0 e 1 para sample ${String(sample)}`
    );
  }
}

runLevelUtilsTests();
