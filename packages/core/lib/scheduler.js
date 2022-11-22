'use strict'

const { parseExpression } = require('cron-parser')
const EventEmitter = require('node:events')

class Scheduler extends EventEmitter {
  /**
   *
   * @param {import('../types/neemata').NeemataConfig['scheduler']} options
   */
  constructor({ tasks }) {
    super()

    this.tasks = tasks.map(({ task, name, cron, args, timeout }) => ({
      name,
      cron: parseExpression(cron),
      task,
      timeout,
      args: args ?? [],
    }))
  }

  async start() {
    const invoke = () => {
      const now = new Date()
      for (const { name, task, cron, args, timeout } of this.tasks) {
        if (this.check(cron, now)) {
          this.emit('task', { name, task, args, timeout })
        }
      }
    }

    this.interval = setInterval(invoke, 60 * 1000)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  check(cron, now) {
    const { fields } = cron
    return (
      fields.minute.includes(now.getMinutes()) &&
      fields.hour.includes(now.getHours()) &&
      fields.dayOfMonth.includes(now.getDate()) &&
      fields.month.includes(now.getMonth() + 1) &&
      fields.dayOfWeek.includes(now.getDay())
    )
  }
}

module.exports = { Scheduler }
