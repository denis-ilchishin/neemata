import { IParseOptions } from 'qs'
import { createLogger } from './logger'

export class Config {
  constructor(
    private readonly options: ApplicationOptions,
    public readonly port = options.port ?? '',
    public readonly hostname = options.hostname || '0.0.0.0',
    public readonly https = options.https,
    public readonly qsOptions: IParseOptions = options.qsOptions || {},
    public readonly api = options.api,
    public readonly applicationPath = options.applicationPath,
    public readonly workers = options.workers,
    public readonly errorHandlers = options.errorHandlers ?? [],
    public readonly procedures = options.procedures,
    public readonly tasks = options.tasks,
    public readonly logger = createLogger(options.logging?.level || 'info')
  ) {}
}
