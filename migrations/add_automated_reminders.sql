-- Migration: Add automated/scheduled reminders support
-- Run this in your Supabase SQL Editor

-- Add columns for automated reminders
ALTER TABLE public.reminders 
ADD COLUMN IF NOT EXISTS is_automated boolean DEFAULT false NOT NULL,
ADD COLUMN IF NOT EXISTS frequency text, -- 'daily', 'weekly', 'custom'
ADD COLUMN IF NOT EXISTS schedule_time time, -- Time of day to send (e.g., '09:00:00')
ADD COLUMN IF NOT EXISTS schedule_days integer[], -- Days of week (0=Sunday, 6=Saturday) for weekly
ADD COLUMN IF NOT EXISTS interval_hours integer, -- For custom intervals (e.g., every 2 hours)
ADD COLUMN IF NOT EXISTS next_scheduled_at timestamp with time zone, -- When to create next reminder
ADD COLUMN IF NOT EXISTS parent_reminder_id uuid REFERENCES public.reminders(id) ON DELETE CASCADE, -- For recurring reminders
ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true NOT NULL; -- To enable/disable automated reminders

-- Index for scheduled reminders
CREATE INDEX IF NOT EXISTS idx_reminders_scheduled ON public.reminders(next_scheduled_at) WHERE is_automated = true AND is_active = true AND is_dismissed = false;
CREATE INDEX IF NOT EXISTS idx_reminders_automated ON public.reminders(client_id, is_automated, is_active) WHERE is_automated = true;

-- Function to get all reminders for nutritionist (including dismissed)
CREATE OR REPLACE FUNCTION get_client_reminders(p_client_id uuid) 
RETURNS SETOF reminders AS $$ 
SELECT * FROM public.reminders 
WHERE client_id = p_client_id
ORDER BY created_at DESC; 
$$ LANGUAGE sql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_client_reminders(uuid) TO authenticated;

-- Function to generate recurring reminders (should be called periodically)
CREATE OR REPLACE FUNCTION generate_recurring_reminders() 
RETURNS integer AS $$ 
DECLARE 
  reminder_record RECORD;
  new_reminder_id uuid;
  next_scheduled timestamp with time zone;
  created_count integer := 0;
  current_day integer;
  next_day integer;
  days_to_add integer;
BEGIN 
  -- Find all active automated reminders that are due
  FOR reminder_record IN 
    SELECT * FROM public.reminders 
    WHERE is_automated = true 
      AND is_active = true 
      AND is_dismissed = false
      AND next_scheduled_at <= timezone('utc'::text, now())
      AND parent_reminder_id IS NULL -- Only process parent reminders
  LOOP
    -- Create a new reminder instance
    INSERT INTO public.reminders (
      client_id, 
      title, 
      message, 
      is_automated, 
      frequency, 
      schedule_time, 
      schedule_days, 
      interval_hours, 
      parent_reminder_id,
      is_active,
      next_scheduled_at
    ) VALUES (
      reminder_record.client_id,
      reminder_record.title,
      reminder_record.message,
      false, -- The instance is not automated, only the parent is
      reminder_record.frequency,
      reminder_record.schedule_time,
      reminder_record.schedule_days,
      reminder_record.interval_hours,
      reminder_record.id,
      true,
      NULL
    ) RETURNING id INTO new_reminder_id;
    
    -- Calculate next scheduled time
    next_scheduled := reminder_record.next_scheduled_at;
    
    IF reminder_record.frequency = 'daily' THEN
      next_scheduled := next_scheduled + interval '1 day';
    ELSIF reminder_record.frequency = 'custom' AND reminder_record.interval_hours IS NOT NULL THEN
      next_scheduled := next_scheduled + (reminder_record.interval_hours || ' hours')::interval;
    ELSIF reminder_record.frequency = 'weekly' AND reminder_record.schedule_days IS NOT NULL THEN
      -- Find next scheduled day
      current_day := EXTRACT(DOW FROM next_scheduled)::integer;
      -- Find next day in schedule_days
      SELECT MIN(day) INTO next_day
      FROM unnest(reminder_record.schedule_days) AS day
      WHERE day > current_day;
      
      IF next_day IS NULL THEN
        -- Get first day of next week
        SELECT MIN(day) INTO next_day FROM unnest(reminder_record.schedule_days) AS day;
        days_to_add := 7 - current_day + next_day;
      ELSE
        days_to_add := next_day - current_day;
      END IF;
      
      next_scheduled := next_scheduled + (days_to_add || ' days')::interval;
    END IF;
    
    -- Update parent reminder's next_scheduled_at
    UPDATE public.reminders 
    SET next_scheduled_at = next_scheduled
    WHERE id = reminder_record.id;
    
    created_count := created_count + 1;
  END LOOP;
  
  RETURN created_count;
END; 
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users (nutritionists can trigger this)
GRANT EXECUTE ON FUNCTION generate_recurring_reminders() TO authenticated;
