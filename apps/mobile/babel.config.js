module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // React Native Reanimated — deve ser o último plugin
      'react-native-reanimated/plugin',
    ],
  };
};
