# Apifactory (NodeJS)

Web framework for API-first development via OpenAPI specification with included validation according
to OpenAPI based on fastify and @apidevtools/json-schema-ref-parser.

## Installation

```bash
npm install node-apifactory
```

## Usage

For more detailed and complex examples, check the examples directory.

### ./openrpc.yml
```yaml
openrpc: 1.2.1
info:
  title: Title
  version: 1.0.0
servers:
  - url: 'http://localhost:8001'
  - url: 'http://localhost:8001'
    x-labels:
      app: tasks
methods:
  # should correlate with method in services directory
  - name: createTask
    params:
      - name: userId
        required: true
        schema:
          type: integer
      - name: task
        required: true
        schema:
          type: object
          required:
            - title
            - descr
          properties:
            title:
              type: string
            descr:
              type: string
    result:
      name: newTask
      required: true
      schema:
        type: object
        required:
          - id
        properties:
          id:
            type: integer
```

### ./openapi.yml
```yaml
openapi: 3.1.0
info:
  title: Title
  description: Title
  version: 1.0.0
servers:
  - url: 'http://localhost:8000'
  - url: 'http://localhost:8000'
    x-labels:
      app: tasks
paths:
  /users/{userId}/tasks:
    parameters:
      - name: userId
        in: path
        required: true
        schema:
          type: integer
    post:
      # should correlate with method in services directory
      operationId: createTask
      requestBody:
        x-name: task
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - title
                - descr
              properties:
                title:
                  type: string
                descr:
                  type: string
      responses:
        200:
          description: ok
          content:
            application/json:
              schema:
                type: object
                required:
                  - id
                properties:
                  id:
                    type: integer
                    format: int32
```

### ./asyncapi.yml
```yaml
asyncapi: 3.0.0
info:
  title: Title
  description: Title
  version: 1.0.0
servers:
  redis-local:
    host: localhost
    pathname: /5
    protocol: redis
    x-labels:
      app: tasks
defaultContentType: application/json
channels:
  taskCreated:
    address: tasks.created
    messages:
      taskCreated:
        payload:
          type: object
          required:
            - userId
            - task
          properties:
            userId:
              type: integer
            task:
              type: object
              required:
                - title
                - descr
              properties:
                title:
                  type: string
                descr:
                  type: string
operations:
  # should correlate with method in services directory
  createTask:
    action: receive
    channel:
      $ref: '#/channels/taskCreated'
    messages:
      - $ref: '#/channels/taskCreated/messages/taskCreated'
```

### ./modules/tasksRepository.js
```js
//name of module ignored totally

// required: this function builds module
export function make({logger}) {
  const map = new Map();

  return {
    // required: this will be used as module function passed to service
    action: () => ({
      set(id, task) {
        logger().debug('setting task');
        map.set(id, task);
      }
    }),
    // optional: there can be some clean effects
    dispose: () => {
      map.clear();
    }
  };
}

// required: this would be used as name of module
export const name = 'tasksRepository';

// optional: this hints for other required modules
export const require = ['logger'];
```

### ./services/tasks.js
```js
// name of module ignored totally

// first arg: passed parameters
// second arg: modules
// third arg: meta info
export async function createTask({task}, _, {ids, tasksRepository}, {links}) {
  const id = ids();

  tasksRepository.set(id.valueOf(), {...task, id: id.valueOf()});

  links.self = `/tasks/${id.toJSON()}`;

  return id.toJSON();
}
```

### ./app.js
```js
import app from 'node-apifactory';

await app();
```

## Configuration

All configurable parameters set by environment variables.
Below listed variables and their purposes with default values:

```dotenv
# Sets path to directory with service files
SERVICES_PATH=./services
# Sets path to directory with module files
MODULES_PATH=./modules
# Sets global log level
LOG_LEVEL=info
# Sets database connection url, prefix before _DATABASE_URL used as name of connection
PREFIX_DATABASE_URL=
# Sets redis connection url, prefix before _REDIS_URL used as name of connection
PREFIX_REDIS_URL=
# Sets path to root of OpenAPI specification
HTTP_SPEC_PATH=./openapi.yml
# Sets HTTP log level
HTTP_LOG_LEVEL=info
# Sets HTTP varible that modifies selected server url, postfix after HTTP_VARIABLE used as variable name
HTTP_VARIABLE_POSTFIX=
# Sets HTTP hable that used for selection server url, postfix after HTTP_LABEL used as label name
HTTP_LABEL_POSTFIX=
# Sets path to root of OpenRPC specification
RPC_SPEC_PATH=./openrpc.yml
# Sets RPC log level
RPC_LOG_LEVEL=info
# Sets RPC varible that modifies selected server url, postfix after RPC_VARIABLE used as variable name
RPC_VARIABLE_POSTFIX=
# Sets RPC hable that used for selection server url, postfix after RPC_LABEL used as label name
RPC_LABEL_POSTFIX=
# Sets path to root of AsyncAPI specification
EVENTS_SPEC_PATH=./asyncapi.yml
# Sets events log level
EVENTS_LOG_LEVEL=info
# Sets events varible that modifies selected server url, postfix after EVENTS_VARIABLE used as variable name
EVENTS_VARIABLE_POSTFIX=
# Sets events hable that used for selection server url, postfix after EVENTS_LABEL used as label name
EVENTS_LABEL_POSTFIX=
```
