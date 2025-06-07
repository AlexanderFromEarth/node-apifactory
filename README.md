# Apifactory (NodeJS)

Web framework for API-first development via OpenAPI specification with included validation according
to OpenAPI based on fastify and @apidevtools/json-schema-ref-parser.

## Installation

```bash
npm install node-apifactory
```

## Usage

For more detailed and complex examples, check the examples directory.

### ./spec.yml
```yaml
openapi: 3.1.0
info:
  title: Title
  description: Title
  version: 1.0.0
servers:
  - url: 'http://127.0.0.1:8000'
paths:
  /users/:userId/tasks:
    parameters:
      - name: userId
        in: path
        required: true
        schema:
          type: integer
          format: int32
    post:
      # should correlate with method in controllers directory
      operationId: createTask
      requestBody:
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

### ./controllers/tasks.js
```js
// name of module ignored totally

const tasks = new Map();
let lastId = 0;

export async function createTask(params) {
  lastId++;
  tasks.set(lastId, {...params.body, id: lastId});

  return lastId;
}
```

### ./app.js
```js
import {service} from 'node-apifactory';

const app = await service();

app.listen({port: 8000});
```

## Configuration

All configurable parameters set by environment variables.
Below listed variables and their purposes with default values:

```dotenv
# Sets path to directory with controller files
APIFACTORY_CONTROLLERS_PATH=./controllers
# Sets path to root of OpenAPI specification
APIFACTORY_SPEC_PATH=./spec.yml
```
