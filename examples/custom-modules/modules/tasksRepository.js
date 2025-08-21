export function make({sql, logger}) {
  return {
    action: () => ({
      async read() {
        logger('tasksRepository').info('Reading all tasks');

        return await sql('main').query`
          select *
          from tasks
      `;
      },
      async set({id, title, description}) {
        if (!id) {
          logger('tasksRepository').info('Creating a task');

          const [{id}] = await sql('main').query`
            insert into tasks (title, description)
            values (${title}, ${description ?? null}) returning (id)
        `;

          return id;
        } else {
          logger('tasksRepository').info('Updating a task');

          const newTitle = title !== undefined ?
            title :
            sql('main').raw`title`;
          const newDescription = description !== undefined ?
            description :
            sql('main').raw`description`;

          await sql('main').query`
            update tasks
            set title       = ${newTitle},
                description = ${newDescription}
            where id = ${id}
        `;

          return id;
        }
      },
      async get(id) {
        logger('tasksRepository').info('Reading tasks');
        const [task] = await sql('main').query`
          select *
          from tasks
          where id = ${id}
      `;

        if (!task) {
          throw new Error('Task not found');
        }

        return task;
      },
      async delete(id) {
        logger('tasksRepository').info('Deleting task');

        await sql('main').query`
          delete from tasks
          where id = ${id}
      `;
      }
    })
  };
}

export const name = 'tasksRepository';

export const require = ['sql', 'logger'];
