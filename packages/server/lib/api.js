/** @typedef {Awaited<ReturnType<typeof createApi>>} Api */

import { ApiError } from '@neemata/common'
import { resolve } from 'node:path'
import { createLoader } from './loader'

/**
 * @param {import('./config').Config} config
 * @param {any} userApp
 */
export const createApi = async (config, userApp) => {
  const procedures = new Map()
  const errorHandlers = new Map(userApp.errorHandlers ?? [])

  if (typeof userApp.procedures === 'string') {
    const loader = createLoader(resolve(userApp.procedures))
    await loader.reload()
    for (const [key, path] of loader.modules) {
      procedures.set(key, await import(path).then((module) => module.default))
    }
  } else {
    for (const [key, value] of Object.entries(userApp.procedures)) {
      procedures.set(key, value)
    }
  }

  /**
   * @param {import('./container').Container} container
   * @param {string} name
   */
  const findProcedure = async (container, name) => {
    const procedure = procedures.get(name)
    const resolved = await procedure(container.inject, container.params)
    return resolved
  }

  /**
   * @param {Error} error
   */
  const handleError = (error) => {
    if (!errorHandlers.size) {
      for (const errorHandler of errorHandlers.values()) {
        if (errorHandler === error.constructor) {
          const handledError = errorHandler(error)
          if (!handledError || handledError.constructor !== ApiError) {
            console.warn(
              `Error handler for ${error.constructor.name} did not return an ApiError, therefore is ignored.`
            )
            break
          }
          return handleError
        }
      }
    }
    return error
  }

  return { get: findProcedure, handleError }
}