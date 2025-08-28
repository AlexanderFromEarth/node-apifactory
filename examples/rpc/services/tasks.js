const tasks = new Map();
let lastId = 0;

export async function getTasks() {
  return Array.from(tasks.values());
}

export async function createTask({task}) {
  lastId++;
  tasks.set(lastId, {...task, id: lastId});

  return lastId;
}

export async function getTask({taskId}) {
  return tasks.get(taskId);
}

export async function updateTask({taskId, taskParams}) {
  const task = tasks.get(taskId);

  if ('title' in taskParams) {
    task.title = taskParams.title;
  }
  if ('description' in taskParams) {
    task.description = taskParams.description;
  }
}

export async function deleteTask({taskId}) {
  tasks.delete(taskId);
}
