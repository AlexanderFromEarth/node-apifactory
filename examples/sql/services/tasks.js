export async function getTasks(_, __, {sql}) {
  return await sql('main').query`
      select *
      from tasks
  `;
}

export async function createTask({task: {title, description}}, _, {sql}) {
  const [{id}] = await sql('main').query`
      insert into tasks (title, description)
      values (${title}, ${description ?? null}) returning (id)
  `;

  return id;
}

export async function getTask({taskId}, _, {sql}) {
  const [task] = await sql('main').query`
      select *
      from tasks
      where id = ${taskId}
  `;

  return task;
}

export async function updateTask({taskId, taskParams}, _, {sql}) {
  const title = 'title' in taskParams ?
    taskParams.title :
    sql('main').raw('title');
  const description = 'description' in taskParams ?
    taskParams.description :
    sql('main').raw('description');

  await sql('main').query`
      update tasks
      set title       = ${title},
          description = ${description}
      where id = ${taskId}
  `;
}

export async function deleteTask({taskId}, _, {sql}) {
  await sql('main').query`
      delete
      from tasks
      where id = ${taskId}
  `;
}
