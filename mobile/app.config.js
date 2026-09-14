/**
 * Config de Expo en JS (antes era app.json) para poder leer variables de entorno
 * en build time: la URL del API y la key de Google Maps cambian entre dev local,
 * el entorno dev del VPS y prod, y no queremos hardcodearlas ni commitear keys.
 */
module.exports = () => ({
  expo: {
    name: 'CargoLink',
    slug: 'cargolink',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'cargolink',
    userInterfaceStyle: 'light',
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.cargolink.app',
      // Sin googleMapsApiKey react-native-maps usa Apple Maps en iOS, que no
      // requiere credenciales. Sólo Android necesita key sí o sí.
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'CargoLink usa tu ubicación para mostrar el seguimiento del viaje en tiempo real.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'CargoLink usa tu ubicación en segundo plano para actualizar el seguimiento del viaje.',
        // Permite http:// contra el backend local durante desarrollo; en prod
        // las URLs del VPS (vía Cloudflare Tunnel) son https y no se apoya en esta excepción.
        NSAppTransportSecurity: {
          NSAllowsLocalNetworking: true,
        },
      },
    },
    android: {
      package: 'com.cargolink.app',
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#2563EB',
      },
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION'],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY_ANDROID,
        },
      },
    },
    web: {
      favicon: './assets/favicon.png',
    },
    plugins: [
      [
        'expo-splash-screen',
        {
          image: './assets/splash-icon.png',
          backgroundColor: '#2563EB',
          imageWidth: 220,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'CargoLink usa tu ubicación para mostrar el seguimiento del viaje en tiempo real.',
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#2563EB',
        },
      ],
    ],
    extra: {
      // Leído en runtime desde src/config/env.ts. Si queda undefined, la app
      // deduce el host de la máquina de desarrollo desde el server de Metro.
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      // `eas init` no puede escribir en un app.config.js dinámico, así que el
      // projectId entra por env. Sin él, getExpoPushTokenAsync no puede emitir
      // token y registerForPushNotifications() devuelve null (ver README).
      eas: {
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
  },
});
