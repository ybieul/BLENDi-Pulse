// Polyfill para new URL() no engine Hermes (React Native).
// DEVE ser a primeira linha do entry point — antes de qualquer outro import.
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
