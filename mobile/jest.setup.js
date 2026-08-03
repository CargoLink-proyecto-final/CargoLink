// AsyncStorage ships an official Jest mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Sin esto, SafeAreaProvider no renderiza a sus hijos bajo jest: espera un
// onLayout real para conocer los insets y mientras tanto devuelve null. El mock
// oficial de la librería entrega insets fijos.
// El mock usa `export default`, por eso hay que desenvolver `.default`.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

// react-native-maps depende de un TurboModule nativo que no existe bajo jest:
// importarlo tira "TurboModuleRegistry.getEnforcing(...) could not be found".
// Se mockea acá para que cualquier test que monte el árbol de navegación
// completo funcione. Los tests que ya lo mockean localmente pisan esta versión.
jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');

  const MapView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      fitToCoordinates: jest.fn(),
      animateToRegion: jest.fn(),
    }));
    return React.createElement(View, props);
  });
  MapView.displayName = 'MapView';

  const passthrough = (name) => {
    const Component = (props) => React.createElement(View, props);
    Component.displayName = name;
    return Component;
  };

  return {
    __esModule: true,
    default: MapView,
    Marker: passthrough('Marker'),
    Polyline: passthrough('Polyline'),
    Callout: passthrough('Callout'),
    Circle: passthrough('Circle'),
    PROVIDER_DEFAULT: 'default',
    PROVIDER_GOOGLE: 'google',
  };
});
