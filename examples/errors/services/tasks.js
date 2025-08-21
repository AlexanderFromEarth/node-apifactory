import {alreadyExists} from '../../../src/result.js';

const tasks = new Map();
const existTitles = new Set();
let lastId = 0;

export async function getTasks() {
  return Array.from(tasks.values());
}

export async function createTask({task}, {alreadyExists}) {
  if (existTitles.has(task.title)) {
    return alreadyExists('tasks', task.title);
  }

  lastId++;
  tasks.set(lastId, {...task, id: lastId});
  existTitles.add(task.title);

  return lastId;
}

export async function getTask({taskId}, {notExists}) {
  if (!tasks.has(taskId)) {
    return notExists('tasks', taskId);
  }

  return tasks.get(taskId);
}

export async function updateTask({taskId, taskParams}, {notExists}) {
  if (!tasks.has(taskId)) {
    return notExists('tasks', taskId);
  }

  const task = tasks.get(taskId);

  if ('title' in taskParams) {
    if (task.title !== taskParams.title && existTitles.has(taskParams.title)) {
      return alreadyExists('tasks', task.title);
    }

    existTitles.remove(task.title);
    task.title = taskParams.title;
    existTitles.add(task.title);
  }
  if ('description' in taskParams) {
    task.description = taskParams.description;
  }
}

export async function deleteTask({taskId}, {notExists}) {
  if (!tasks.has(taskId)) {
    return notExists('tasks', taskId);
  }

  const task = tasks.get(taskId);

  tasks.delete(taskId);
  existTitles.delete(task.title);
}
