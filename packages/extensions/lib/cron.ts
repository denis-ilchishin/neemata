import {
  BaseExtension,
  ExtensionInstallOptions,
  Hook,
  ProviderDeclaration,
} from '@neemata/application'

import cronParser, { type CronExpression } from 'cron-parser'

type CronHandler = () => any

type CronOptions = {
  expression: string
  provider?: ProviderDeclaration<CronHandler>
  handler?: CronHandler
}

type Cron = {
  cron: CronExpression
  timer?: ReturnType<typeof setTimeout>
  handler: CronHandler
}

export class CronExtension extends BaseExtension {
  name = 'Cron'

  crons!: Map<string, CronOptions & Cron>
  application!: ExtensionInstallOptions<{}, {}>

  constructor() {
    super()
    this.crons = new Map()
  }

  install(application: ExtensionInstallOptions<{}, {}>) {
    this.application = application
    const { logger, registerHook, container } = this.application
    registerHook(Hook.OnStart, async () => {
      for (const [name, cron] of this.crons) {
        logger.info('Registering cron [%s] (%s)', name, cron.expression)
        cron.cron = cronParser.parseExpression(cron.expression)
        cron.handler = cron.provider
          ? await container.resolve(cron.provider)
          : cron.handler
        this.run(name)
      }
    })

    registerHook(Hook.OnStop, async () => {
      for (const { cron, timer } of this.crons.values()) {
        cron.reset()
        if (timer) clearTimeout(timer)
      }
    })
  }

  registerCron(name: string, cron: CronOptions) {
    this.crons.set(name, cron as any)
  }

  private run(name: string) {
    const cron = this.crons.get(name)
    const next = cron.cron.next()
    const timeout = next.getTime() - Date.now()

    cron.timer = setTimeout(async () => {
      this.application.logger.info('Running cron [%s]', name)
      try {
        await cron.handler()
      } catch (cause) {
        const error = new Error('Cron failed', { cause })
        this.application.logger.error(error)
      } finally {
        this.run(name)
      }
    }, timeout)
  }
}
