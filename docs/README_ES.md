# notify-emitter

🇺🇸 [Go to english version](README.md)

## Introducción

Esta es una aplicación simple de nodejs que permite que PostgreSQL envíe mensajes a un servidor emitter usando un [NOTIFY](https://www.postgresql.org/docs/current/sql-notify.html).

Por ejemplo, en SQL puede emitir uno de los siguientes comandos:

```sql
SELECT pgnotify_emitter.keygen('emitter-channel-demo1','{
    "channel": "test/"
}');

SELECT pgnotify_emitter.publish('emitter-channel-demo1','{
    "channel": "test/1",
    "message": "xxxxxxx"    
}');
```

Esta aplicación enviará inmediatamente un mensaje a un channel de emitter. Luego puede hacer que una aplicación escuche el channel indicado.

Se esperan algunas estructuras y elementos en la base de datos que debe crear ejecutando el siguiente script:

* [scripts/notify-emitter.sql](scripts/notify-emitter.sql)

Cada vez que se inicie la aplicación ejecutará la función `"pgnotify_emitter"."handle_ack"()` con la intención de procesar mensajes sin acuse de recibo.

> Para mayor información visite:
> * [Database Functions](DBFUNCTION.md)

## Build Docker Compose

```bash
docker-compose -f docker-compose-dev.yml  up --build
```
> Debe esperar al menos 5 segundos para que se inicie emitter.

## Configuración

Debe proporcionar un archivo [config.yaml](src/config.yaml) que contenga detalles sobre su base de datos; se proporciona una plantilla en el repositorio.

Consta de tres secciones:

### databases

Esta sección contiene detalles de conexión para conectarse a sus bases de datos:

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

> Necesita ejecutar los scripts[scripts/notify-emitter.sql](scripts/notify-emitter.sql) en cada base de datos.
> Aquí solo tenemos una base de datos configurada llamada postgres a la que nos referiremos más adelante.

Opcionalmente puede establecer la variable de entorno  `HANDLE_ACK` para ejeuctar la senetencia `SELECT pgnotify_emitter.handle_ack();` al iniciar el app.

### emitter

Esta sección define los detalles de las instancias de emitter a las que desea conectarse.
Simplemente consiste en un nombre para la instancia y el URI de conexión para conectarse a ella.

```yml
# emitter servers configuration
emitters:
    local:
        enabled: true
        host: localhost
        port: 8080
        secure: false
```

## Running docker

Para ejecutar, primero cree un archivo config.yaml con su configuración y luego ejecute:

```bash
docker run -d -v $(pwd)/config.yaml:/opt/config.yaml robertbruno/pgnotify-emitter:latest
```

## Monitoring with Prometheus and Grafana

[Prometheus](https://prometheus.io/) Registra métricas en tiempo real en una base de datos de series temporales creada con un modelo de extracción HTTP, con consultas flexibles y alertas en tiempo real.

[Grafana](https://grafana.com/) que permite la visualización y formateo de datos métricos. Le permite crear paneles y gráficos a partir de múltiples fuentes, incluidas bases de datos de series temporales

Puedes visualizar esta métrica en [Grafana](https://grafana.com/) con el siguiente dashboard:

* [scripts/grafana-dashboard.json](scripts/grafana-dashboard.json)

> Para mayor nformación visite:
>
> * [Metrics docs](docs/METRICS_ES.md)

## Help

* Para ver el historial de cambios ir a [changelog](./src/CHANGELOG.md)
* Para ver o reportar errores ir a [issues](https://github.com/robertbruno/pgnotify-emitter/issues)