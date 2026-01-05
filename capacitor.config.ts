import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mrlube.training',
  appName: 'Mr Lube Training',
  webDir: 'out',
  server: {
    url: 'https://mrlube-clean.vercel.app',
    cleartext: true
  }
};

export default config;
