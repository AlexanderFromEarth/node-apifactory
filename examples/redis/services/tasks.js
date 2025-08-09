export async function getTasks(_, {redis}) {
  return await redis('main').keys('task:*')
    .then((keys) => keys.length ? redis('main').mGet(keys) : [])
    .then((values) => values.map(JSON.parse));
}

export async function createTask({task: {title, description}}, {redis}) {
  const id = await redis('main').incr('id')

  await redis('main').set(`task:${id}`, JSON.stringify({
    id,
    title,
    description
  }));

  return id;
}

export async function getTask({taskId}, {redis}) {
  return await redis('main').get(`task:${taskId}`)
    .then(JSON.parse);
}

export async function updateTask({taskId, taskParams}, {redis}) {
  const task = await redis('main').get(`task:${taskId}`)
    .then(JSON.parse);

  if ('title' in taskParams) {
    task.title = taskParams.title;
  }
  if ('description' in taskParams) {
    task.description = taskParams.description;
  }

  await redis('main').set(`task:${taskId}`, JSON.stringify(task));
}

export async function deleteTask({taskId}, {redis}) {
  await redis('main').del(`task:${taskId}`);
}
