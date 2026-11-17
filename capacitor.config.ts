export interface CapacitorAndroidConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    androidScheme?: 'https' | 'http';
    cleartext?: boolean;
  };
  android?: {
    allowMixedContent?: boolean;
    captureInput?: boolean;
    webContentsDebuggingEnabled?: boolean;
    backgroundColor?: string;
  };
  plugins?: {
    SplashScreen?: {
      launchShowDuration?: number;
      launchAutoHide?: boolean;
      backgroundColor?: string;
      androidScaleType?: string;
      showSpinner?: boolean;
      splashFullScreen?: boolean;
      splashImmersive?: boolean;
    };
  };
}

const config: CapacitorAndroidConfig = {
  appId: 'com.tarek.studio',
  appName: 'TAREK',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#090503',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      launchAutoHide: true,
      backgroundColor: '#090503',
      androidScaleType: 'CENTER_INSIDE',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
  },
};

export default config;
