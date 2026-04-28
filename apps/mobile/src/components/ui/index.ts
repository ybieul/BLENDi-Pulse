// apps/mobile/src/components/ui/index.ts
// Barrel de exportação — importe sempre por '@/components/ui', nunca pelo path direto.

export {
  SkeletonLoader,
  RecipeCardSkeleton,
  ChatMessageSkeleton,
  ProfileSkeleton,
} from './SkeletonLoader';

export type { SkeletonLoaderProps, SkeletonVariant } from './SkeletonLoader';

export { GoogleSignInButton } from './GoogleSignInButton';
export type { GoogleSignInButtonProps } from './GoogleSignInButton';
