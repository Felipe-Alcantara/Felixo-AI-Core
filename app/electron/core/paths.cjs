const path = require('node:path')

const appRoot = path.join(__dirname, '..')
const preloadPath = path.join(appRoot, 'preload.cjs')
const rendererBuildPath = path.join(appRoot, '../dist/index.html')

module.exports = {
  appRoot,
  preloadPath,
  rendererBuildPath,
}
