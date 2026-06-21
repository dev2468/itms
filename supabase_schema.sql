    -- Create a table for public profiles
    create table public.profiles (
    id uuid references auth.users on delete cascade not null primary key,
    role text not null check (role in ('super_admin', 'department_admin', 'faculty', 'student')),
    department_id text, -- Can be null for super_admins or general users
    name text,
    updated_at timestamp with time zone,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
    );

    -- Set up Row Level Security (RLS)
    alter table public.profiles enable row level security;

    -- Create policies

    -- Policy 1: Public profiles are viewable by everyone in the system.
    create policy "Public profiles are viewable by everyone." on public.profiles
    for select using (auth.role() = 'authenticated');

    -- Policy 2: Users can insert their own profile.
    create policy "Users can insert their own profile." on public.profiles
    for insert with check (auth.uid() = id);

    -- Policy 3: Users can update their own profile.
    -- (Note: In a true enterprise setup, role changes would be locked to super_admin only,
    -- but for setup/development we'll let users update themselves, 
    -- or you can configure a separate secure endpoint).
    create policy "Users can update own profile." on public.profiles
    for update using (auth.uid() = id);

    -- Create a trigger to automatically create a profile when a new user signs up
    create function public.handle_new_user()
    returns trigger as $$
    begin
    insert into public.profiles (id, role, name)
    values (new.id, 'student', new.raw_user_meta_data->>'full_name');
    return new;
    end;
    $$ language plpgsql security definer;

    create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();
