import { Config } from './config'
import { Loader } from './loader'

export class Tasks extends Loader<AnyTaskDefinition> {
  constructor(private readonly config: Config) {
    super(config.logger, config.tasks)
  }

  protected async import(name: string, path: string) {
    const taskDefinition = await super.import(name, path)
    if (taskDefinition) taskDefinition.name ??= name
    return taskDefinition
  }
}
