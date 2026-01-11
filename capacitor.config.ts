import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mrlube.training',
  appName: 'Mr Lube Training',
  webDir: 'out',
  server: {
    url: 'https://mrlube-clean.vercel.app',
    cleartext: true
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;