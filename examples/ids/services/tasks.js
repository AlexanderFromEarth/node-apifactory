const tasks = new Map();

export async function getTasks(_, __, {ids}) {
  return Array.from(tasks.values(), ({id, ...task}) => ({
    ...task,
    id: ids({value: id}).toJSON()
  }));
}

export async function createTask({task}, _, {ids}) {
  const id = ids();

  tasks.set(id.valueOf(), {...task, id: id.valueOf()});

  return id.toJSON();
}

export async function getTask({taskId}, _, {ids}) {
  return tasks.get(ids(taskId).valueOf());
}

export async function updateTask({taskId, taskParams}, _, {ids}) {
  const task = tasks.get(ids(taskId).valueOf());

  if ('title' in taskParams) {
    task.title = taskParams.title;
  }
  if ('description' in taskParams) {
    task.description = taskParams.description;
  }
}

export async function deleteTask({taskId}, _, {ids}) {
  tasks.delete(ids(taskId).valueOf());
}
