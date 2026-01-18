# Ratelimiter - NGINX, Docker & NodeJs
## What are we trying to do
Create a basic ExpressJs API, use docker containerize it; use docker compose to spin up 3 API Servers and a Nginx as a Ratelimiter, Load balancer, API Gateway.  
The reason we are using ExpressJS and docker is to visualize how the ratelimiter and load balancers work together to limit the whole request using ip hashing and other methods.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs\design-d.svg">
  <source media="(prefers-color-scheme: light)" srcset="docs\design-l.svg">
  <img src="docs\design-d.svg" alt="Design Diagram">
</picture>

### How the system is designed
- An ExpressJs App having a simple API
- Containerize the API using Docker
- Use Nginx to setup a reverse proxy, load balancer and a rate limiter
- Use Docker Compose to spin up the instances
  - 3 ExpressJs API servers
  - A Nginx Server 

## ExpressJs API

**API End Points**
- GET [/items]
  - ``` { "id": <UUID>, "name" : "<item_name>" } ``` 
  - Gets the list of items that is present on that server.
- POST [/items] 
  - ``` body: { "name" : "<item_name>" } ```
  - Creates a new item with item_name and a randomUUID as id on that server.

For making the system a lot simpler, we don't any database and used a simple dictionary within the server for storing the items.
These items will be deleted when the server exits or stops.  


<details>
  <summary>File: *src/data/item.store.ts*</summary>
  
```typescript
export let items: Item[] = [
  {
    id: randomUUID(),
    name: "Test Items",
  },
];

```
</details>


**Environment Variables**
- API_PORT - Port for the API Server
- API_ENV - Environment for the server - 'development' or 'production'

These variable should be provided to the docker environment.

## Containerizing API
This is straight forward. We need to create a docker image that can be used with docker compose to start the servers.


```docker
FROM node:24.12-alpine AS builder

WORKDIR /app

COPY package*.json /.

RUN npm install

COPY . .

RUN npm run build


FROM node:24.12-alpine AS runner

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE $API_PORT

CMD [ "node", "dist/server.js" ]
```

I used a builder to build the Express App and the from the builder image, we copied just the required files- ./dist folder; into our final image for the API server. This way we can avoid having source code in our final image and make our Server Image much less in size by avoiding unwanted packages and modules.

I are also exposing the `API_PORT` for the Nginx Server to communicate with the API Server. This API_PORT is an Environment Variable that is provided when starting the API server using Docker Compose. This way we can avoid any hardcoded PORTs and certain security flaws. Usually, it is recommended to keep the configurations in the Environment Variables.

## NGINX Server / Reverse Proxy
*nginx ("engine x") is an HTTP web server, reverse proxy, content cache, load balancer, TCP/UDP proxy server, and mail proxy server.*

This is where our Rate Limiter, Reverse Proxy and Load Balancer lives. It is fairly simple to configure a basic server having these features.

Here, I have used a template configuration so that we use environment variables.

### File: `default.conf.template`  
We declare a limit_req_zone to set the limits how the rate limiter should work.  
 `limit_req_zone $binary_remote_addr zone=items_api:10m rate=10r/m;`

This sets the ratelimiting to 10 request per minute. This was set to test if the ratelimiting is working.
You can set this to a limit like 10s/s - 10 requests per second. NGINX tracks the request per milliseconds, so this limit means that you can make 1 request every 100 milliseconds. 

`$binary_remote_addr` - we are using the binary representation of the client's IP address. This is more storage efficient than storing the IP Address as a string. 

`zone=items_api` - Naming the zone, so that we can specify this zone when we are defining our reverse proxy.

We then define an upstream for the ExpressJS API
```nginx
upstream items_api {
    ip_hash;
    server prod_api:${API_PORT};
}
```
`${API_PORT}` will be replaced by the environment variable.
We use the ip_hash algorithm to direct request to any one of the server : prod_api;
We are spinning up 3 instances of the prod_api and the NGINX will automatically map the PORTS to the request. 
How IP Hashing works is that, one IP will always be directed to one server; This is a static load balancing algorithm.

When getting the items after running the server, if **ip_hash** is used we will see the `id` as same for all subsequent request as each client is always hitting the same server. Change it to `round-robin` then we will see the `id` change with each request from the same client; as request is being directed to different servers on each request.

### Nginx Load Balancing Strategies  
- Round Robin (Default): This method cycles through your servers in a sequential order. Each new request is sent to the next server in line, ensuring an even, rotational distribution of the workload. Use *round-robin*.

- Least Connections: This is a "smart" distribution strategy that directs the next request to whichever server is currently handling the fewest active tasks. It is ideal for situations where requests take varying amounts of time to process. Use *least-connected*.

- IP Hash: This approach uses the client's IP address to consistently map them to a specific backend server. It is primarily used for session persistence, ensuring a user stays connected to the same server throughout their visit. Use *ip-hash*.

**Now, let look at the reverse proxy config**
```nginx
server {
    ....

    location / {
            limit_req zone=items_api burst=10 nodelay;
            limit_req_status 429;
            limit_conn_status 429;

            proxy_pass http://items_api;

            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
}
```

We have set the `limit_req` zone to `items_api`. Setting burst=10 means, a client as request at most 10 request in a burst. The burst parameter defines how many requests a client can make in excess of the rate specified by the zone.

By default, nginx responds with a status 503 when the client exceeds its limit. We can change the status code using limit_req_status and limit_conn_status.
We set it to 429, which means *Too Many Request*. This way the client knows that it has exceeded the limit. We can add more details in the header like **Retry-After** to inform the clients how long to wait before hitting the server again.

<details>
<summary> Complete <b>File: default.conf.template</b> </summary>

```
limit_req_zone $binary_remote_addr zone=items_api:10m rate=10r/m;

upstream items_api {
    ip_hash;
    server prod_api:${API_PORT};
}

server {
    listen 80;
    server_name localhost;

    location /health {
        access_log off;
        return 200 'OK';
    }

    location / {
        limit_req zone=items_api burst=10 nodelay;
        limit_req_status 429;
        limit_conn_status 429;

        proxy_pass http://items_api;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
</details>

## Docker Compose  

*Docker Compose is a management tool designed to coordinate multi-container applications. Instead of managing each container individually, it allows you to define your entire application stack—including services, networking, and data storage—within a single YAML configuration file.*

### For Items API Server
```yaml
prod_api:
    image: items-api:latest
    env_file:
      - api.env
    deploy:
      replicas: 3
    restart: on-failure
    expose:
      - $API_PORT
    networks:
      - prod-network
```
This is part where we spin up 3 servers for items-api
We set all the requires environment variable in the *api.env* file.
```
API_PORT=3005
API_ENV=production
```

### For NGINX Server  

```yaml
gateway:
    image: nginx:alpine
    environment:
      - API_PORT=3005
    ports:
      - 3000:80
    volumes:
      - ./nginx/default.conf.template:/etc/nginx/templates/default.conf.template:ro
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - prod_api
    networks:
      - prod-network
```

Note we are copying the *default.conf.template* to */etc/nginx/templates/* folder. This is required as the server replacing the env variables in the template.

## Deploying the Project  

Ensure you have **Docker** and **Docker Compose** installed on your machine.


### 1. Configuration Files  
Before running the application, ensure the following files are present:

- *api.env* : Contains environment variables required by the prod_api service.
- *./nginx/default.conf.template* : The Nginx template that utilizes environment variables.
- *./nginx/nginx.conf* : The main Nginx configuration file.

### 2. Build and Publish the Docker Image  

Open a terminal and navigate to **item-api** folder and run the following command  
`docker build -t items-api:latest .`   

Now we have the Docker Image for starting the servers. It will be present in the local Docker Images.

### 3. Deployment
To launch the entire stack in detached mode, navigate back to the root directory and run:

```bash
docker compose up -d
```

### 4. Scaling
While the file is set to 3 replicas by default, you can manually scale the API service using:

```bash
docker compose up -d --scale prod_api=5
```

### 5. Stopping the Services
To stop and remove all containers and networks:

```bash
docker compose down
```