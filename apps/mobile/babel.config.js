module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { unstable_transformImportMeta: true }],
    ],
    plugins: [
      // React Native Reanimated — deve ser o último plugin
      'react-native-reanimated/plugin',
    ],
  };
};
