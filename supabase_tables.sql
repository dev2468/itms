-- ITMS Database Schema Migration
-- Run this in your Supabase SQL Editor

-- 1. Create Core Projects Table
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  constraints jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create Departments lookup table
CREATE TABLE public.departments (
  id text PRIMARY KEY,
  name text NOT NULL,
  assigned_floors integer[] DEFAULT '{}',
  assigned_shift text DEFAULT 'Morning',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Core Entities (Bound to Projects for standard multi-tenant scoping)
-- When a project is deleted, wipe all these entities via ON DELETE CASCADE

CREATE TABLE public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  floor integer DEFAULT 1,
  capacity integer DEFAULT 60,
  type text DEFAULT 'Lecture',
  category text DEFAULT 'Theory',
  is_computer_center boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.faculty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  department_id text REFERENCES public.departments(id),
  is_visiting_faculty boolean DEFAULT false,
  availability jsonb DEFAULT '{}'::jsonb, -- Mapping of Day -> int[]
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  -- Ensure we don't accidentally create 50 Prof. Smiths per project
  UNIQUE (project_id, name)
);

CREATE TABLE public.courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  department_id text REFERENCES public.departments(id),
  is_elective boolean DEFAULT false,
  combined_with text[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (project_id, name)
);

CREATE TABLE public.student_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  department_id text REFERENCES public.departments(id),
  division text NOT NULL,
  shift text DEFAULT 'Morning',
  program text NOT NULL,
  semester numeric DEFAULT 1,
  includes_batch_ids text[] DEFAULT '{}', -- Store related UUIDs as text for OE combinations
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (project_id, name)
);

-- 4. The main Timetable Entries table
-- Holds the actual grid placements and the unassigned items from the sidebar.
CREATE TABLE public.schedule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  
  -- Foreign Keys
  course_id uuid REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
  faculty_id uuid REFERENCES public.faculty(id) ON DELETE CASCADE NOT NULL,
  batch_id uuid REFERENCES public.student_batches(id) ON DELETE CASCADE NOT NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL, -- Room can be null if unassigned
  
  -- Sessional Data
  type text NOT NULL, -- THEORY, LAB, TUTORIAL
  duration_in_slots integer NOT NULL DEFAULT 1,
  
  -- Layout Data (determines if it's placed on the grid or in the sidebar)
  day text, -- 'MONDAY', 'TUESDAY', etc. Can be null if unassigned
  time_slot_id integer, -- Numeric Slot ID. Can be null if unassigned
  is_locked boolean DEFAULT false,
  
  -- Specific Identifiers for display
  sub_batch text,
  is_oe boolean DEFAULT false,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- 5. Row Level Security Setup
-- Let's enable RLS on everything to make this secure.

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_entries ENABLE ROW LEVEL SECURITY;

-- 6. Initial Security Policies (Development Focus)
-- Since we are currently focusing on transitioning the data mechanics,
-- we will write "Authenticated access" policies. Later we can tighten this
-- to specifically check the `public.profiles` 'role'.

-- All authenticated users can Read
CREATE POLICY "Allow authenticated read access" ON public.projects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read access" ON public.departments FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read access" ON public.rooms FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read access" ON public.faculty FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read access" ON public.courses FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read access" ON public.student_batches FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated read access" ON public.schedule_entries FOR SELECT USING (auth.role() = 'authenticated');

-- All authenticated users can Insert, Update, Delete for now
-- (Normally limited to Super Admin and Dept Admin)
CREATE POLICY "Allow authenticated mod access" ON public.projects FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated mod access" ON public.departments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated mod access" ON public.rooms FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated mod access" ON public.faculty FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated mod access" ON public.courses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated mod access" ON public.student_batches FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated mod access" ON public.schedule_entries FOR ALL USING (auth.role() = 'authenticated');
