const { parseExpression } = require('cron-parser')

class Scheduler {
  tasks = {}

  constructor(neemata) {
    this.neemata = neemata

    for (const { task, name, cron, args } of neemata.appConfig.scheduler
      .tasks) {
      this.neemata.console.debug(
        `Setting scheduler task "${name}" [${task}]`,
        'Scheduler'
      )
      this.tasks[name] = { cron: parseExpression(cron), task, args }
    }
  }

  start() {
    this.interval = setInterval(() => {
      const now = new Date()
      for (const [name, { task, cron, args }] of Object.entries(this.tasks)) {
        if (this.check(cron, now)) {
          this.neemata.console.info(
            `Invoking scheduler task "${name}" [${task}]`,
            'Scheduler'
          )

          this.neemata.workerPool.next().then((worker) => {
            worker.postMessage({ event: 'task-request', task, args })
          })
        }
      }
    }, 60 * 1000)
  }

  stop() {
    if (this.interval) clearInterval(this.interval)
  }

  check(cron, now) {
    return (
      cron.fields.minute.includes(now.getMinutes()) &&
      cron.fields.hour.includes(now.getHours()) &&
      cron.fields.dayOfMonth.includes(now.getDate()) &&
      cron.fields.month.includes(now.getMonth() + 1) &&
      cron.fields.dayOfWeek.includes(now.getDay())
    )
  }
}

module.exports = { Scheduler }
