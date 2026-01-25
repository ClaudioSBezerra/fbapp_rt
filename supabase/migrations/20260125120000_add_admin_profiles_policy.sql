-- Add RLS policies for admins to manage profiles
-- This fixes the issue where admins cannot see other users in the management panel

-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to update all profiles
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- Allow admins to delete all profiles
CREATE POLICY "Admins can delete all profiles" ON public.profiles
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
