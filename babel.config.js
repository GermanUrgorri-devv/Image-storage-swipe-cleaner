module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // jsxImportSource habilita className en JSX con NativeWind v4
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [],
  };
};
