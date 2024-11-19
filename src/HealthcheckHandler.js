const healthcheck = require('@hmcts/nodejs-healthcheck');
const emitter = require('emitter-io');
var promise = require('bluebird'),
    pgp = require('pg-promise')(pgOptions),
    pgOptions = {
        promiseLib: promise,
    },
    fs = require('fs'),
    yaml = require('js-yaml'),
    databases = {},
    db,
    dbopts,
    emitters = {},
    emitterConnectionTimout = {};


/**
 * Gestiona el heakthcheck de la aplicación
 */
class HealthcheckHandler {

    /**
     * {server: express instance}
     * @param {object} options 
     */
    constructor(options) {
        var config = {};
        // Load the config file
        try {
            config = yaml.safeLoad(fs.readFileSync('config.yaml', 'utf8'));
        } catch (e) {
            console.log('error', e);
        }
    
        // We need the databases loaded
        if (config.databases) {
            databases = Object.keys(config.databases)
                .reduce(function (a, b) {
                    var c = config.databases[b];
                    if (c.enabled) {
                        dbopts = {
                            host: c.host,
                            port: c.port ? c.port : 5432,
                            database: c.database,
                            user: c.user,
                            password: c.password,
                            ssl: typeof c.ssl === "boolean" ? c.ssl :  {
                                // @see https://stackoverflow.com/questions/76899023/rds-while-connection-error-no-pg-hba-conf-entry-for-host
                                rejectUnauthorized: false
                            },
                            query_timeout: 1000 * 5
                        };
                    }
                    // return db;
                }, {});
        }

        this.options = options;   
        const configHealth = {
            checks: {
              databaseConnection: healthcheck.raw(() => {
                
                //
                return this.checkDatabaseConnection(dbopts) ? healthcheck.up() : healthcheck.down() 
              }),
              emitterConnection: healthcheck.raw(() => {
                return this.checkEmitterConnection(config.emitters) ? healthcheck.up() : healthcheck.down() 
            })
            },
            /* readinessChecks: {
                rabbitNotifyChannel: healthcheck.raw(() => {
                    return this.checkNotifyChannel(config.rabbit) ? healthcheck.up() : healthcheck.down()
                })
            }, */
            buildInfo: {
              myCustomBuildInfo: "healthcheck"
            }
        };
        healthcheck.addTo(this.options.server, configHealth);
    }

    // Lógica personalizada, por ejemplo, verificar la conexión a una base de datos
    checkDatabaseConnection = async (db) => {
        try {
            // Creating a new database instance from the connection details:
            db = pgp(dbopts);

            var sco = await db.connect({
                direct: true,
                allowExitOnIdle: true
            });
            
            if (sco.client.connectionParameters.database) {                
                console.log(`[HEALTHCHECK: db connected] ${JSON.stringify(sco.client.connectionParameters.database)}` )
                sco.client.connection._events.end()
                return true
            } else {
                console.log(`[HEALTHCHECK: db not connected] ${JSON.stringify(sco)}`)
                return false
            }

        } catch (error) {
            console.log("🚀 ~ HealthcheckHandler ~ checkDatabaseConnection= ~ error:", error) 
            return true
        }
    };

    // verificar conexion con rabbitmq
    emitterConnection = async (emitterOpts, key) => {
        try {
            let res = await emitter.connect(emitterOpts, (econn)=>{
                // console.log("🚀 ~ HealthcheckHandler ~ emitterConnection= ~ econn:", econn)

                if(econn!=null){
                    // once we're connected, subscribe to the 'test' channel
                    console.log('info', `emitter(${key}) connected`)
                    clearTimeout(emitterConnectionTimout[key])

                }else{
                    console.log('error', `emitter(${key}) error!`)

                }
            });

            emitterConnectionTimout[key] = setTimeout(() => {
                console.log('error', `emitter(${key}) connection timeout`);
                console.log('debug', `emitter(${key}) connection options: ${JSON.stringify(emitterOpts)}`);

            }, 1000 * 5);

            return true;


        } catch (error) {
            console.log("🚀 ~ HealthcheckHandler ~ emitterConnection= ~ error:", error)
            return false;
        }
    }

    // verificar conexion con emitter
    checkEmitterConnection = async (configEmitters) => {
        let flag=false

        try {
            for (const key in configEmitters) {
                if (Object.hasOwnProperty.call(configEmitters, key)) {
                    const emitterConf = configEmitters[key];
                    if (emitterConf.enabled) {
                        
                        delete emitterConf.enabled;
                        const emitterOpts = Object.assign({
                            host: "emitter",
                            port: 8080,
                            secure: false,
                            keepalive: 30
                        }, emitterConf);
    
                        const myPromise = new Promise((resolve, reject) => {
                            console.log('info', `emitter(${key}) connecting...`);
                            emitter.connect(emitterOpts, (econn)=>{
                                // console.log("🚀 ~ HealthcheckHandler ~ emitterConnection= ~ econn:", econn)
                                if(econn!=null){
                                    // once we're connected, subscribe to the 'test' channel
                                    console.log('info', `emitter(${key}) connected`)
                                    // clearTimeout(emitterConnectionTimout[key])
                                    resolve(true);
                
                                }else{
                                    console.log('error', `emitter(${key}) error!`)
                                    resolve(false);
                                }
                            })
                        });
                          
                        flag = await myPromise;
                        console.log("🚀 ~ HealthcheckHandler ~ checkEmitterConnection= ~ flag:", flag)
            
                        /* emitterConnectionTimout[key] = setTimeout(() => {
                            console.log('error', `emitter(${key}) connection timeout`);
                            console.log('debug', `emitter(${key}) connection options: ${JSON.stringify(emitterOpts)}`);
                        }, 1000 * 7); */
                    }
                }
            }

            return flag // ? healthcheck.up() : healthcheck.down()
            
        } catch (error) {
            console.log("🚀 ~ HealthcheckHandler ~ checkDatabaseConnection= ~ error:", error) 
            return false
        }
        
    }

    // verificar el canal de prueba usado en el notify
    checkNotifyChannel = async (configRabbit) => {
        for (const key in configRabbit) {
            if (Object.hasOwnProperty.call(configRabbit, key)) {
                const url = configRabbit[key];

                let conn = await amqp.connect(url, {
                    clientProperties: {
                        // Show what this connection is for in management
                        connection_name: 'Notify '
                    }
                })

                let channel = await conn.createConfirmChannel()
                // console.log("🚀 ~ HealthcheckHandler ~ checkNotifyChannel= ~ channel:", channel)

                try {
                    channel.assertQueue('task_queue', {
                        durable: true
                    });
                    return true

                } catch (error) {
                    console.log("🚀 ~ HealthcheckHandler ~ checkNotifyChannel= ~ error:", error)
                    return false                    
                }
            }
        }
    }
    
}

module.exports = HealthcheckHandler