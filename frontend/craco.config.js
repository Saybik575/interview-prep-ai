// craco.config.js
module.exports = {
  style: {
    postcss: {
      mode: 'file',
    },
  },
  devServer: {
    setupMiddlewares: (middlewares, devServer) => {
      // Custom middleware setup to replace deprecated onAfterSetupMiddleware and onBeforeSetupMiddleware
      return middlewares;
    },
    client: {
      logging: 'none',
    },
  },
  webpack: {
    configure: (webpackConfig) => {
      // Disable source map warnings for cleaner output
      webpackConfig.ignoreWarnings = [
        /Failed to parse source map/,
        /Critical dependency: the request of a dependency is an expression/,
        /Module not found/,
        /the request of a dependency is an expression/,
      ];
      
      // Avoid manipulating stats object incorrectly (caused schema error previously)
      // Instead rely on ignoreWarnings which is supported.
      // If further suppression is needed, can set webpackConfig.infrastructureLogging = { level: 'error' }.
      webpackConfig.infrastructureLogging = {
        level: 'error',
      };
      
      return webpackConfig;
    },
  },
}
