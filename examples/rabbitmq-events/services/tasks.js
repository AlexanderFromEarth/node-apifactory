const tasks = new Map();

export async function createTask({task}) {
  tasks.set(task.id, task);
}
