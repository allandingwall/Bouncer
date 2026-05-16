module.exports = {
  sourceDir: 'dist',
  artifactsDir: '.web-ext-artifacts',
  build: {
    overwriteDest: true,
  },
  run: {
    startUrl: ['about:debugging#/runtime/this-firefox'],
  },
  ignoreFiles: ['*.map'],
};
