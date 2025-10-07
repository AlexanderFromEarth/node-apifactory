let idx = 0;
const tasks = new Map();

export async function createTasks({tasks}, _, {events}) {
  for (const task of tasks) {
    events().taskCreated({task: {...task, id: ++idx}});
  }
}

export async function createTask({task}) {
  tasks.set(task.id, task);
}
