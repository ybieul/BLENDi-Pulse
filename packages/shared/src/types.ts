// ─── Tipos de domínio BLENDi Pulse ───────────────────────────────────────────

export type Locale = 'en' | 'pt-BR';

export type SubscriptionTier = 'free' | 'pro';

export interface User {
  id: string;
  email: string;
  name: string;
  locale: Locale;
  subscriptionTier: SubscriptionTier;
  createdAt: string;
  updatedAt: string;
}

export interface MacroGoal {
  userId: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Recipe {
  id: string;
  title: string;
  ingredients: Ingredient[];
  macros: Macros;
  blendTimeSec: number;
  imageUrl?: string;
  createdAt: string;
}

export interface Ingredient {
  name: string;
  amountG: number;
}

export interface Macros {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface BlendLog {
  id: string;
  userId: string;
  recipeId: string;
  loggedAt: string;
  macros: Macros;
}

export interface HydrationLog {
  id: string;
  userId: string;
  amountMl: number;
  loggedAt: string;
}

export interface SupplementStack {
  userId: string;
  items: SupplementItem[];
}

export interface SupplementItem {
  name: string;
  doseG: number;
  timeOfDay: 'morning' | 'pre-workout' | 'post-workout' | 'evening';
}
