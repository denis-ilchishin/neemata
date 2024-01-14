import { WorkerType } from '..'
import { Application, ApplicationOptions } from '../lib/application'

export const defaultTimeout = 1000
export const defaultApp = (
  options: ApplicationOptions = {
    type: WorkerType.Api,
    events: { timeout: defaultTimeout },
    loaders: [],
    procedures: {
      timeout: defaultTimeout,
    },
    tasks: {
      timeout: defaultTimeout,
    },
    logging: {
      pinoOptions: { enabled: false },
    },
  }
) => new Application(options)
