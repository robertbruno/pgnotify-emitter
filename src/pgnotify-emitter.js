#!/usr/bin/env node

/*
 * Small application that connects to one or more databases and listens for
 * notifications, passing them on to a emitter instance allowing code inside
 * the database to do realtime messaging out to the rest of the system.
 */

// prefix for erros code
const ERROR_PREFIX = 20;
const pkg = require('./package.json')
const config = require('./config')()

// Logger Handler
const logger =  require('./LoggerHandler')

logger.log('info', `${pkg.name} ${pkg.version}`);

config.notify({
	// Publish the message to a emitter 
	notify: function (c, n, v) {

		console.log("pgnotify-emitter.js", c, n, v)
		// const o = {
			// Connection details
			// host: c.emitter[v.instance],
			// Message parsed into json?
			// json: n.json,
			// Function to handle publishing
			// publish: function (m) {
			// 	const me = this;
				
			// 	return new Promise( (resolve, reject) => {
			// 		if (me.channel) {
					
			// 			logger.log('info',`emitter.publish: ${m}`);
	
			// 			// Plain send to route
			// 			if (me.key){
			// 				me.channel.publish(
			// 					me.topic,
			// 					me.key,
			// 					Buffer.from(me.json ? JSON.stringify(m) : m),
			// 					{},
			// 					(err, ok)  => {
			// 						if(err){
			// 							reject(err)
			// 						}else{
			// 							resolve(ok)
			// 						}
			// 					}
			// 				);
			// 			}
	
			// 			if (me.routingKey && me.json) {
			// 				me.channel.publish(
			// 					me.topic,
			// 					m[me.routingKey],
			// 					Buffer.from(JSON.stringify(me.payload ? m[me.payload] : m)),
			// 					{},
			// 					(err, ok)  => {
			// 						if(err){
			// 							reject(err)
			// 						}else{
			// 							resolve(ok)
			// 						}
			// 					}
			// 				);
			// 			}
			// 		}else{
			// 			logger.log('warn','dont has channel')
			// 		}
			// 	})
			// }
		// };

		// No uri or if not json then no key then don't do anything
		// if (!o.uri || (!o.key && !o.json))
		// 	return null;

		// amqp.connect(o.uri, {
		// 	clientProperties: {
		// 		// Show what this connection is for in management
		// 		connection_name: 'Notify ' + n.database + ' ' + n.name
		// 	}
		// }).then(function (conn) {
		// 	/// setting connection object && signals
		// 	o.conn = conn;
		// 	console.log(`[amqp.connected] (${o.uri})`);
		// 	process.once('SIGINT', () => {
		// 		conn.close.bind(conn)
		// 		console.log(`[amqp.close] (${o.uri})`);
		// 	});
		// 	return conn
		// })
		// .then((connection) => {
		// 	// Creating channels
		// 	return connection.createConfirmChannel()
		// })
		// .then((channel) => {
		// 	console.log(`[createConfirmChannel] (${o.topic})`);

		// 	// use prefetch only with createChannel method
		// 	// channel.prefetch(1);
			
		// 	// setting global channel ref
		// 	o.channel = channel;

		// 	// channel error callback
		// 	o.channel.on('error', (error) => {
		// 		/*console.log("[channel.error]", error)
		// 		process.exit(ERROR_PREFIX+1)
		// 		*/
		// 		config.safelyClose(ERROR_PREFIX+1, `Channel error (${o.topic})`)
		// 	});

		// 	// channel close  callback
		// 	o.channel.on('close', () => {
		// 		/*console.log("[channel closed]")
		// 		process.exit(ERROR_PREFIX+2)
		// 		*/
		// 		config.safelyClose(ERROR_PREFIX+2, `Channel closed (${o.topic})`)
		// 	});

		// }).catch(function (ex) {
		// 	// logger.log('error',`[amqp.error] ${e.message}`);
		// 	// process.exit(ERROR_PREFIX+3)
		// 	config.safelyClose(ERROR_PREFIX+3, ex.message )
		// });

		return function (m) {
			return o.publish(m);
		};
	}
});