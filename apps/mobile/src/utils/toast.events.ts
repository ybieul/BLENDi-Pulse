import { Platform, ToastAndroid } from 'react-native';

const IOS_TOAST_DURATION_MS = 3200;

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastOptions {
  title?: string;
  message: string;
  duration?: number | null;
  action?: ToastAction;
  dismissOnPress?: boolean;
  forceCustom?: boolean;
}

export interface ToastPayload {
  id: number;
  title?: string;
  message: string;
  duration: number | null;
  action?: ToastAction;
  dismissOnPress?: boolean;
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

function normalizeToastOptions(
  input: string | ToastOptions,
  duration?: number
): ToastOptions {
  if (typeof input === 'string') {
    return {
      message: input,
      duration,
    };
  }

  return input;
}

export function showToast(input: string | ToastOptions, duration = IOS_TOAST_DURATION_MS): void {
  const options = normalizeToastOptions(input, duration);
  const toastDuration = options.duration ?? IOS_TOAST_DURATION_MS;

  if (Platform.OS === 'android' && options.forceCustom !== true) {
    ToastAndroid.show(options.message, toastDuration >= 3500 ? ToastAndroid.LONG : ToastAndroid.SHORT);
    return;
  }

  emitToast({
    id: Date.now(),
    title: options.title,
    message: options.message,
    duration: toastDuration,
    action: options.action,
    dismissOnPress: options.dismissOnPress,
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