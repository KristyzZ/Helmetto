import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iOS app: the built web app (dist/) inside a native shell.
 * Change appId to a bundle ID your Apple Developer team owns before signing,
 * e.g. com.yourteam.helmetto. See IOS.md.
 */
const config: CapacitorConfig = {
  appId: 'com.helmetto.parent',
  appName: 'Helmetto',
  webDir: 'dist',
  ios: {
    // The app handles the notch and home indicator itself (viewport-fit=cover).
    contentInset: 'never',
    backgroundColor: '#edf0f3',
  },
};

export default config;
