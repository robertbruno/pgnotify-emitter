/*
 * config.js  Handles our yaml style configuration
 */

const emitter = require('emitter-io');

// Prefix for errors code
const ERROR_PREFIX = 10;

// Logger Handler
const logger =  require('./LoggerHandler')

// Http Server Handler
const httpserver = require('./HttpServerHandler')

// Metrics Handler
const MetricsHandler = require('./MetricsHandler')
const metrics =  new MetricsHandler({server: httpserver.server})

// Healthcheck Handler
const HealthcheckHandler = require('./HealthcheckHandler')
const healthcheck =  new HealthcheckHandler({server: httpserver.server})

const NOTIFY_TEST_CHANNEL_PREFIX  =  process.env.NOTIFY_TEST_CHANNEL_PREFIX  || 'pgnotify-emitter-test'
const NOTIFY_TEST_TIMEOUT  =  process.env.NOTIFY_TEST_TIMEOUT  ||  1000 * 10
const NOTIFY_TEST_INTERVAL =  process.env.NOTIFY_TEST_INTERVAL ||  1000 * 5

var fs = require('fs'),
    promise = require('bluebird'),
    yaml = require('js-yaml'),
    pgp = require('pg-promise')(options),
    options = {
        promiseLib: promise,
        // global event notification for pg_promise;
        error: function (error, e) {
            // A connection-related error;
            // Connections are reported back with the password hashed,
            // for safe errors logging, without exposing passwords.
            if(error){
                logger.log('error',["EVENT:", error.message || error]);
            }
            if (e && e.cn) {
                logger.log('error',["CN:", e.cn]);
            }
        }
    };

let config = {},
    emitters = {},
    databases = {},
    checkConnList = [],
    checkConnResultsList = [],
    emitterConnectionTimout = {};

function $main() {

    // Load the config file
    try {
        config = yaml.safeLoad(fs.readFileSync('config.yaml','utf8'));
    } catch (e) {
        logger.log('warn', `config.yaml error: ${e.message}`);
    }

    // We need the databases loaded
    if (config.databases) {
        databases = Object.keys(config.databases)
            .reduce(function (list, index) {
                const dbcnf = config.databases[index];
                if (dbcnf.enabled) {
                    logger.log('info', `database(${index}) connecting...`);
                    list[index] = pgp(Object.assign({
                        port: 5432,
                        ssl:  typeof c.ssl === "boolean" ? c.ssl : {
                            // @see https://stackoverflow.com/questions/76899023/rds-while-connection-error-no-pg-hba-conf-entry-for-host
                            rejectUnauthorized: false
                        },
                        query_timeout: 1000 * 5
                    }, dbcnf));
                }
                return list;
            }, {});
    }


    // We need the emitter loaded
    if (config.emitters) {
        emitters = Object.keys(config.emitters)
            .reduce(function (list, index) {
                const emitterConf = config.emitters[index];
                if (emitterConf.enabled) {
                    try {
                        delete emitterConf.enabled;
                        const emitterOpts = Object.assign({
                            host: "emitter",
                            port: 8080,
                            secure: false,
                            keepalive: 30
                        }, emitterConf);

                        const conn = () =>{
                            logger.log('info', `emitter(${index}) connecting...`);
                            list[index] = emitter.connect(emitterOpts, (econn)=>{
                                if(econn!=null){
                                    list[index] = econn;
                                    // once we're connected, subscribe to the 'test' channel
                                    logger.log('info', `emitter(${index}) connected`)
                                    clearTimeout(emitterConnectionTimout[index])
                                }else{
                                    logger.log('error', `emitter(${index}) error!`)
                                }
                            });
                            emitterConnectionTimout[index] = setTimeout(() => {
                                logger.log('error', `emitter(${index}) connection timeout`);
                                logger.log('debug', `emitter(${index}) connection options: ${JSON.stringify(emitterOpts)}`);
                                setTimeout(() => {
                                    conn();
                                }, 1000 * 2.5);
                            }, 1000 * 5);
                        }

                        conn();
                    } catch (exit) {
                        logger.log('error', exit.message)
                    }
                }
                return list;
            }, {});
    }

    // listenres para cerrar las conexiones a base de datos
    process.once('SIGINT', (signalnro) => {
        logger.log('info',`${signalnro} received`);
        safelyClose()
    });

    return {
        // Link to the pg-promise databases
        db: databases,
        // link to emitter clients
        emitters,
        // Link to the configuraton
        config,
        // Link to enable notify code
        notify,
        // function to safe close
        safelyClose
    };
}

/**
 * Gestiona la sección notify del yml
 * @param {array} handlers
 */
function notify(handlers) {

    if (config.notify) {
        config.notify
            .filter(function (n) {
                return n.enabled === true;
            })
            .reduce(function (a, n) {
                const db = databases[n.database];
                const emitterClient = emitters[n.emitterServerName];

                if(!db){
                    safelyClose(
                        ERROR_PREFIX+3,
                        `Not database (${n.database}) found in config.yaml`
                    )
                }

                db.connect({
                    direct: true,
                    allowExitOnIdle: true
                }).then(function (sco) {
                    const testChannelName = `${NOTIFY_TEST_CHANNEL_PREFIX}@${n.database}`
                    let msgProccessed = false;


                    logger.log('info', `database(${n.database})[connected]`)

                    sco.none('LISTEN $1~', `${n.name}-publish`);
                    sco.none('LISTEN $1~', `${n.name}-subscribe`);
                    sco.none('LISTEN $1~', `${n.name}-keygen`);

                    // listen for check conn tests
                    sco.none('LISTEN $1~', testChannelName);

                    const checkConnHandler = () => {

                        if(checkConnList[testChannelName]){
                            clearInterval(checkConnList[testChannelName])
                        }
                        // detect connection problems
                        checkConnList[testChannelName] = setInterval(() => {
                            logger.log('debug',`(${testChannelName}) notify`)
                            sco.client.query(`SELECT pg_notify('${testChannelName}', '' || now())`)
                            .catch((error) => {
                                // safelyClose(ERROR_PREFIX+10, `[${testChannelName}] ${error.message}`)

                                // settings tests metrics
                                metrics.notifyTestErrorCounter.inc()
                            })

                            if(checkConnResultsList[testChannelName]){
                                clearTimeout(checkConnResultsList[testChannelName])
                            }

                            checkConnResultsList[testChannelName] = setTimeout(() => {
                                // si el notify no se recibe se arrojará un error
                                // asumiendo que se trata de algun problema de conexión
                                // safelyClose(ERROR_PREFIX+4, `[${testChannelName}]`)

                                // settings tests metrics
                                metrics.notifyTestErrorCounter.inc()

                            }, NOTIFY_TEST_TIMEOUT);
                        }, NOTIFY_TEST_INTERVAL);
                    }

                    checkConnHandler()

                    sco.client.on('notification', function (data) {
                        let payload = data.payload;
                        let msgID = null;
                        const notifyChannel = data.channel;

                        if(notifyChannel.indexOf(NOTIFY_TEST_CHANNEL_PREFIX) >= 0){
                            if(checkConnResultsList[notifyChannel]){
                                clearTimeout(checkConnResultsList[notifyChannel])
                                logger.log('debug',`(${notifyChannel}) OK`)

                                // settings tests metrics
                                metrics.notifyTestErrorCounter.set(0)
                            }else{
                                logger.log('debug',`(${notifyChannel}) Dirty`)
                            }
                            return
                        }

                        // Optional debug, log the message as we receive it
                        if (n.debug)
                            logger.log('info','Notify:\t' + Object.keys(data)
                            .reduce(function (a, b) {
                                a.push([b, data[b]].join(b.length < 8 ? '\t\t' : '\t'));
                                return a;
                            }, [])
                            .join('\n\t'));

                        // Getting and cleaning message id
                        if(payload.indexOf('ID:') === 0){
                            const parts = payload.split('|')
                            msgID =  parts.slice(0, 1)[0].replace('ID:', '')
                            payload = parts.slice(1).join()
                        }

                        payload = JSON.parse(payload);

                        if(`${notifyChannel}` == `${n.name}-keygen`){
                            logger.log('debug', 'calling emitter keygen')
                            emitterClient.keygen(Object.assign(n.emitterKeygen,payload))
                            msgProccessed = true;
                        }else if(payload.key){
                            if(`${notifyChannel}` == `${n.name}-publish`){
                                logger.log('debug', 'calling emitter publish')
                                emitterClient.publish(payload);
                                msgProccessed = true;
                            }else if(`${notifyChannel}` == `${n.name}-subscribe`){
                                logger.log('debug', 'calling emitter subscribe')
                                emitterClient.subscribe(payload)
                                msgProccessed = true;
                            }else{
                                logger.log('warn', `unknown channel: ${notifyChannel}`)
                                return;
                            }
                        }else{
                            logger.log('warn', `channel ${notifyChannel} require the key field in payload, the message will be discarded.`)
                            return;
                        }

                        // settings message metrics
                        metrics.messageCounter.inc({notifyChannel})

                        // send ack
                        if(msgID && msgProccessed){
                            sco.query("SELECT pgnotify_emitter.ack($1)", msgID).then(()=>{
                                logger.log('info',`[${notifyChannel}][ack] ID:${logger.FGGREEN}${msgID}${logger.BGRESET}`)
                                // Si la petición se ejecta correctamente
                                // limpiamos el intervalo de checking de conexión
                                checkConnHandler()
                            })
                            .catch((ex)=>{
                                safelyClose(ERROR_PREFIX+5, ex.message)
                            });
                        }
                    });


                    if(emitterClient){
                        // logger.log('debug', `emitter(${n.emitterServerName}) on connect event subcribe`)
                        // emitterClient.on('connect', async () => {
                        //     // once we're connected, subscribe to the 'test' channel
                        //     logger.log('info', `[emitter: ${n.emitterServerName}][connected]`)
                        //     clearTimeout(emitterConnectionTimout[n.emitterServerName])
                        // })

                        logger.log('debug', `emitter(${n.emitterServerName}) on error subcribe`)
                        emitterClient.on('error', async (error) => {
                            logger.log('error', `[emitter error] ${JSON.stringify(error)}`)
                        })

                        logger.log('debug', `emitter(${n.emitterServerName}) on keygen event subcribe`)
                        emitterClient.on('keygen', async (response) => {
                            const stringify = JSON.stringify(response)
                            logger.log('debug', `[emitter keygen] ${stringify}`)
                            sco.query("INSERT INTO pgnotify_emitter.keygen (response) VALUES ($1::JSONB)", stringify).then(()=>{
                                logger.log('debug',`[emitter keygen] save into db`)
                            })
                            .catch((ex)=>{
                                logger.log('error', ex.message)
                            });
                        })
                        logger.log('debug', `emitter(${n.emitterServerName}) on message event subcribe`)
                        emitterClient.on('message', async (message) => {
                            logger.log('debug', `emitter(${n.emitterServerName}) on message:  ${message.asString()}`)
                        })
                    }else{
                        safelyClose(
                            ERROR_PREFIX+10,
                            `Not emitter (${n.emitterServerName}) found in config.yaml`
                        )
                    }

                    // procesa los mensajes pendientes sin ack
                    if(process.env.HANDLE_ACK){
                        setTimeout(() => {
                            logger.log('debug', `emitter(${n.emitterServerName}) running handle_ack`)
                            sco.client.query('SELECT pgnotify_emitter.handle_ack();').then(()=>{
                                logger.log('debug',`emitter(${n.emitterServerName}) handle_ack ok`)
                            })
                            .catch((ex)=>{
                                logger.log('error', ex.message)
                            })
                        }, 1000);
                    }
                    
                });

                return a;
            }, {});
    }
}

// Cierra la aplicación de forma seguro
const safelyClose = async (errorNumber = 0, errorMessage) => {
    // gestiona los mensages de error
    const errorKey = logger.errorKey(errorNumber)
    metrics.errorCounter.inc({key: errorKey})
    logger.log('error', `[${errorKey}] ${errorMessage}`)

    // gestiona la desconexión de base de datos
    if(databases){
        Object.keys(databases).forEach( (dbname) => {
            try {
                process.stdout.write(`[database.disconnecting] ${dbname}...`);
                databases[dbname].$pool.end()
                process.stdout.write(`${logger.FGGREEN}OK${logger.BGRESET}`)
            } catch (ex) {
                logger.log('warn', ex.message)
            }
        })
    }

    setTimeout(() => {
        metrics.clean()
        process.exit(errorNumber)
    }, 1000 * 2);
}

module.exports = $main;