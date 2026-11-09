// apps/mobile/src/store/onboarding.store.ts
// Estado temporário do fluxo de onboarding.
//
// Vive apenas em memória durante a sessão atual: cada tela grava sua parte
// aqui, e a etapa final envia o payload consolidado ao backend. Se o app for
// fechado no meio do fluxo, o onboarding recomeça do zero intencionalmente.

import { create } from 'zustand';
import type { BlendiOwnership, DietaryPreference } from '@blendi/shared';

interface OnboardingState {
  selectedModel: string | null;
  /** 'other' e 'none' sempre vêm com selectedModel 'Lite'. */
  blendiOwnership: BlendiOwnership;
  /** Texto livre opcional — só enviado quando blendiOwnership é 'other'. */
  otherBlenderModel: string;
  selectedGoal: string | null;
  dietaryPreferences: DietaryPreference[];
  unitSystem: 'metric' | 'imperial' | null;
  weight: number | null;
  height: number | null;
  activityLevel: string | null;
  birthDate: string | null;
  biologicalSex: string | null;
  weightGoal: string | null;
  calculatedProtein: number | null;
  calculatedCalories: number | null;
  calculatedCarbs: number | null;
  imc: number | null;
}

interface SetBodyDataInput {
  weight: number;
  height: number;
  activityLevel: string;
  birthDate: string;
  biologicalSex: string;
  weightGoal: string;
}

interface SetCalculatedMacrosInput {
  calculatedProtein: number;
  calculatedCalories: number;
  calculatedCarbs: number;
  imc: number;
}

interface OnboardingActions {
  setModel: (selectedModel: string, blendiOwnership?: BlendiOwnership) => void;
  setOtherBlenderModel: (otherBlenderModel: string) => void;
  setGoal: (selectedGoal: string) => void;
  toggleDietaryPreference: (preference: DietaryPreference) => void;
  setUnitSystem: (unitSystem: 'metric' | 'imperial') => void;
  setBodyData: (input: SetBodyDataInput) => void;
  setCalculatedMacros: (input: SetCalculatedMacrosInput) => void;
  resetOnboarding: () => void;
}

const initialState: OnboardingState = {
  selectedModel: null,
  blendiOwnership: 'blendi',
  otherBlenderModel: '',
  selectedGoal: null,
  dietaryPreferences: [],
  unitSystem: null,
  weight: null,
  height: null,
  activityLevel: null,
  birthDate: null,
  biologicalSex: null,
  weightGoal: null,
  calculatedProtein: null,
  calculatedCalories: null,
  calculatedCarbs: null,
  imc: null,
};

export const useOnboardingStore = create<OnboardingState & OnboardingActions>((set) => ({
  ...initialState,

  setModel: (selectedModel, blendiOwnership = 'blendi') => {
    set({ selectedModel, blendiOwnership });
  },

  setOtherBlenderModel: (otherBlenderModel) => {
    set({ otherBlenderModel });
  },

  setGoal: (selectedGoal) => {
    set({ selectedGoal });
  },

  toggleDietaryPreference: (preference) => {
    set((state) => ({
      dietaryPreferences: state.dietaryPreferences.includes(preference)
        ? state.dietaryPreferences.filter((current) => current !== preference)
        : [...state.dietaryPreferences, preference],
    }));
  },

  setUnitSystem: (unitSystem) => {
    set({ unitSystem });
  },

  setBodyData: ({ weight, height, activityLevel, birthDate, biologicalSex, weightGoal }) => {
    set({ weight, height, activityLevel, birthDate, biologicalSex, weightGoal });
  },

  setCalculatedMacros: ({ calculatedProtein, calculatedCalories, calculatedCarbs, imc }) => {
    set({ calculatedProtein, calculatedCalories, calculatedCarbs, imc });
  },

  resetOnboarding: () => {
    set(initialState);
  },
}));
