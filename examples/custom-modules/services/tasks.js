export async function getTasks(_, {tasksRepository}) {
  return await tasksRepository().read();
}

export async function createTask({task: {title, description}}, {tasksRepository}) {
  return await tasksRepository().set({title, description});
}

export async function getTask({taskId}, {tasksRepository}) {
  return await tasksRepository().get(taskId);
}

export async function updateTask({taskId, taskParams}, {tasksRepository}) {
  await tasksRepository().set({...taskParams, id: taskId});
}

export async function deleteTask({taskId}, {tasksRepository}) {
  await tasksRepository().delete(taskId);
}
