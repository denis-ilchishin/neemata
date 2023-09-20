/** @typedef {ReturnType<typeof createConfig>} Config */

/**
 * @param {ApplicationConfig} appConf
 */
export const createConfig = (appConf) => {
  const port = appConf.port
  const hostname = appConf.hostname || '0.0.0.0'
  const https = appConf.https || false
  const basePath = appConf.basePath || ''
  const qsOptions = appConf.qsOptions || {}
  const rpc = appConf.rpc
    ? {
        concurrency: appConf.rpc.concurrency || 1,
        size: appConf.rpc.queueSize || 5,
        timeout: appConf.rpc.queueTimeout || 10,
      }
    : null
  return { basePath, https, qsOptions, rpc, hostname, port }
}
