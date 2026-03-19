-- Delete any LLM API configs with OPENAI provider (no longer supported)
DELETE FROM "llm_api_configs" WHERE "provider" = 'OPENAI';

-- Also clean up related usage events
DELETE FROM "llm_usage_events" WHERE "llm_api_config_id" NOT IN (SELECT "id" FROM "llm_api_configs");