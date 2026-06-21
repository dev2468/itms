-- =========================================================================
-- WARNING: THIS SCRIPT WILL PERMANENTLY DELETE ALL DATA FROM YOUR DATABASE!
-- =========================================================================

-- 1. Truncate all public tables and automatically cascade down to their dependencies
TRUNCATE TABLE 
    public.schedule_entries,
    public.rooms,
    public.student_batches,
    public.courses,
    public.faculty,
    public.departments,
    public.projects,
    public.profiles
RESTART IDENTITY CASCADE;


-- =========================================================================
-- OPTIONAL: Wipe Authentication Users
-- =========================================================================
-- Uncomment the line below if you ALSO want to delete everyone's login accounts 
-- from the Supabase Authentication system.
-- (This will force everyone to sign up again)

-- DELETE FROM auth.users;
