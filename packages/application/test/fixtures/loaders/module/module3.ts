import { testEvent, testProcedure, testTask } from 'test/_utils'

export default {
  tasks: {
    test: testTask().withHandler(() => void 0),
  },
  procedures: {
    test: testProcedure().withHandler(() => void 0),
  },
  events: {
    test: testEvent(),
  },
}
