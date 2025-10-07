export async function getTasks(_, __, {mongo}) {
  return await mongo('main')
    .collection('tasks')
    .find({})
    .toArray();
}

export async function createTask({task: {title, description}}, _, {mongo}) {
  const id = Math.ceil(Math.random() * 100000);

  await mongo('main')
    .collection('tasks')
    .insertOne({id, title, description});

  return id;
}

export async function getTask({taskId}, _, {mongo}) {
  return await mongo('main')
    .collection('tasks')
    .findOne({id: taskId});
}

export async function updateTask({taskId, taskParams}, _, {mongo}) {
  await mongo('main')
    .collection('tasks')
    .updateOne({id: taskId}, {$set: taskParams});
}

export async function deleteTask({taskId}, _, {mongo}) {
  await mongo('main')
    .collection('tasks')
    .deleteOne({id: taskId});
}
