import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.crewcheck.app',
  appName: 'CrewCheck',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    iosScheme: 'https'
  },
  ios: {
    contentInset: 'automatic',
    allowsLinkPreview: false,
    scrollEnabled: true,
    backgroundColor: '#061426',
    limitsNavigationsToAppBoundDomains: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 650,
      backgroundColor: '#061426',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#061426',
      overlaysWebView: false
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true
    },
    App: {
      iosScheme: 'crewcheck'
    }
  }
};

export default config;
