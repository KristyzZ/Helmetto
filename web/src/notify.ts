import { Capacitor } from '@capacitor/core';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';

/**
 * Notifications on this device: iOS notifications in the iPhone app, the
 * Notifications API in a browser. Both work while Helmetto is open or was just
 * in use; with the app fully closed it would need Apple push from the server.
 */
export type NotifyPermission = 'unsupported' | 'granted' | 'denied' | 'default';

const native = () => Capacitor.isNativePlatform();

export async function notifyPermission(): Promise<NotifyPermission> {
  if (native()) {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';
    } catch {
      return 'unsupported';
    }
  }
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (native()) {
    try {
      const { display } = await LocalNotifications.requestPermissions();
      return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'default';
    } catch {
      return 'unsupported';
    }
  }
  if (!('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

let nextId = Math.floor(Date.now() / 1000) % 1_000_000;

/** Show one notification. `tag` groups notifications about the same thing. Best effort: never throws. */
export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (native()) {
    // A buzz even when notifications are off: the app is open and something needs attention.
    void Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
    try {
      if ((await notifyPermission()) !== 'granted') return;
      await LocalNotifications.schedule({ notifications: [{ id: nextId++, title, body, threadIdentifier: tag }] });
    } catch {
      // best effort; the app shows the alert on screen anyway
    }
    return;
  }
  if ((await notifyPermission()) !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' };
  try {
    // Android Chrome only allows notifications through the service worker.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) return void (await registration.showNotification(title, options));
    new Notification(title, options);
  } catch {
    // best effort; the app shows the alert on screen anyway
  }
}
