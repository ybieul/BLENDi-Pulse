import { useAuthStore } from '../store/auth.store';
import type { AuthUser } from '../services/auth.service';
import {
  cmToFeetInches,
  formatFeetInches,
  kgToPounds,
  roundToOneDecimal,
} from '../utils/bodyUnits';
import { formatDecimal } from '../utils/formatNumbers';
import { mlToFlOz } from '../utils/volumeUnits';
import { useAppTranslation } from './useAppTranslation';

type UnitSystem = AuthUser['unitSystem'];

const DASH_VALUE = '—';

function isValidNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function formatOneDecimal(value: number): string {
  return roundToOneDecimal(value).toFixed(1);
}

export interface UseUnitsResult {
  unitSystem: UnitSystem;
  weightUnit: 'kg' | 'lbs';
  volumeUnit: 'ml' | 'fl oz';
  heightUnit: 'cm' | 'ft/in';
  inputHeightUnit: 'cm' | 'in';
  /** Unidade do campo de pés (altura imperial digitada em pés + polegadas). */
  inputHeightFeetUnit: 'ft';
  displayWeight: (valueInKg: number) => string;
  displayHeight: (valueInCm: number) => string;
  displayVolume: (valueInMl: number) => string;
  displayHydration: (valueInMl: number) => string;
}

export function useUnits(unitSystemOverride?: UnitSystem | null): UseUnitsResult {
  const { locale } = useAppTranslation();
  const storedUnitSystem = useAuthStore((state) => state.user?.unitSystem ?? 'metric');
  const unitSystem = unitSystemOverride ?? storedUnitSystem;

  const weightUnit = unitSystem === 'imperial' ? 'lbs' : 'kg';
  const volumeUnit = unitSystem === 'imperial' ? 'fl oz' : 'ml';
  const heightUnit = unitSystem === 'imperial' ? 'ft/in' : 'cm';
  const inputHeightUnit = unitSystem === 'imperial' ? 'in' : 'cm';
  const inputHeightFeetUnit = 'ft';

  const displayWeight = (valueInKg: number): string => {
    if (!isValidNumber(valueInKg)) {
      return DASH_VALUE;
    }

    if (unitSystem === 'imperial') {
      return `${formatOneDecimal(kgToPounds(valueInKg))} ${weightUnit}`;
    }

    return `${formatOneDecimal(valueInKg)} ${weightUnit}`;
  };

  const displayHeight = (valueInCm: number): string => {
    if (!isValidNumber(valueInCm)) {
      return DASH_VALUE;
    }

    if (unitSystem === 'imperial') {
      return formatFeetInches(cmToFeetInches(valueInCm));
    }

    return `${Math.round(valueInCm)} ${heightUnit}`;
  };

  const displayVolume = (valueInMl: number): string => {
    if (!isNonNegativeNumber(valueInMl)) {
      return DASH_VALUE;
    }

    if (unitSystem === 'imperial') {
      return `${formatOneDecimal(mlToFlOz(valueInMl))} ${volumeUnit}`;
    }

    return `${formatDecimal(valueInMl, locale)} ${volumeUnit}`;
  };

  const displayHydration = (valueInMl: number): string => displayVolume(valueInMl);

  return {
    unitSystem,
    weightUnit,
    volumeUnit,
    heightUnit,
    inputHeightUnit,
    inputHeightFeetUnit,
    displayWeight,
    displayHeight,
    displayVolume,
    displayHydration,
  };
}