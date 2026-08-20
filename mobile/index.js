import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent llama a AppRegistry.registerComponent('main', ...) y además
// configura el entorno para que la app funcione tanto en Expo Go como en un build nativo.
registerRootComponent(App);
