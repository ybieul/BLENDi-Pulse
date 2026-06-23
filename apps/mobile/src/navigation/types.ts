import type { RouteProp } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type {
  BottomTabNavigationProp,
  BottomTabScreenProps,
} from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { PulseAiRecipe } from '@blendi/shared';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  VerifyOtp: { email: string };
  ResetPassword: { resetToken: string };
};

export type RootStackParamList = {
  AuthFlow: undefined;
  OnboardingFlow: undefined;
  AppFlow: NavigatorScreenParams<AppTabParamList> | undefined;
  Upgrade: undefined;
};

export type PulseAIStackParamList = {
  PulseAIChat: { prefilledMessage: string | null } | undefined;
  Favorites: undefined;
  PantryScanner: undefined;
};

export type TrackStackParamList = {
  TrackMain: undefined;
  ManageStack: undefined;
  History: undefined;
};

export type AppTabParamList = {
  Home: undefined;
  PulseAI: NavigatorScreenParams<PulseAIStackParamList> | undefined;
  Blend: { recipe?: PulseAiRecipe; favoriteId?: string } | undefined;
  Track: NavigatorScreenParams<TrackStackParamList> | undefined;
  Me: undefined;
};

export type OnboardingStackParamList = {
  OnboardingModel: undefined;
  OnboardingGoal: undefined;
  OnboardingBody: undefined;
  OnboardingMacros: undefined;
};

export type AuthNavigationProp<RouteName extends keyof AuthStackParamList> =
  NativeStackNavigationProp<AuthStackParamList, RouteName>;

export type RootNavigationProp<RouteName extends keyof RootStackParamList> =
  NativeStackNavigationProp<RootStackParamList, RouteName>;

export type AuthRouteProp<RouteName extends keyof AuthStackParamList> = RouteProp<
  AuthStackParamList,
  RouteName
>;

export type AuthScreenProps<RouteName extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, RouteName>;

export type AppTabNavigationProp<RouteName extends keyof AppTabParamList> =
  BottomTabNavigationProp<AppTabParamList, RouteName>;

export type AppTabRouteProp<RouteName extends keyof AppTabParamList> = RouteProp<
  AppTabParamList,
  RouteName
>;

export type AppTabScreenProps<RouteName extends keyof AppTabParamList> =
  BottomTabScreenProps<AppTabParamList, RouteName>;

export type OnboardingNavigationProp<RouteName extends keyof OnboardingStackParamList> =
  NativeStackNavigationProp<OnboardingStackParamList, RouteName>;

export type OnboardingRouteProp<RouteName extends keyof OnboardingStackParamList> = RouteProp<
  OnboardingStackParamList,
  RouteName
>;

export type OnboardingScreenProps<RouteName extends keyof OnboardingStackParamList> =
  NativeStackScreenProps<OnboardingStackParamList, RouteName>;

export type PulseAIStackNavigationProp<RouteName extends keyof PulseAIStackParamList> =
  NativeStackNavigationProp<PulseAIStackParamList, RouteName>;

export type PulseAIStackScreenProps<RouteName extends keyof PulseAIStackParamList> =
  NativeStackScreenProps<PulseAIStackParamList, RouteName>;

export type TrackStackNavigationProp<RouteName extends keyof TrackStackParamList> =
  NativeStackNavigationProp<TrackStackParamList, RouteName>;

export type TrackStackScreenProps<RouteName extends keyof TrackStackParamList> =
  NativeStackScreenProps<TrackStackParamList, RouteName>;