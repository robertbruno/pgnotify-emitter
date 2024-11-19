# pgnotify-emitter

🇪🇸 [Go to spanish version](docs/README_ES.md)

## Introduction
This is a simple nodejs application that allows PostgreSQL to send messages to a emitter server using [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html).

For example, in SQL you can run the following query:

```sql
SELECT pgnotify_emitter.keygen('emitter-channel-demo1','{
    "channel": "test/"
}');

SELECT pgnotify_emitter.publish('emitter-channel-demo1','{
    "channel": "test/1",
    "message": "xxxxxxx"
}');
```

This application will then immediately send a message to a emitter channel.
You can then have an application listen for messages with that key and process those events immediately.

Some structure and elements are expected in the database which you need to create by running the following script:

* [scripts/notify-emitter.sql](scripts/notify-emitter.sql)

Every time the application starts it will execute the function `"notify_emitter"."handle_ack"()` with the intention of processing messages without ack.

> For more info see:
> * [Database Functions](docs/DBFUNCTION.md)

## Development

* **Clone** Ejecutar el clone del repositorio en su ambiente local:
```bash
# clon del repositorio
git clone https://github.com/robertbruno/pgnotify-emitter.git \
    ~/workspace/workspace-node/pgnotify-emitter/

# Ingresamos al repo
cd  ~/workspace/workspace-node/pgnotify-emitter/src
```

* **npm** Dependencias npm
```bash
npm i --unsafe-perm
```

* **docker-compose:** Puede ejecutar todos los servicios necesarios usando docker-compose, este proyecto posee un script npm que le permite la ejecución sin problemas de estos servicios:

```bash
# Builds, (re)creates, starts containers.
npm run docker:compose:up

# Stops and removes containers, networks, volumes, and images created by up
npm run docker:compose:down
```

> Para mayor información sobre docker  compose visite:
>
> * [docs.docker.com](https://docs.docker.com/compose/reference/)


## Configuration

You need to provide a [config.yaml](src/config.yaml) file containing details about your database - a template is provided in the repository.

It consists of three sections:

### databases

This section contains connection details to connect to your databases:

```yml
databases:
    testDB:
        enabled: true
        host: localhost
        port: 5432
        database: postgres
        user: postgres
        password: postgres
        ssl: false
```

> You need to run the scripts [scripts/notify-emitter.sql](scripts/notify-emitter.sql) in each database.
> Here we have just one database configured called testDB which will be referred to later.

### emitter

This section defines details of the emitter instances you want to connect to.
It simply consists of a name for the instance and the connection URI to connect to it.

```yml
# emitter servers configuration
emitters:
    local:
        enabled: true
        host: localhost
        port: 8080
        secure: false
```

## Environment

You can use environment variables to configure the service, for more info about it see:

* [src/templates/config.yaml.template](src/templates/config.yaml.template)

> To avoid conflicts in configuration files, if you want to use environment variables you must specify `USE_TEMPLATE` to true

Optional you can set `HANDLE_ACK` environment variable in tue  to run `SELECT pgnotify_emitter.handle_ack();` on app startup.

## Running docker

To run first create a config.yaml file with your configuration then run:

```bash
docker run -d -v $(pwd)/config.yaml:/opt/config.yaml robertbruno/pgnotify-emitter:latest
```

## Monitoring with Prometheus and Grafana.

[Prometheus](https://prometheus.io/) It logs real-time metrics to a time-series database built using an HTTP pull model, with flexible queries and real-time alerts.
[Grafana](https://grafana.com/) that allows the display and formatting of metric data. Allows you to create dashboards and graphs from multiple sources, including time series databases

You can visualize this metrics in [Grafana](https://grafana.com/) with the following dashboard:

* [scripts/grafana-dashboard.json](scripts/grafana-dashboard.json)

> For more info about metrics visit:
>
> * [Metrics docs](docs/METRICS.md)


## Help

* To view the change history [changelog](./CHANGELOG.md)
* To view or report bug's go to [issues](https://github.com/robertbruno/pgnotify-emitter/issues)
