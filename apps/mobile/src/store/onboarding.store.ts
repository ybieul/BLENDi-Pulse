// apps/mobile/src/store/onboarding.store.ts
// Estado temporário do fluxo de onboarding.
//
// Vive apenas em memória durante a sessão atual: cada tela grava sua parte
// aqui, e a etapa final envia o payload consolidado ao backend. Se o app for
// fechado no meio do fluxo, o onboarding recomeça do zero intencionalmente.

import { create } from 'zustand';

interface OnboardingState {
  selectedModel: string | null;
  selectedGoal: string | null;
  unitSystem: 'metric' | 'imperial' | null;
  weight: number | null;
  height: number | null;
  activityLevel: string | null;
  calculatedProtein: number | null;
  calculatedCalories: number | null;
  calculatedCarbs: number | null;
  imc: number | null;
}

interface SetBodyDataInput {
  weight: number;
  height: number;
  activityLevel: string;
}

interface SetCalculatedMacrosInput {
  calculatedProtein: number;
  calculatedCalories: number;
  calculatedCarbs: number;
  imc: number;
}

interface OnboardingActions {
  setModel: (selectedModel: string) => void;
  setGoal: (selectedGoal: string) => void;
  setUnitSystem: (unitSystem: 'metric' | 'imperial') => void;
  setBodyData: (input: SetBodyDataInput) => void;
  setCalculatedMacros: (input: SetCalculatedMacrosInput) => void;
  resetOnboarding: () => void;
}

const initialState: OnboardingState = {
  selectedModel: null,
  selectedGoal: null,
  unitSystem: null,
  weight: null,
  height: null,
  activityLevel: null,
  calculatedProtein: null,
  calculatedCalories: null,
  calculatedCarbs: null,
  imc: null,
};

export const useOnboardingStore = create<OnboardingState & OnboardingActions>((set) => ({
  ...initialState,

  setModel: (selectedModel) => {
    set({ selectedModel });
  },

  setGoal: (selectedGoal) => {
    set({ selectedGoal });
  },

  setUnitSystem: (unitSystem) => {
    set({ unitSystem });
  },

  setBodyData: ({ weight, height, activityLevel }) => {
    set({ weight, height, activityLevel });
  },

  setCalculatedMacros: ({ calculatedProtein, calculatedCalories, calculatedCarbs, imc }) => {
    set({ calculatedProtein, calculatedCalories, calculatedCarbs, imc });
  },

  resetOnboarding: () => {
    set(initialState);
  },
}));