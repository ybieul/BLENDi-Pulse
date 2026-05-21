import { Platform, ToastAndroid } from 'react-native';

const IOS_TOAST_DURATION_MS = 3200;

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastPayload {
  id: number;
  message: string;
  duration: number | null;
  action?: ToastAction;
}

type ToastListener = (payload: ToastPayload) => void;

const toastListeners = new Set<ToastListener>();

function emitToast(payload: ToastPayload): void {
  toastListeners.forEach((listener) => {
    listener(payload);
  });
}

export function subscribeToToasts(listener: ToastListener): () => void {
  toastListeners.add(listener);

  return () => {
    toastListeners.delete(listener);
  };
}

export function showToast(message: string, duration = IOS_TOAST_DURATION_MS): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, duration >= 3500 ? ToastAndroid.LONG : ToastAndroid.SHORT);
    return;
  }

  emitToast({
    id: Date.now(),
    message,
    duration,
  });
}

export function showPersistentToast(message: string, action: ToastAction): void {
  emitToast({
    id: Date.now(),
    message,
    duration: null,
    action,
  });
}