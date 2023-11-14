import {
  BaseExtension,
  ExtensionInstallOptions,
  Hook,
  ProviderDeclaration,
} from '@neemata/application'

import cronParser, { type CronExpression } from 'cron-parser'

type CronOptions = {
  cron: string
  provider: ProviderDeclaration<() => any>
}

type Cron = {
  expression: CronExpression
  timer?: ReturnType<typeof setTimeout>
  handler: () => any
}

export class CronExtension extends BaseExtension {
  name = 'Cron'

  registered!: Map<string, CronOptions>
  crons!: Map<string, Cron>
  application!: ExtensionInstallOptions<{}, {}>

  constructor() {
    super()
    this.registered = new Map()
    this.crons = new Map()
  }

  install(application: ExtensionInstallOptions<{}, {}>) {
    this.application = application
    this.application.registerHook(Hook.OnStart, async () => {
      for (const [name, { cron, provider }] of this.registered) {
        const expression = cronParser.parseExpression(cron)
        const handler = await this.application.container.resolve(provider)
        this.crons.set(name, { handler, expression })
        this.run(name)
      }
    })

    this.application.registerHook(Hook.OnStop, async () => {
      for (const cron of this.crons.values()) {
        cron.expression.reset()
        if (cron.timer) clearTimeout(cron.timer)
      }
    })
  }

  registerCron(name: string, cron: CronOptions) {
    this.registered.set(name, cron)
  }

  private run(name: string) {
    const cron = this.crons.get(name)
    const next = cron.expression.next()
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
