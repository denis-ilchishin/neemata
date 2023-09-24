/** @typedef {ReturnType<typeof createConfig>} Config */

/**
 * @param {import("../types").ApplicationConfig} appConf
 */
export const createConfig = (appConf) => {
  const port = appConf.port ?? ''
  const hostname = appConf.hostname || '0.0.0.0'
  const https = appConf.https
  const basePath = appConf.basePath || ''
  const qsOptions = appConf.qsOptions || {}
  const rpc = appConf.rpc
  const applicationPath = appConf.applicationPath
  const tasker = appConf.tasker

  return {
    basePath,
    applicationPath,
    https,
    qsOptions,
    rpc,
    hostname,
    port,
    tasker,
  }
}
