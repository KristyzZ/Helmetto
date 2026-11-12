/** Browser notifications (Notifications API). Works while the app is open or installed and running. */

export type NotifyPermission = 'unsupported' | NotificationPermission;

export function notifyPermission(): NotifyPermission {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!('Notification' in window)) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showBrowserNotification(title: string, body: string, tag: string): Promise<void> {
  if (notifyPermission() !== 'granted') return;
  const options: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png' };
  try {
    // Android Chrome only allows notifications through the service worker.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) return await registration.showNotification(title, options);
    new Notification(title, options);
  } catch {
    // notifications are best effort; the in-app alert is always shown
  }
}
