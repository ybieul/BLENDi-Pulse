// apps/mobile/src/store/onboarding.store.ts
// Estado temporário do fluxo de onboarding.
//
// Vive apenas em memória durante a sessão atual: cada tela grava sua parte
// aqui, e a etapa final envia o payload consolidado ao backend. Se o app for
// fechado no meio do fluxo, o onboarding recomeça do zero intencionalmente.

import { create } from 'zustand';
import { WEIGHT_LOSS_GOAL, WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL } from '@blendi/shared';
import type { BlendiOwnership, DietaryPreference, UserGoal, WeightGoal } from '@blendi/shared';

interface OnboardingState {
  selectedModel: string | null;
  /** 'other' e 'none' sempre vêm com selectedModel 'Lite'. */
  blendiOwnership: BlendiOwnership;
  /** Texto livre opcional — só enviado quando blendiOwnership é 'other'. */
  otherBlenderModel: string;
  selectedGoal: UserGoal | null;
  dietaryPreferences: DietaryPreference[];
  unitSystem: 'metric' | 'imperial' | null;
  weight: number | null;
  height: number | null;
  activityLevel: string | null;
  birthDate: string | null;
  biologicalSex: string | null;
  weightGoal: WeightGoal | null;
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
  weightGoal: WeightGoal;
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
  setGoal: (selectedGoal: UserGoal) => void;
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

  // Weight Loss sempre vem com weightGoal 'lose' (CP-1.1.9) — gravado já na
  // escolha do objetivo, para que o PATCH final o envie mesmo se a pessoa
  // pular a tela de corpo. Trocar de Weight Loss para outro objetivo antes de
  // concluir a tela de corpo desfaz esse 'lose' automático (nenhum peso foi
  // informado ainda); depois dela, o weightGoal escolhido lá é mantido.
  setGoal: (selectedGoal) => {
    set((state) => {
      if (selectedGoal === WEIGHT_LOSS_GOAL) {
        return { selectedGoal, weightGoal: WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL };
      }

      if (state.selectedGoal === WEIGHT_LOSS_GOAL && state.weight === null) {
        return { selectedGoal, weightGoal: null };
      }

      return { selectedGoal };
    });
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
