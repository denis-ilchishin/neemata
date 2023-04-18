// import { Loader } from './loader'

// export class Api {
//   constructor(workerApp) {
//     this._container = workerApp.container
//     this._schemaType = workerApp.config.api.schema
//     this._loader = new Loader(path('api'), { logErrors })
//     this._registry = new Map()
//   }

//   async load() {
//     const procedures = await this._loader.load()
//     this._registry = new Map()
//     for (const procedure of procedures) {
//       try {
//         await this._loadProcedure(procedure)
//         this._registry.set(procedure.name, procedure)
//       } catch (error) {
//         if (this.workerApp.workerId === 1) {
//           logger.warn('Failed to load procedure: ' + procedure.path)
//           logger.error(error)
//         }
//       }
//     }
//   }

//   async get(procedureName, container) {
//     return _cec
//   }

//   _loadProcedure(procedure) {
//     for (const dep of procedure.deps) {
//       if (!this._container.registry.has(dep))
//         throw new Error('Dependency not found: ' + dep)
//     }
//   }
// }
