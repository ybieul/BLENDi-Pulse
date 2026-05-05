// apps/mobile/src/components/ui/index.ts
// Barrel de exportação — importe sempre por '@/components/ui', nunca pelo path direto.

export {
  SkeletonLoader,
  RecipeCardSkeleton,
  ChatMessageSkeleton,
  ProfileSkeleton,
} from './SkeletonLoader';

export type { SkeletonLoaderProps, SkeletonVariant } from './SkeletonLoader';

export { AuthInput } from './AuthInput';
export type { AuthInputProps } from './AuthInput';

export { AuthButton } from './AuthButton';
export type { AuthButtonProps } from './AuthButton';

export { AuthProgressDots } from './AuthProgressDots';
export type { AuthProgressDotsProps } from './AuthProgressDots';

export { AuthScreenLayout } from './AuthScreenLayout';
export type { AuthScreenLayoutProps } from './AuthScreenLayout';

export { GoogleSignInButton } from './GoogleSignInButton';
export type { GoogleSignInButtonProps } from './GoogleSignInButton';
