import { useAuthStore } from '../store/auth.store';
import type { AuthUser } from '../services/auth.service';

type UnitSystem = AuthUser['unitSystem'];
type StorageConversionResult = number | '—';

const POUNDS_PER_KILOGRAM = 2.205;
const CENTIMETERS_PER_INCH = 2.54;
const MILLILITERS_PER_FLUID_OUNCE = 29.574;
const DASH_VALUE = '—';

function isValidNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatOneDecimal(value: number): string {
  return roundToOneDecimal(value).toFixed(1);
}

function formatMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : formatOneDecimal(value);
}

export interface UseUnitsResult {
  unitSystem: UnitSystem;
  weightUnit: 'kg' | 'lbs';
  volumeUnit: 'ml' | 'fl oz';
  heightUnit: 'cm' | 'ft/in';
  inputHeightUnit: 'cm' | 'in';
  displayWeight: (valueInKg: number) => string;
  displayHeight: (valueInCm: number) => string;
  displayVolume: (valueInMl: number) => string;
  displayHydration: (valueInMl: number) => string;
  toStorageWeight: (value: number) => StorageConversionResult;
  toStorageHeight: (value: number) => StorageConversionResult;
}

export function useUnits(unitSystemOverride?: UnitSystem | null): UseUnitsResult {
  const storedUnitSystem = useAuthStore((state) => state.user?.unitSystem ?? 'metric');
  const unitSystem = unitSystemOverride ?? storedUnitSystem;

  const weightUnit = unitSystem === 'imperial' ? 'lbs' : 'kg';
  const volumeUnit = unitSystem === 'imperial' ? 'fl oz' : 'ml';
  const heightUnit = unitSystem === 'imperial' ? 'ft/in' : 'cm';
  const inputHeightUnit = unitSystem === 'imperial' ? 'in' : 'cm';

  const displayWeight = (valueInKg: number): string => {
    if (!isValidNumber(valueInKg)) {
      return DASH_VALUE;
    }

    if (unitSystem === 'imperial') {
      return `${formatOneDecimal(valueInKg * POUNDS_PER_KILOGRAM)} ${weightUnit}`;
    }

    return `${formatOneDecimal(valueInKg)} ${weightUnit}`;
  };

  const displayHeight = (valueInCm: number): string => {
    if (!isValidNumber(valueInCm)) {
      return DASH_VALUE;
    }

    if (unitSystem === 'imperial') {
      const totalInches = valueInCm / CENTIMETERS_PER_INCH;
      let feet = Math.floor(totalInches / 12);
      let inches = Math.round(totalInches % 12);

      if (inches === 12) {
        feet += 1;
        inches = 0;
      }

      return `${feet}'${inches}"`;
    }

    return `${Math.round(valueInCm)} ${heightUnit}`;
  };

  const displayVolume = (valueInMl: number): string => {
    if (!isNonNegativeNumber(valueInMl)) {
      return DASH_VALUE;
    }

    if (unitSystem === 'imperial') {
      return `${formatOneDecimal(valueInMl / MILLILITERS_PER_FLUID_OUNCE)} ${volumeUnit}`;
    }

    return `${formatMetricValue(valueInMl)} ${volumeUnit}`;
  };

  const displayHydration = (valueInMl: number): string => displayVolume(valueInMl);

  const toStorageWeight = (value: number): StorageConversionResult => {
    if (!isValidNumber(value)) {
      return DASH_VALUE;
    }

    return unitSystem === 'imperial' ? value / POUNDS_PER_KILOGRAM : value;
  };

  const toStorageHeight = (value: number): StorageConversionResult => {
    if (!isValidNumber(value)) {
      return DASH_VALUE;
    }

    if (unitSystem === 'imperial') {
      return roundToOneDecimal(value * CENTIMETERS_PER_INCH);
    }

    return value;
  };

  return {
    unitSystem,
    weightUnit,
    volumeUnit,
    heightUnit,
    inputHeightUnit,
    displayWeight,
    displayHeight,
    displayVolume,
    displayHydration,
    toStorageWeight,
    toStorageHeight,
  };
}