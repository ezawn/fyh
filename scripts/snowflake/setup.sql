-- =====================================================================
-- AI Retro Remix: Snowflake setup (docs/SPEC.md 8.4)
-- Paste this into a Snowsight SQL worksheet (Projects > Worksheets > +)
-- while signed in as the trial's admin user, and run it top to bottom
-- (Ctrl+Shift+Enter runs everything). Safe to re-run.
-- =====================================================================

USE ROLE ACCOUNTADMIN;

-- 1. Compute: a tiny warehouse that suspends after 60 s idle, to save trial credits
CREATE WAREHOUSE IF NOT EXISTS RETRO_WH
  WAREHOUSE_SIZE = 'XSMALL' AUTO_SUSPEND = 60 AUTO_RESUME = TRUE INITIALLY_SUSPENDED = TRUE;

-- 2. Storage
CREATE DATABASE IF NOT EXISTS RETRO;
CREATE SCHEMA IF NOT EXISTS RETRO.PUBLIC;

CREATE TABLE IF NOT EXISTS RETRO.PUBLIC.CARTRIDGES (
  ID STRING PRIMARY KEY,
  SCHEMA_VERSION INT,
  STATUS STRING,
  DATA VARIANT,
  CREATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS RETRO.PUBLIC.REMIX_LINES (
  CHARACTER_ID STRING,
  WORLD_ID STRING,
  DATA VARIANT,
  CREATED_AT TIMESTAMP_TZ DEFAULT CURRENT_TIMESTAMP(),
  PRIMARY KEY (CHARACTER_ID, WORLD_ID)
);

-- 3. A role for the app server, with only what it needs
CREATE ROLE IF NOT EXISTS RETRO_APP;
GRANT USAGE ON WAREHOUSE RETRO_WH TO ROLE RETRO_APP;
GRANT USAGE ON DATABASE RETRO TO ROLE RETRO_APP;
GRANT USAGE ON SCHEMA RETRO.PUBLIC TO ROLE RETRO_APP;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA RETRO.PUBLIC TO ROLE RETRO_APP;
GRANT SELECT, INSERT, UPDATE, DELETE ON FUTURE TABLES IN SCHEMA RETRO.PUBLIC TO ROLE RETRO_APP;
GRANT DATABASE ROLE SNOWFLAKE.CORTEX_USER TO ROLE RETRO_APP;   -- allows AI_COMPLETE
GRANT ROLE RETRO_APP TO USER IDENTIFIER(CURRENT_USER());        -- so you (and the server, logged in as you) can use it

-- 4. Cortex: if your region doesn't host the model you want, this lets
--    Snowflake route the call to a region that does. Comment out if your
--    org doesn't allow cross-region processing.
ALTER ACCOUNT SET CORTEX_ENABLED_CROSS_REGION = 'ANY_REGION';

-- =====================================================================
-- 5. Smoke tests: run these one at a time and check the results.
-- =====================================================================
USE ROLE RETRO_APP;
USE WAREHOUSE RETRO_WH;
USE SCHEMA RETRO.PUBLIC;

-- 5a. Which Claude model works? Try these in order and keep the first that
--     answers. Put that exact name in .env as CORTEX_MODEL.
--     (Model names change; if none work, check the Snowflake docs page
--      "Snowflake Cortex AISQL: available models" for the current list.)
SELECT AI_COMPLETE('claude-sonnet-4-5', 'Reply with the single word: ready');
-- SELECT AI_COMPLETE('claude-4-sonnet', 'Reply with the single word: ready');
-- SELECT AI_COMPLETE('claude-3-7-sonnet', 'Reply with the single word: ready');

-- 5b. Structured output (the server relies on this). Should return {"ok": true, "name": "..."}
SELECT AI_COMPLETE(
  model => 'claude-sonnet-4-5',
  prompt => 'Return ok=true and the name of Goku''s signature attack.',
  response_format => {
    'type': 'json',
    'schema': {
      'type': 'object',
      'properties': { 'ok': {'type': 'boolean'}, 'name': {'type': 'string'} },
      'required': ['ok', 'name']
    }
  }
);

-- 5c. After running scripts/snowflake/seed.sql, this should list the 3 demo cartridges
SELECT ID, STATUS, DATA:character:name::STRING AS CHARACTER, DATA:world:name::STRING AS WORLD
FROM CARTRIDGES ORDER BY CREATED_AT;

-- =====================================================================
-- .env for the server (never commit this file):
--   SNOWFLAKE_ACCOUNT=<org>-<account>   (Snowsight: bottom-left account menu > Account > copy "account identifier")
--   SNOWFLAKE_USER=<your login name>
--   SNOWFLAKE_PASSWORD=<your password>
--   SNOWFLAKE_ROLE=RETRO_APP
--   SNOWFLAKE_WAREHOUSE=RETRO_WH
--   SNOWFLAKE_DATABASE=RETRO
--   SNOWFLAKE_SCHEMA=PUBLIC
--   CORTEX_MODEL=<the model name that worked in 5a>
-- If your account forces MFA on password logins, ask the server lane to
-- switch to key-pair auth or a programmatic access token instead.
-- =====================================================================
