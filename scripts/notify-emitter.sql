CREATE SCHEMA IF NOT EXISTS "pgnotify_emitter";

COMMENT ON SCHEMA "pgnotify_emitter" IS 'scheme for control of messages sent to emitter';

CREATE OR REPLACE FUNCTION pgnotify_emitter.cron_partitioning(
	)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
    SQLTEXT TEXT;
    PGVERSION DOUBLE PRECISION;
BEGIN
    SELECT setting INTO  PGVERSION FROM pg_settings WHERE name = 'server_version_num';

    -- Partitioning Supported Versions
    IF (PGVERSION >= 100000) THEN
        SQLTEXT := CONCAT (
            'CREATE TABLE IF NOT EXISTS "pgnotify_emitter"."messages_',
            REPLACE((timezone('UTC', NOW())::DATE )::TEXT, '-', '_'),
            '" PARTITION OF "pgnotify_emitter"."messages" ',
            'FOR VALUES FROM (''',
            (timezone('UTC', NOW())::DATE )::TEXT,
            ' 00:00:00''::TIMESTAMP WITHOUT TIME ZONE) TO (''',
            ((timezone('UTC', NOW())::DATE ) + 1)::TEXT,
            ' 00:00:00''::TIMESTAMP WITHOUT TIME ZONE);',

            'CREATE TABLE IF NOT EXISTS "pgnotify_emitter"."keygen_',
            REPLACE((timezone('UTC', NOW())::DATE )::TEXT, '-', '_'),
            '" PARTITION OF "pgnotify_emitter"."keygen" ',
            'FOR VALUES FROM (''',
            (timezone('UTC', NOW())::DATE )::TEXT,
            ' 00:00:00''::TIMESTAMP WITHOUT TIME ZONE) TO (''',
            ((timezone('UTC', NOW())::DATE ) + 1)::TEXT,
            ' 00:00:00''::TIMESTAMP WITHOUT TIME ZONE);'
        );

        SQLTEXT := CONCAT (
            SQLTEXT,
            ' DROP TABLE IF EXISTS "pgnotify_emitter"."messages_',
            REPLACE(((timezone('UTC', NOW())::DATE ) - 5)::TEXT, '-', '_'),
            '";',

            ' DROP TABLE IF EXISTS "pgnotify_emitter"."keygen_',
            REPLACE(((timezone('UTC', NOW())::DATE ) - 5)::TEXT, '-', '_'),
            '";'
        );

        RAISE NOTICE '%', SQLTEXT;
        EXECUTE(SQLTEXT);
    END IF;
END;
$BODY$;
COMMENT ON FUNCTION pgnotify_emitter.cron_partitioning() IS 'Create partitonning, run this function At 00:00. (0 0 * * *)';

DO $$
DECLARE
    PGVERSION DOUBLE PRECISION;
	SQLTEXT TEXT;
BEGIN
    SELECT setting INTO  PGVERSION FROM pg_settings WHERE name = 'server_version_num';

    -- Partitioning Supported Versions
    IF (PGVERSION >= 100000) THEN
        CREATE TABLE IF NOT EXISTS "pgnotify_emitter"."messages" (
            id SERIAL NOT NULL ,
            ts TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
            ts_ack TIMESTAMP WITHOUT TIME ZONE,
            ts_exp TIMESTAMP WITHOUT TIME ZONE,
            ttl interval DEFAULT '00:30:00',
            ack BOOLEAN NOT NULL DEFAULT FALSE,
            topic VARCHAR(255) NOT NULL,
            payload TEXT NOT NULL,
            CONSTRAINT notify_emitter_messages_pkey  PRIMARY KEY (id,ts)
        ) PARTITION BY RANGE (ts);

        CREATE TABLE IF NOT EXISTS "pgnotify_emitter"."keygen" (
            id SERIAL NOT NULL,
            ts TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'UTC'),
            response JSONB NOT NULL,
            CONSTRAINT notify_emitter_keygen_pkey  PRIMARY KEY (id,ts)
        ) PARTITION BY RANGE (ts);
    END IF;

    -- Current date partitioning
    PERFORM pgnotify_emitter.cron_partitioning();
END$$;

CREATE INDEX ON "pgnotify_emitter"."messages" (ts);

COMMENT ON TABLE "pgnotify_emitter"."messages" IS 'Contains the messages to be sent to emitter';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."id" IS 'messages ID number';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."ts" IS 'messages utc timestamp creation';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."ts_ack" IS 'messages utc timestamp acknowledgement';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."ts_exp" IS 'messages utc timestamp expiration';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."ttl" IS 'messages time to live';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."ack" IS 'messages acknowledgement confirmation (default false, true is confirmed)';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."topic" IS 'pg_notify channel';
COMMENT ON COLUMN "pgnotify_emitter"."messages"."payload" IS 'pg_notify payload';

CREATE OR REPLACE FUNCTION "pgnotify_emitter"."notify"() RETURNS TRIGGER AS $$
DECLARE
BEGIN
    PERFORM pg_notify(NEW.topic, CONCAT('ID:',NEW.id, '|',NEW.payload));
    RETURN NEW;
END;
$$ STABLE LANGUAGE PLPGSQL;

DROP TRIGGER IF EXISTS "tg_notify_emitter_messages" ON "pgnotify_emitter"."messages";
CREATE TRIGGER "tg_notify_emitter_messages" BEFORE INSERT ON "pgnotify_emitter"."messages"
    FOR EACH ROW EXECUTE PROCEDURE "pgnotify_emitter"."notify"();

CREATE OR REPLACE FUNCTION "pgnotify_emitter"."notify"(channel text, payload text) RETURNS void AS $$
BEGIN    
	BEGIN	
    	INSERT INTO pgnotify_emitter.messages (topic, payload) VALUES (channel, payload);
	EXCEPTION WHEN check_violation THEN
	    PERFORM pgnotify_emitter.cron_partitioning();
		INSERT INTO pgnotify_emitter.messages (topic, payload) VALUES (channel, payload);
  	END;    
END;
$$ VOLATILE LANGUAGE PLPGSQL;
COMMENT ON FUNCTION "pgnotify_emitter"."notify"( TEXT, TEXT) IS 'Send notify';

CREATE OR REPLACE FUNCTION pgnotify_emitter.publish(
	emitter text,
	payload jsonb)
    RETURNS void
    LANGUAGE 'plpgsql'
    COST 100
    VOLATILE PARALLEL UNSAFE
AS $BODY$
DECLARE
  _key TEXT := payload->>'key';
  _fixed_channel TEXT := payload->>'channel';
BEGIN

	-- If the user does not provide a key, the keygen table is consulted
    IF (_key IS NULL) THEN 
        SELECT response->>'key' INTO _key FROM pgnotify_emitter.keygen
            WHERE response->>'channel' ilike payload->>'channel' || '%'
            ORDER BY ts DESC LIMIT 1;
		
		--  If there is no key in the db, one is requested for the next time
		IF (_key IS NULL) THEN
			
			IF ( substr(payload->>'channel', -1) != '/' ) THEN
				_fixed_channel := CONCAT(payload->>'channel', '/#/');
			END IF;
			
			PERFORM pgnotify_emitter.keygen(
			  emitter,
			  json_build_object('channel', _fixed_channel)::JSONB
			);
		END IF;
		
        payload =  payload || json_build_object('key', _key)::JSONB;
    END IF;

    PERFORM pgnotify_emitter.notify((emitter || '-publish')::TEXT, payload::TEXT);
END;
$BODY$;
COMMENT ON FUNCTION "pgnotify_emitter"."publish"( TEXT, JSONB) IS 'Publish message to emitter instance channel';


CREATE OR REPLACE FUNCTION "pgnotify_emitter"."subscribe"(emitter text, payload JSONB) RETURNS void AS $$
BEGIN
    PERFORM pgnotify_emitter.notify((emitter || '-subscribe')::TEXT, payload::TEXT);
END;
$$ VOLATILE LANGUAGE PLPGSQL;
COMMENT ON FUNCTION "pgnotify_emitter"."subscribe"( TEXT, JSONB) IS 'subscribe to emitter instance channel';

CREATE OR REPLACE FUNCTION "pgnotify_emitter"."keygen"(emitter text, payload JSONB) RETURNS void AS $$
BEGIN
    PERFORM pgnotify_emitter.notify((emitter || '-keygen')::TEXT, payload::TEXT);
END;
$$ VOLATILE LANGUAGE PLPGSQL;
COMMENT ON FUNCTION "pgnotify_emitter"."keygen"( TEXT, JSONB) IS 'keygen to emitter instance channel';


CREATE OR REPLACE FUNCTION "pgnotify_emitter"."ack"(msg_id INT) RETURNS void AS $$
BEGIN
    UPDATE pgnotify_emitter.messages SET ack=TRUE, ts_ack=(NOW() AT TIME ZONE 'UTC') WHERE id=msg_id;
END;
$$ VOLATILE LANGUAGE PLPGSQL;
COMMENT ON FUNCTION "pgnotify_emitter"."ack"(INT) IS 'Setting ack for a message';

CREATE OR REPLACE FUNCTION "pgnotify_emitter"."cron_expire_messages"() RETURNS void AS $$
BEGIN
    UPDATE pgnotify_emitter.messages SET ts_exp=(NOW() AT TIME ZONE 'UTC')
    WHERE
        ts + ttl <= (NOW() AT TIME ZONE 'UTC')  AND ack = false;
END;
$$ VOLATILE LANGUAGE PLPGSQL;
COMMENT ON FUNCTION "pgnotify_emitter"."cron_expire_messages"() IS 'Expire messages, run this function At minute 0 past every 12th hour. (0 */12 * * *)';

CREATE OR REPLACE FUNCTION "pgnotify_emitter"."handle_ack"() RETURNS void AS $$
BEGIN
    PERFORM pg_notify(topic, CONCAT('ID:',id, '|',payload)) FROM "pgnotify_emitter"."messages"
    WHERE ack = false AND ts_exp IS NULL
    ORDER BY ts ASC LIMIT 100;
END;
$$ VOLATILE LANGUAGE PLPGSQL;
COMMENT ON FUNCTION "pgnotify_emitter"."handle_ack"() IS 'handle messages widthout ack';

-- Create cron task to expire messages
DO $$
DECLARE
    JOB_EXISTS INTEGER;
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;

    SELECT COUNT(*) INTO JOB_EXISTS FROM cron.job WHERE jobname = 'pgnotify_emitter_cron_expire_messages';
    IF (JOB_EXISTS > 0) THEN
        PERFORM cron.unschedule('pgnotify_emitter_cron_expire_messages');
    END IF;

    SELECT COUNT(*) INTO JOB_EXISTS FROM cron.job WHERE jobname = 'pgnotify_emitter_cron_partitioning';
    IF (JOB_EXISTS > 0) THEN
        PERFORM cron.unschedule('pgnotify_emitter_cron_partitioning');
    END IF;

    SELECT COUNT(*) INTO JOB_EXISTS FROM cron.job WHERE jobname = 'pgnotify_emitter_cron_handle_ack';
    IF (JOB_EXISTS > 0) THEN
        PERFORM cron.unschedule('pgnotify_emitter_cron_handle_ack');
    END IF;    

    PERFORM cron.schedule('pgnotify_emitter_cron_expire_messages', '0 */12 * * *', 'SELECT pgnotify_emitter.cron_expire_messages();');
    PERFORM cron.schedule('pgnotify_emitter_cron_partitioning', '0 0 * * *', 'SELECT pgnotify_emitter.cron_partitioning();');
    PERFORM cron.schedule('pgnotify_emitter_cron_handle_ack', '* * * * *', 'SELECT pgnotify_emitter.handle_ack();');
    
    EXCEPTION
    WHEN INVALID_SCHEMA_NAME THEN
        RAISE NOTICE 'could not create cron task';
        WHEN UNDEFINED_FILE THEN
        RAISE NOTICE 'could not create cron task';
END$$;


