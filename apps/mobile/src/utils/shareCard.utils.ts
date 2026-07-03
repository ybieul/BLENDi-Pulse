import type { RefObject } from 'react';
import * as Sharing from 'expo-sharing';

import i18n from '../locales/i18n';
import { showToast } from './toast.utils';

interface CapturableViewRef {
  capture?: (options?: {
    format?: 'jpg' | 'png' | 'webm' | 'raw';
    quality?: number;
    result?: 'tmpfile' | 'base64' | 'data-uri' | 'zip-base64';
  }) => Promise<string>;
}

interface ShareCardMessages {
  sharingUnavailable: string;
  shareError: string;
}

function getShareCardMessages(): ShareCardMessages {
  return {
    sharingUnavailable: i18n.t('share.sharingNotAvailable'),
    shareError: i18n.t('share.shareError'),
  };
}

export async function generateAndShare(
  viewRef: RefObject<CapturableViewRef | null>,
): Promise<void> {
  const messages = getShareCardMessages();

  try {
    const capturedUri = await viewRef.current?.capture?.({
      format: 'jpg',
      quality: 0.92,
      result: 'tmpfile',
    });

    if (!capturedUri) {
      showToast(messages.shareError);
      return;
    }

    const isSharingAvailable = await Sharing.isAvailableAsync();

    if (!isSharingAvailable) {
      showToast(messages.sharingUnavailable);
      return;
    }

    await Sharing.shareAsync(capturedUri, {
      mimeType: 'image/jpeg',
    });
  } catch {
    showToast(messages.shareError);
  }
}
