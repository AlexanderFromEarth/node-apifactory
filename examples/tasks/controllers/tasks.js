const tasks = new Map();
let lastId = 0;

export async function getTasks() {
  return Array.from(tasks.values());
}

export async function createTask(params) {
  lastId++;
  tasks.set(lastId, {...params.body, id: lastId});

  return lastId;
}

export async function getTask(params) {
  return tasks.get(params.taskId);
}

export async function updateTask(params) {
  const task = tasks.get(params);

  if ('title' in params) {
    task.title = params.title;
  }
  if ('description' in params) {
    task.description = params.description;
  }
}

export async function deleteTask(params) {
  tasks.delete(params.taskId);
}
