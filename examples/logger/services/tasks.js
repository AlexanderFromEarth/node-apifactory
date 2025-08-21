const tasks = new Map();
let lastId = 0;

export async function getTasks(_, __, {logger}) {
  logger().info('Getting tasks');

  return Array.from(tasks.values());
}

export async function createTask({task}, _, {logger}) {
  logger().info('Creating new task');
  lastId++;
  tasks.set(lastId, {...task, id: lastId});

  return lastId;
}

export async function getTask({taskId}, _, {logger}) {
  logger().info('Getting task');
  return tasks.get(taskId);
}

export async function updateTask({taskId, taskParams}, _, {logger}) {
  logger().info('Updating task');
  const task = tasks.get(taskId);

  if ('title' in taskParams) {
    task.title = taskParams.title;
  }
  if ('description' in taskParams) {
    task.description = taskParams.description;
  }
}

export async function deleteTask({taskId}, _, {logger}) {
  logger().info('Deleting task');
  tasks.delete(taskId);
}
