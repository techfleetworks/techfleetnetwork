
-- Add timezone column to profiles table
ALTER TABLE public.profiles ADD COLUMN timezone text NOT NULL DEFAULT '';
