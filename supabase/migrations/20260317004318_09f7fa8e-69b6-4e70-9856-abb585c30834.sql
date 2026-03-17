-- Create membership tier enum
CREATE TYPE public.membership_tier AS ENUM ('free', 'paid');

-- Add membership_tier column to profiles with default 'free'
ALTER TABLE public.profiles
ADD COLUMN membership_tier public.membership_tier NOT NULL DEFAULT 'free';