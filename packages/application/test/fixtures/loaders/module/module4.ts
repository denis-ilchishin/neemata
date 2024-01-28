import { testEvent, testProcedure, testTask } from 'test/_utils'

export const tasks = {
  test: testTask().withHandler(() => void 0),
}

export const procedures = {
  test: testProcedure().withHandler(() => void 0),
}

export const events = {
  test: testEvent(),
}
