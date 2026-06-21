-- =========================================================================================
-- ROBUST ROLE-BASED ACCESS CONTROL (RLS) FOR ITMS
-- =========================================================================================

-- 1. Schema updates for Project Scoping
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS department_id text;

-- 2. Helper Functions (SECURITY DEFINER allows checking auth context efficiently)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.get_my_department_id()
RETURNS text LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT department_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_modify_row(target_project_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT 
    public.get_my_role() = 'super_admin' OR 
    (target_project_id IS NOT NULL AND public.get_my_role() = 'department_admin' AND 
     EXISTS (SELECT 1 FROM public.projects p WHERE p.id = target_project_id AND p.department_id = public.get_my_department_id()));
$$;

-- 3. Apply Policies to Projects Table
DROP POLICY IF EXISTS "Allow public read access" ON public.projects;
DROP POLICY IF EXISTS "Allow public mod access" ON public.projects;
DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_update" ON public.projects;
DROP POLICY IF EXISTS "projects_delete" ON public.projects;

CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (true);
CREATE POLICY "projects_insert" ON public.projects FOR INSERT WITH CHECK (
    public.get_my_role() = 'super_admin' OR
    (public.get_my_role() = 'department_admin' AND department_id = public.get_my_department_id())
);
CREATE POLICY "projects_update" ON public.projects FOR UPDATE USING (
    public.get_my_role() = 'super_admin' OR
    (public.get_my_role() = 'department_admin' AND department_id = public.get_my_department_id())
) WITH CHECK (
    public.get_my_role() = 'super_admin' OR
    (public.get_my_role() = 'department_admin' AND department_id = public.get_my_department_id())
);
CREATE POLICY "projects_delete" ON public.projects FOR DELETE USING (
    public.get_my_role() = 'super_admin' OR
    (public.get_my_role() = 'department_admin' AND department_id = public.get_my_department_id())
);

-- 4. Apply Standardized Policies to all Project-Scoped Entities
-- We loop through the tables manually to apply the standardized CRUD rules

DO $$
DECLARE
  table_name text;
  tables text[] := ARRAY['departments', 'rooms', 'faculty', 'courses', 'student_batches', 'schedule_entries'];
BEGIN
  FOREACH table_name IN ARRAY tables LOOP
    -- Drop old loose policies
    EXECUTE format('DROP POLICY IF EXISTS "Allow public read access" ON public.%I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "Allow public mod access" ON public.%I', table_name);
    
    -- Drop potentially existing strict policies to allow clean recreation
    EXECUTE format('DROP POLICY IF EXISTS "%I_select" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%I_insert" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%I_update" ON public.%I', table_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS "%I_delete" ON public.%I', table_name, table_name);

    -- 1. Read is public (For global collision resolution and Student/Faculty viewing)
    EXECUTE format('CREATE POLICY "%I_select" ON public.%I FOR SELECT USING (true)', table_name, table_name);
    
    -- 2. Modify uses our hardened function
    IF table_name = 'departments' THEN
      -- Departments don't have project_id, so only super_admins can touch them
      EXECUTE format('CREATE POLICY "%I_insert" ON public.%I FOR INSERT WITH CHECK (public.get_my_role() = ''super_admin'')', table_name, table_name);
      EXECUTE format('CREATE POLICY "%I_update" ON public.%I FOR UPDATE USING (public.get_my_role() = ''super_admin'') WITH CHECK (public.get_my_role() = ''super_admin'')', table_name, table_name);
      EXECUTE format('CREATE POLICY "%I_delete" ON public.%I FOR DELETE USING (public.get_my_role() = ''super_admin'')', table_name, table_name);
    ELSE
      -- All other tables rely on their project_id
      EXECUTE format('CREATE POLICY "%I_insert" ON public.%I FOR INSERT WITH CHECK (public.can_modify_row(project_id))', table_name, table_name);
      EXECUTE format('CREATE POLICY "%I_update" ON public.%I FOR UPDATE USING (public.can_modify_row(project_id)) WITH CHECK (public.can_modify_row(project_id))', table_name, table_name);
      EXECUTE format('CREATE POLICY "%I_delete" ON public.%I FOR DELETE USING (public.can_modify_row(project_id))', table_name, table_name);
    END IF;
  END LOOP;
END $$;

-- 5. Profiles Table Guard
-- Read is public, Updates are locked to self OR super_admins
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Allow profile updates" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (
    id = auth.uid() OR public.get_my_role() = 'super_admin'
) WITH CHECK (
    id = auth.uid() OR public.get_my_role() = 'super_admin'
);
