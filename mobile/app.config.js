/**
 * Config de Expo en JS (antes era app.json) para poder leer variables de entorno
 * en build time: la URL del API y el style del mapa cambian entre dev, el
 * entorno dev de Cloud Run y prod, y no queremos hardcodearlas ni commitear keys.
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
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          'CargoLink usa tu ubicación para mostrar el seguimiento del viaje en tiempo real.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'CargoLink usa tu ubicación en segundo plano para actualizar el seguimiento del viaje.',
        // Permite http:// contra el backend local durante desarrollo; en prod
        // las URLs de Cloud Run son https y no se apoya en esta excepción.
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
      // POST_NOTIFICATIONS no la agrega el plugin de expo-notifications: sin
      // declararla, en Android 13+ (API 33) `requestPermissionsAsync()` no
      // muestra el diálogo y las notificaciones de chat nunca aparecen.
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS'],
      // El mapa lo dibuja MapLibre con tiles de OpenStreetMap, así que no hay
      // bloque `config.googleMaps`: Android no necesita ninguna API key.
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
      // Baja el SDK nativo de MapLibre (Android: org.maplibre.gl, iOS: SPM) en
      // el prebuild. Sin el plugin el módulo nativo no queda linkeado y el mapa
      // tira "TurboModuleRegistry.getEnforcing" al montar.
      '@maplibre/maplibre-react-native',
    ],
    extra: {
      // Leído en runtime desde src/config/env.ts. Si queda undefined, la app
      // deduce el host de la máquina de desarrollo desde el server de Metro.
      apiUrl: process.env.EXPO_PUBLIC_API_URL,
      // Style de MapLibre. Por defecto OpenFreeMap (OSM, sin key ni cuota); se
      // puede apuntar a otro proveedor sin tocar código. Ver src/config/env.ts.
      mapStyleUrl: process.env.EXPO_PUBLIC_MAP_STYLE_URL,
      // `eas init` no puede escribir en un app.config.js dinámico, así que el
      // projectId entra por env. Sin él, getExpoPushTokenAsync no puede emitir
      // token y registerForPushNotifications() devuelve null (ver README).
      eas: {
        projectId: process.env.EAS_PROJECT_ID,
      },
    },
  },
});
