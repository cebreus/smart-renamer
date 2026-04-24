/** @type {import('dependency-cruiser').IConfiguration} */
const config = {
  extends: 'dependency-cruiser/configs/recommended',
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
  },
}

export default config
