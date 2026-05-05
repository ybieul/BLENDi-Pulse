import type { RouteProp } from '@react-navigation/native';
import type {
  NativeStackNavigationProp,
  NativeStackScreenProps,
} from '@react-navigation/native-stack';
import type {
  BottomTabNavigationProp,
  BottomTabScreenProps,
} from '@react-navigation/bottom-tabs';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
  VerifyOtp: { email: string };
  ResetPassword: { resetToken: string };
};

export type AppTabParamList = {
  Home: undefined;
  Recipes: undefined;
  Blend: undefined;
  Track: undefined;
  Me: undefined;
};

export type AuthNavigationProp<RouteName extends keyof AuthStackParamList> =
  NativeStackNavigationProp<AuthStackParamList, RouteName>;

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