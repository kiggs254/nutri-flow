-- Migration: Add email triggers for auth events
-- Run this in your Supabase SQL Editor
-- 
-- This migration creates database triggers that call the email webhook endpoint
-- when authentication events occur (user signup, password reset, etc.)
--
-- Prerequisites:
-- 1. Ensure the http extension is enabled: CREATE EXTENSION IF NOT EXISTS http;
-- 2. Set your backend URL in the webhook_url function or via environment variable
-- 3. Configure WEBHOOK_SECRET in your backend .env file

-- Enable http extension for making webhook calls
-- Note: For self-hosted Supabase, you may need to use pg_net extension instead
-- CREATE EXTENSION IF NOT EXISTS http;
-- For Supabase, use pg_net:
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to call email webhook endpoint
CREATE OR REPLACE FUNCTION call_email_webhook(
  p_event text,
  p_user_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  webhook_url text;
  webhook_secret text;
  response_status int;
  response_body text;
BEGIN
  -- Get webhook URL from environment or use default
  -- You can set this via: ALTER DATABASE postgres SET app.webhook_url = 'https://your-backend.com/api/auth/webhook';
  webhook_url := current_setting('app.webhook_url', true);
  
  -- Default to localhost if not set (for development)
  IF webhook_url IS NULL OR webhook_url = '' THEN
    webhook_url := 'http://localhost:3000/api/auth/webhook';
  END IF;

  -- Get webhook secret from environment
  webhook_secret := current_setting('app.webhook_secret', true);

  -- Make HTTP POST request to webhook endpoint
  -- Using pg_net for Supabase (recommended)
  PERFORM
    net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'X-Webhook-Secret', COALESCE(webhook_secret, '')
      ),
      body := jsonb_build_object(
        'event', p_event,
        'data', p_user_data
      )
    );

  -- Log the webhook call (optional)
  RAISE NOTICE 'Email webhook called for event: %', p_event;
  
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the transaction
    RAISE WARNING 'Failed to call email webhook: %', SQLERRM;
END;
$$;

-- Alternative function using http extension (if pg_net is not available)
-- Uncomment and use this if pg_net doesn't work in your setup
/*
CREATE OR REPLACE FUNCTION call_email_webhook_http(
  p_event text,
  p_user_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  webhook_url text;
  webhook_secret text;
  response http_response;
BEGIN
  webhook_url := current_setting('app.webhook_url', true);
  IF webhook_url IS NULL OR webhook_url = '' THEN
    webhook_url := 'http://localhost:3000/api/auth/webhook';
  END IF;

  webhook_secret := current_setting('app.webhook_secret', true);

  SELECT * INTO response
  FROM http((
    'POST',
    webhook_url,
    ARRAY[
      http_header('Content-Type', 'application/json'),
      http_header('X-Webhook-Secret', COALESCE(webhook_secret, ''))
    ],
    'application/json',
    jsonb_build_object(
      'event', p_event,
      'data', p_user_data
    )::text
  )::http_request);

  IF response.status != 200 THEN
    RAISE WARNING 'Webhook returned status %: %', response.status, response.content;
  END IF;
END;
$$;
*/

-- Trigger function for new user creation
CREATE OR REPLACE FUNCTION trigger_user_created_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Call webhook for user creation event
  PERFORM call_email_webhook(
    'user.created',
    jsonb_build_object(
      'id', NEW.id,
      'email', NEW.email,
      'email_confirmed_at', NEW.email_confirmed_at,
      'created_at', NEW.created_at,
      'raw_user_meta_data', NEW.raw_user_meta_data,
      'user_metadata', NEW.raw_user_meta_data
    )
  );
  
  RETURN NEW;
END;
$$;

-- Trigger function for email verification
CREATE OR REPLACE FUNCTION trigger_user_email_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only trigger if email was just confirmed (was NULL, now has value)
  IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
    PERFORM call_email_webhook(
      'user.email_verified',
      jsonb_build_object(
        'id', NEW.id,
        'email', NEW.email,
        'email_confirmed_at', NEW.email_confirmed_at,
        'raw_user_meta_data', NEW.raw_user_meta_data,
        'user_metadata', NEW.raw_user_meta_data
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for password reset requests
-- Note: This requires monitoring the auth.flow_state table or using Supabase's built-in hooks
-- For now, we'll create a trigger that monitors when recovery tokens are created
CREATE OR REPLACE FUNCTION trigger_password_reset_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_email text;
BEGIN
  -- Check if this is a recovery flow
  IF NEW.flow_type = 'recovery' THEN
    -- Get user email from the flow state
    -- The user_id is stored in flow_state, we need to look it up
    SELECT email INTO user_email
    FROM auth.users
    WHERE id = (NEW.user_id);
    
    IF user_email IS NOT NULL THEN
      PERFORM call_email_webhook(
        'user.password_reset_requested',
        jsonb_build_object(
          'email', user_email,
          'user_id', NEW.user_id,
          'flow_type', NEW.flow_type,
          'created_at', NEW.created_at
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger function for password changes
-- This monitors the auth.users table for password hash changes
CREATE OR REPLACE FUNCTION trigger_password_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check if password was changed (encrypted_password changed)
  IF OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password THEN
    PERFORM call_email_webhook(
      'user.password_changed',
      jsonb_build_object(
        'id', NEW.id,
        'email', NEW.email,
        'updated_at', NEW.updated_at,
        'raw_user_meta_data', NEW.raw_user_meta_data,
        'user_metadata', NEW.raw_user_meta_data
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers on auth.users table
-- Note: These triggers run in the auth schema, which requires appropriate permissions

-- Trigger for new user creation
DROP TRIGGER IF EXISTS user_created_email_trigger ON auth.users;
CREATE TRIGGER user_created_email_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_created_email();

-- Trigger for email verification
DROP TRIGGER IF EXISTS user_email_verified_trigger ON auth.users;
CREATE TRIGGER user_email_verified_trigger
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_user_email_verified();

-- Trigger for password changes
DROP TRIGGER IF EXISTS user_password_changed_trigger ON auth.users;
CREATE TRIGGER user_password_changed_trigger
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION trigger_password_changed();

-- Optional: Trigger for password reset requests via flow_state
-- This requires access to auth.flow_state table
-- Uncomment if you have access to this table in your Supabase setup
/*
DROP TRIGGER IF EXISTS password_reset_requested_trigger ON auth.flow_state;
CREATE TRIGGER password_reset_requested_trigger
  AFTER INSERT ON auth.flow_state
  FOR EACH ROW
  EXECUTE FUNCTION trigger_password_reset_requested();
*/

-- Grant necessary permissions
-- Note: These permissions may need to be adjusted based on your Supabase setup
GRANT EXECUTE ON FUNCTION call_email_webhook(text, jsonb) TO postgres, anon, authenticated, service_role;

-- Instructions for configuration:
-- 
-- 1. Set the webhook URL (replace with your actual backend URL):
--    ALTER DATABASE postgres SET app.webhook_url = 'https://your-backend.com/api/auth/webhook';
--
-- 2. Set the webhook secret (should match WEBHOOK_SECRET in your backend .env):
--    ALTER DATABASE postgres SET app.webhook_secret = 'your-secret-key-here';
--
-- 3. For self-hosted Supabase, you may need to:
--    - Enable pg_net extension: CREATE EXTENSION IF NOT EXISTS pg_net;
--    - Or use http extension: CREATE EXTENSION IF NOT EXISTS http;
--    - Adjust the function to use the appropriate HTTP method
--
-- 4. Test the triggers by creating a test user and verifying webhook calls
