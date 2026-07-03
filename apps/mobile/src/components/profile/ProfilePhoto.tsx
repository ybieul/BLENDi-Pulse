import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, fonts, fontWeights } from '@blendi/shared';
import { api } from '../../config/api';
import { createAppStorage } from '../../config/storage';
import { useAuthStore } from '../../store/auth.store';

const PROFILE_PHOTO_STORAGE = createAppStorage('blendi-pulse');
const INITIALS_BACKGROUND = 'rgba(154,72,147,0.30)';
const LOADER_COLOR = 'rgba(255,255,255,0.72)';
const MIN_INITIALS_FONT_SIZE = 14;
const INITIALS_FONT_SCALE = 0.35;

export type CachedProfilePhoto = {
  imageBase64: string;
  mimeType: string;
  profilePhotoUpdatedAt: string | null;
};

type GetMyProfilePhotoResponse = {
  success: true;
  data: {
    imageBase64: string;
    mimeType: string;
  };
};

export interface ProfilePhotoProps {
  userId?: string;
  fullName: string;
  hasProfilePhoto: boolean;
  profilePhotoUpdatedAt?: string | Date | null;
  size: number;
  previewImageUri?: string | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
}

export function getProfilePhotoCacheKey(userId: string): string {
  return `profile_photo_${userId}`;
}

function normalizeProfilePhotoTimestamp(value: string | Date | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function getInitials(fullName: string): string {
  const initials = fullName
    .trim()
    .split(/\s+/)
    .map(word => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('');

  return initials.length > 0 ? initials.toUpperCase() : '?';
}

export function buildProfilePhotoImageUri(imageBase64: string, mimeType: string): string {
  if (imageBase64.startsWith('data:')) {
    return imageBase64;
  }

  return `data:${mimeType};base64,${imageBase64}`;
}

function readCachedProfilePhoto(userId: string): CachedProfilePhoto | null {
  const cachedValue = PROFILE_PHOTO_STORAGE.getString(getProfilePhotoCacheKey(userId));

  if (!cachedValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(cachedValue) as Partial<CachedProfilePhoto>;

    if (typeof parsed.imageBase64 !== 'string' || typeof parsed.mimeType !== 'string') {
      PROFILE_PHOTO_STORAGE.delete(getProfilePhotoCacheKey(userId));
      return null;
    }

    return {
      imageBase64: parsed.imageBase64,
      mimeType: parsed.mimeType,
      profilePhotoUpdatedAt:
        typeof parsed.profilePhotoUpdatedAt === 'string' || parsed.profilePhotoUpdatedAt === null
          ? parsed.profilePhotoUpdatedAt
          : null,
    };
  } catch {
    PROFILE_PHOTO_STORAGE.delete(getProfilePhotoCacheKey(userId));
    return null;
  }
}

export function cacheProfilePhoto(userId: string, value: CachedProfilePhoto): void {
  PROFILE_PHOTO_STORAGE.set(getProfilePhotoCacheKey(userId), JSON.stringify(value));
}

export function clearProfilePhotoCache(userId: string): void {
  PROFILE_PHOTO_STORAGE.delete(getProfilePhotoCacheKey(userId));
}

export function ProfilePhoto({
  userId,
  fullName,
  hasProfilePhoto,
  profilePhotoUpdatedAt,
  size,
  previewImageUri,
  style,
  imageStyle,
}: ProfilePhotoProps) {
  const authenticatedUserId = useAuthStore(state => state.user?.id ?? null);
  const resolvedUserId = userId ?? authenticatedUserId;
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const initials = useMemo(() => getInitials(fullName), [fullName]);
  const normalizedUpdatedAt = useMemo(
    () => normalizeProfilePhotoTimestamp(profilePhotoUpdatedAt),
    [profilePhotoUpdatedAt]
  );
  const initialsFontSize = useMemo(
    () => Math.max(Math.round(size * INITIALS_FONT_SCALE), MIN_INITIALS_FONT_SIZE),
    [size]
  );
  const resolvedImageUri = previewImageUri ?? imageUri;

  useEffect(() => {
    let isCancelled = false;

    if (!hasProfilePhoto || !resolvedUserId) {
      if (resolvedUserId) {
        clearProfilePhotoCache(resolvedUserId);
      }
      setImageUri(null);
      setIsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    const cachedPhoto = readCachedProfilePhoto(resolvedUserId);

    if (cachedPhoto && cachedPhoto.profilePhotoUpdatedAt === normalizedUpdatedAt) {
      setImageUri(buildProfilePhotoImageUri(cachedPhoto.imageBase64, cachedPhoto.mimeType));
      setIsLoading(false);
      return () => {
        isCancelled = true;
      };
    }

    setImageUri(null);
    setIsLoading(true);

    void (async () => {
      try {
        const response = await api.get<GetMyProfilePhotoResponse>('/users/me/photo');
        const nextCachedPhoto: CachedProfilePhoto = {
          imageBase64: response.data.data.imageBase64,
          mimeType: response.data.data.mimeType,
          profilePhotoUpdatedAt: normalizedUpdatedAt,
        };

        cacheProfilePhoto(resolvedUserId, nextCachedPhoto);

        if (!isCancelled) {
          setImageUri(buildProfilePhotoImageUri(nextCachedPhoto.imageBase64, nextCachedPhoto.mimeType));
        }
      } catch {
        if (!isCancelled) {
          setImageUri(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [hasProfilePhoto, normalizedUpdatedAt, resolvedUserId]);

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        style,
      ]}
    >
      {resolvedImageUri ? (
        <Image
          source={{ uri: resolvedImageUri }}
          style={[
            styles.image,
            {
              borderRadius: size / 2,
            },
            imageStyle,
          ]}
        />
      ) : (
        <View
          style={[
            styles.initialsCircle,
            {
              borderRadius: size / 2,
            },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color={LOADER_COLOR} size="small" />
          ) : (
            <Text
              style={[
                styles.initialsText,
                {
                  fontSize: initialsFontSize,
                  lineHeight: Math.round(initialsFontSize * 1.1),
                },
              ]}
            >
              {initials}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  initialsCircle: {
    width: '100%',
    height: '100%',
    backgroundColor: INITIALS_BACKGROUND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialsText: {
    color: colors.text.primary,
    fontFamily: fonts.display,
    fontWeight: fontWeights.bold,
  },
});
