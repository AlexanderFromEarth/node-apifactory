export async function getTasks(_, __, {tasksRepository}) {
  return await tasksRepository().read();
}

export async function createTask({task: {title, description}}, _, {tasksRepository}) {
  return await tasksRepository().set({title, description});
}

export async function getTask({taskId}, _, {tasksRepository}) {
  return await tasksRepository().get(taskId);
}

export async function updateTask({taskId, taskParams}, _, {tasksRepository}) {
  await tasksRepository().set({...taskParams, id: taskId});
}

export async function deleteTask({taskId}, _, {tasksRepository}) {
  await tasksRepository().delete(taskId);
}
