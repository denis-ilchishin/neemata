import cronParser, { type CronExpression } from 'cron-parser'

import { BaseExtension, Hook, type Provider } from '@neematajs/application'

type CronHandler = () => any

type CronOptions = {
  expression: string | number
  provider?: Provider<CronHandler>
  handler?: CronHandler
}

type Cron = {
  cron?: CronExpression
  interval?: number
  timer?: ReturnType<typeof setTimeout>
  handler: CronHandler
}

export class CronExtension extends BaseExtension {
  name = 'Cron'

  crons!: Map<string, CronOptions & Cron>

  constructor() {
    super()
    this.crons = new Map()
  }

  initialize() {
    const { logger, registry, container } = this.application
    registry.registerHook(Hook.AfterInitialize, async () => {
      for (const [name, cron] of this.crons) {
        logger.info('Registering cron [%s] (%s)', name, cron.expression)

        if (typeof cron.expression === 'string') {
          cron.cron = cronParser.parseExpression(cron.expression)
        } else {
          cron.interval = cron.expression
        }

        cron.handler = cron.provider
          ? await container.resolve(cron.provider)
          : cron.handler

        this.run(name)
      }
    })

    registry.registerHook(Hook.BeforeTerminate, async () => {
      for (const { cron, timer } of this.crons.values()) {
        cron?.reset()
        if (timer) clearTimeout(timer)
      }
    })
  }

  registerCron(name: string, cron: CronOptions) {
    this.crons.set(name, cron as any)
  }

  private run(name: string) {
    const cron = this.crons.get(name)!
    let timeout: number

    if (cron.cron) {
      const next = cron.cron.next().getTime()
      timeout = next - Date.now()
    } else {
      timeout = cron.interval!
    }

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
