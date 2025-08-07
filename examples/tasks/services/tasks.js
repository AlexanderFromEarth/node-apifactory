const tasks = new Map();
let lastId = 0;

export async function getTasks() {
  return Array.from(tasks.values());
}

export async function createTask(params) {
  lastId++;
  tasks.set(lastId, {...params.task, id: lastId});

  return lastId;
}

export async function getTask(params) {
  return tasks.get(params.taskId);
}

export async function updateTask(params) {
  const task = tasks.get(params.taskId);

  if ('title' in params.taskParams) {
    task.title = params.taskParams.title;
  }
  if ('description' in params.taskParams) {
    task.description = params.taskParams.description;
  }
}

export async function deleteTask(params) {
  tasks.delete(params.taskId);
}
