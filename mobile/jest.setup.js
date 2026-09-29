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

// MapLibre depende de módulos nativos que no existen bajo jest: importarlo tira
// "TurboModuleRegistry.getEnforcing(...) could not be found". Se mockea acá para
// que cualquier test que monte el árbol de navegación completo funcione. Los
// tests que ya lo mockean localmente pisan esta versión.
jest.mock('@maplibre/maplibre-react-native', () => {
  const React = require('react');
  const { View } = require('react-native');

  const passthrough = (name) => {
    const Component = (props) => React.createElement(View, props);
    Component.displayName = name;
    return Component;
  };

  const Camera = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      fitBounds: jest.fn(),
      flyTo: jest.fn(),
      jumpTo: jest.fn(),
    }));
    return React.createElement(View, props);
  });
  Camera.displayName = 'Camera';

  return {
    __esModule: true,
    Map: passthrough('Map'),
    Camera,
    Marker: passthrough('Marker'),
    GeoJSONSource: passthrough('GeoJSONSource'),
    Layer: passthrough('Layer'),
    ViewAnnotation: passthrough('ViewAnnotation'),
    UserLocation: passthrough('UserLocation'),
  };
});
