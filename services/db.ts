import { supabase } from '../src/lib/supabase';
import { ProjectMeta, ProjectData, SavedVersion, Room, Faculty, ScheduleEntry, HistoryState, SchedulingConstraints, Course, StudentBatch, Department, DeletionImpact } from '../types';
import { DEFAULT_CONSTRAINTS } from '../constants';

const DB_PREFIX = 'uss_';
const K_CONSTRAINTS = `${DB_PREFIX}constraints`;
const kVer = (id: string) => `${DB_PREFIX}v_${id}`;
const kHist = (id: string) => `${DB_PREFIX}hist_${id}`;

// --- Global Constraints (Kept in Local Storage for app-wide defaults) ---

export const getGlobalConstraints = (): SchedulingConstraints => {
    const s = localStorage.getItem(K_CONSTRAINTS);
    return s ? JSON.parse(s) : DEFAULT_CONSTRAINTS;
};

export const saveGlobalConstraints = (constraints: SchedulingConstraints) => {
    localStorage.setItem(K_CONSTRAINTS, JSON.stringify(constraints));
};

// --- User Profiles (Global User Management) ---

export const getAllProfiles = async (): Promise<any[]> => {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('role', { ascending: true });

    if (error) {
        console.error("Error fetching profiles:", error);
        return [];
    }
    return data || [];
};

export const updateProfileRole = async (userId: string, newRole: string, departmentId?: string): Promise<boolean> => {
    const payload: any = { role: newRole };
    if (departmentId !== undefined) {
        payload.department_id = departmentId || null;
    }

    const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', userId);

    if (error) {
        console.error("Error updating profile role:", error);
        return false;
    }
    return true;
};

export const getAllDepartments = async (): Promise<Department[]> => {
    const { data, error } = await supabase.from('departments').select('*');
    if (error) {
        console.error("Error fetching departments:", error);
        return [];
    }
    return (data || []).map(d => ({
        id: d.id,
        name: d.name,
        assignedFloors: d.assigned_floors,
        assignedShift: d.assigned_shift
    }));
};

// --- Projects (Migrated to Supabase) ---

export const getProjects = async (departmentId?: string): Promise<ProjectMeta[]> => {
    let query = supabase.from('projects').select('*').order('created_at', { ascending: false });

    if (departmentId) {
        query = query.eq('department_id', departmentId);
    }

    const { data, error } = await query;

    if (error) {
        console.error("Error fetching projects:", error);
        return [];
    }

    return data.map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        createdAt: new Date(p.created_at).getTime(),
        updatedAt: new Date(p.updated_at).getTime(),
        departmentId: p.department_id
    }));
};

export const getProjectMeta = async (id: string): Promise<ProjectMeta | null> => {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error("Error fetching project meta:", error);
        return null;
    }

    return {
        id: data.id,
        name: data.name,
        description: data.description,
        createdAt: new Date(data.created_at).getTime(),
        updatedAt: new Date(data.updated_at).getTime(),
        departmentId: data.department_id
    };
};

export const createProject = async (name: string, description?: string, departmentId?: string | null): Promise<string> => {
    const { data, error } = await supabase
        .from('projects')
        .insert([{ name, description, department_id: departmentId || null }])
        .select('id')
        .single();

    if (error) throw error;
    return data.id;
};

export const deleteProject = async (id: string): Promise<void> => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;

    // Cleanup local history
    localStorage.removeItem(kVer(id));
    localStorage.removeItem(kHist(id));
};

// --- Project Data (Cloud Fetch & Save) ---

export const getProjectData = async (projectId: string): Promise<ProjectData | null> => {
    try {
        const [roomsRes, facultyRes, coursesRes, batchesRes, scheduleRes] = await Promise.all([
            // FETCH SCOPED
            supabase.from('rooms').select('*').eq('project_id', projectId),
            supabase.from('faculty').select('*').eq('project_id', projectId),
            supabase.from('courses').select('*').eq('project_id', projectId),
            supabase.from('student_batches').select('*').eq('project_id', projectId),
            supabase.from('schedule_entries').select('*').eq('project_id', projectId)
        ]);

        if (scheduleRes.error) throw scheduleRes.error;

        // Map Supabase snake_case back to frontend camelCase
        const rooms: Room[] = (roomsRes.data || []).map(r => ({
            id: r.id, name: r.name, floor: r.floor, capacity: r.capacity, type: r.type, category: r.category, isComputerCenter: r.is_computer_center
        }));

        const faculty: Faculty[] = (facultyRes.data || []).map(f => ({
            id: f.id, name: f.name, departmentId: f.department_id, isVisitingFaculty: f.is_visiting_faculty, availability: f.availability
        }));

        const courses: Course[] = (coursesRes.data || []).map(c => ({
            id: c.id, name: c.name, code: c.code, departmentId: c.department_id, isElective: c.is_elective, combinedWith: c.combined_with
        }));

        const batches: StudentBatch[] = (batchesRes.data || []).map(b => ({
            id: b.id, name: b.name, departmentId: b.department_id, division: b.division, shift: b.shift, program: b.program, semester: b.semester, includesBatchIds: b.includes_batch_ids
        }));

        const entries = (scheduleRes.data || []).map(s => ({
            id: s.id,
            courseId: s.course_id,
            facultyId: s.faculty_id,
            batchId: s.batch_id,
            roomId: s.room_id,
            type: s.type,
            durationInSlots: s.duration_in_slots,
            day: s.day,
            timeSlotId: s.time_slot_id,
            isLocked: s.is_locked,
            subBatch: s.sub_batch,
            isOE: s.is_oe
        })) as ScheduleEntry[];

        // Separate placed schedule from unassigned
        const schedule = entries.filter(e => e.day && e.timeSlotId);
        const unassigned = entries.filter(e => !e.day || !e.timeSlotId);

        return {
            schedule,
            unassigned,
            faculty,
            batches,
            courses,
            rooms,
            departments: [] // Departments can be fetched globally if needed
        };

    } catch (e) {
        console.error("Failed to fetch project data from Supabase:", e);
        return null;
    }
};

export const saveProjectData = async (projectId: string, data: ProjectData): Promise<void> => {
    // 1. Upsert parent entities to prevent FK violations when saving custom generic ones safely
    if (data.rooms.length > 0) {
        const roomsToUpsert = data.rooms.map(r => ({ id: r.id, project_id: projectId, name: r.name, floor: r.floor, capacity: r.capacity, type: r.type, category: r.category, is_computer_center: r.isComputerCenter }));
        await supabase.from('rooms').upsert(roomsToUpsert, { onConflict: 'id' });
    }

    if (data.faculty.length > 0) {
        const facsToUpsert = data.faculty.map(f => ({ id: f.id, project_id: projectId, name: f.name, department_id: f.departmentId, is_visiting_faculty: f.isVisitingFaculty, availability: f.availability }));
        await supabase.from('faculty').upsert(facsToUpsert, { onConflict: 'id' });
    }

    if (data.courses.length > 0) {
        const coursesToUpsert = data.courses.map(c => ({ id: c.id, project_id: projectId, name: c.name, code: c.code, department_id: c.departmentId, is_elective: c.isElective, combined_with: c.combinedWith }));
        await supabase.from('courses').upsert(coursesToUpsert, { onConflict: 'id' });
    }

    if (data.batches.length > 0) {
        const batsToUpsert = data.batches.map(b => ({ id: b.id, project_id: projectId, name: b.name, department_id: b.departmentId, division: b.division, shift: b.shift, program: b.program, semester: parseInt(b.semester as string) || 1, includes_batch_ids: b.includesBatchIds || [] }));
        await supabase.from('student_batches').upsert(batsToUpsert, { onConflict: 'id' });
    }

    // 2. Delete all existing schedule entries for this project to perform a clean sync
    const { error: delError } = await supabase.from('schedule_entries').delete().eq('project_id', projectId);
    if (delError) throw delError;

    // 3. Map frontend data back to snake_case for Supabase
    const allEntries = [...data.schedule, ...data.unassigned].map(e => ({
        id: e.id,
        project_id: projectId,
        course_id: e.courseId,
        faculty_id: e.facultyId,
        batch_id: e.batchId,
        room_id: e.roomId,
        type: e.type,
        duration_in_slots: e.durationInSlots,
        day: e.day,
        time_slot_id: e.timeSlotId,
        is_locked: e.isLocked,
        sub_batch: e.subBatch,
        is_oe: e.isOE
    }));

    if (allEntries.length > 0) {
        const { error: insError } = await supabase.from('schedule_entries').insert(allEntries);
        if (insError) throw insError;
    }

    // Update project timestamp
    await supabase.from('projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
};

// --- Excel Bulk Importer ---

export const bulkSaveToSupabase = async (projectId: string, importData: any): Promise<void> => {
    // ─── Step 0: Wipe old project-scoped data to ensure a clean slate ───
    await supabase.from('schedule_entries').delete().eq('project_id', projectId);
    await supabase.from('faculty').delete().eq('project_id', projectId);
    await supabase.from('courses').delete().eq('project_id', projectId);
    await supabase.from('student_batches').delete().eq('project_id', projectId);
    // Rooms are NOT deleted on Excel import because they are configured via UI, not via the upload.

    // ─── Step 1: Departments (global, keyed by text ID) ───
    const validDeptIds = new Set<string>();
    if (importData.departments?.length > 0) {
        const depts = importData.departments.map((d: any) => ({
            id: d.id, name: d.name, assigned_floors: d.assignedFloors ?? [], assigned_shift: d.assignedShift ?? 'Morning'
        }));
        const { error } = await supabase.from('departments').upsert(depts, { onConflict: 'id' });
        if (error) {
            console.error('Dept upsert error:', error);
        } else {
            depts.forEach((d: any) => validDeptIds.add(d.id));
        }
    }
    const safeDeptId = (id: string | null | undefined) => (id && validDeptIds.has(id)) ? id : null;

    // ─── Step 2: Faculty ───
    if (importData.faculty?.length > 0) {
        const facs = importData.faculty.map((f: any) => ({
            id: f.id, project_id: projectId, name: f.name, department_id: safeDeptId(f.departmentId), is_visiting_faculty: !!f.isVisitingFaculty, availability: f.availability ?? {}
        }));
        const { error } = await supabase.from('faculty').insert(facs);
        if (error) console.error('Faculty insert error:', error);
    }

    // ─── Step 3: Courses ───
    if (importData.courses?.length > 0) {
        const cors = importData.courses.map((c: any) => ({
            id: c.id, project_id: projectId, name: c.name, code: c.code || c.name.substring(0, 6).toUpperCase(), department_id: safeDeptId(c.departmentId), is_elective: !!c.isElective, combined_with: c.combinedWith ?? []
        }));
        const { error } = await supabase.from('courses').insert(cors);
        if (error) console.error('Courses insert error:', error);
    }

    // ─── Step 4: Batches ───
    if (importData.batches?.length > 0) {
        const bats = importData.batches.map((b: any) => ({
            id: b.id, project_id: projectId, name: b.name, department_id: safeDeptId(b.departmentId), division: b.division || 'A', shift: b.shift || 'Morning', program: b.program || 'General', semester: parseInt(b.semester) || 1, includes_batch_ids: b.includesBatchIds || []
        }));
        const { error } = await supabase.from('student_batches').insert(bats);
        if (error) console.error('Batches insert error:', error);
    }

    // ─── Step 5: Schedule Entries (unassigned sidebar items) ───
    if (importData.unassigned?.length > 0) {
        const entries = importData.unassigned
            .map((e: any) => {
                if (!e.courseId || !e.facultyId || !e.batchId) {
                    console.warn('Skipping entry with unresolved IDs', e);
                    return null;
                }
                return {
                    id: e.id,
                    project_id: projectId,
                    course_id: e.courseId,
                    faculty_id: e.facultyId,
                    batch_id: e.batchId,
                    room_id: null,
                    type: e.type,
                    duration_in_slots: e.durationInSlots ?? 1,
                    day: null,
                    time_slot_id: null,
                    is_locked: false,
                    sub_batch: e.subBatch ?? null,
                    is_oe: !!e.isOE
                };
            })
            .filter(Boolean); // Remove nulls

        if (entries.length > 0) {
            const { error } = await supabase.from('schedule_entries').insert(entries);
            if (error) console.error('Schedule entries insert error:', error);
            else console.log(`✅ Inserted ${entries.length} schedule entries.`);
        }
    }
};

// --- Global Collision Utility ---
import { DayOfWeek } from '../types';

export interface GlobalCollisionEntry {
    projectId: string; // To differentiate from our own project's entries
    roomId: string | null;
    facultyId: string | null;
    day: DayOfWeek | null;
    timeSlotId: number | null;
    durationInSlots: number;
}

export const getAllProjectSchedules = async (): Promise<GlobalCollisionEntry[]> => {
    const { data, error } = await supabase
        .from('schedule_entries')
        .select('project_id, room_id, faculty_id, day, time_slot_id, duration_in_slots')
        // Only fetch placed items since unassigned items don't cause collisions yet
        .not('day', 'is', null)
        .not('time_slot_id', 'is', null);

    if (error) {
        console.error("Error fetching global schedules for collision detection:", error);
        return [];
    }
    return (data || []).map(row => ({
        projectId: row.project_id,
        roomId: row.room_id,
        facultyId: row.faculty_id,
        day: row.day,
        timeSlotId: row.time_slot_id,
        durationInSlots: row.duration_in_slots || 1
    }));
};

// --- Local History (Kept in Local Storage for fast Undo/Redo) ---
export const getProjectHistory = (projectId: string): HistoryState => {
    try {
        const s = localStorage.getItem(kHist(projectId));
        return s ? JSON.parse(s) : { history: [], future: [] };
    } catch {
        return { history: [], future: [] };
    }
};

export const saveProjectHistory = (projectId: string, state: HistoryState) => {
    try {
        const limitedState = { history: state.history.slice(-20), future: state.future.slice(0, 20) };
        localStorage.setItem(kHist(projectId), JSON.stringify(limitedState));
    } catch (e) {
        console.warn("Failed to save history", e);
    }
};

// --- Version Control (Local) ---
export const getVersions = (projectId: string): SavedVersion[] => {
    const s = localStorage.getItem(kVer(projectId));
    return s ? JSON.parse(s) : [];
};

export const saveVersion = (projectId: string, name: string, data: ProjectData) => {
    const versions = getVersions(projectId);
    versions.unshift({ id: `ver_${Date.now()}`, projectId, name, timestamp: Date.now(), data: JSON.parse(JSON.stringify(data)) });
    localStorage.setItem(kVer(projectId), JSON.stringify(versions));
};

export const restoreVersion = (projectId: string, versionId: string): ProjectData | null => {
    const v = getVersions(projectId).find(v => v.id === versionId);
    return v ? v.data : null;
};

// --- Global Resources ---
export const getGlobalState = async (): Promise<{ globalRooms: Room[], globalFaculty: Faculty[] }> => {
    // Fetch all rooms and faculty across all projects
    const [roomsRes, facultyRes] = await Promise.all([
        supabase.from('rooms').select('*'),
        supabase.from('faculty').select('*')
    ]);

    // Deduplicate Rooms by generic Name (case-insensitive)
    const roomMap = new Map<string, Room>();
    (roomsRes.data || []).forEach(r => {
        const key = String(r.name).trim().toLowerCase();
        if (!roomMap.has(key)) {
            roomMap.set(key, {
                id: r.id,
                name: r.name,
                floor: r.floor,
                capacity: r.capacity,
                type: r.type,
                category: r.category,
                isComputerCenter: r.is_computer_center
            });
        }
    });

    // Deduplicate Faculty by generic Name (case-insensitive)
    const facMap = new Map<string, Faculty>();
    (facultyRes.data || []).forEach(f => {
        const key = String(f.name).trim().toLowerCase();
        if (!facMap.has(key)) {
            facMap.set(key, {
                id: f.id,
                name: f.name,
                departmentId: f.department_id,
                isVisitingFaculty: f.is_visiting_faculty,
                availability: f.availability
            });
        }
    });

    return {
        globalRooms: Array.from(roomMap.values()),
        globalFaculty: Array.from(facMap.values())
    };
};

export const addOrUpdateGlobalRoom = async (room: Room) => {
    // Insert with null project_id so it acts as a global template
    const { error } = await supabase.from('rooms').upsert({
        id: room.id,
        project_id: null,
        name: room.name,
        floor: room.floor,
        capacity: room.capacity,
        type: room.type,
        category: room.category,
        is_computer_center: room.isComputerCenter
    }, { onConflict: 'id' });
    if (error) {
        console.error("Failed to add global room. 'project_id' might be strictly NOT NULL in schema.", error);
    }
};

export const addOrUpdateGlobalFaculty = async (faculty: Faculty) => {
    const { error } = await supabase.from('faculty').upsert({
        id: faculty.id,
        project_id: null,
        name: faculty.name,
        department_id: faculty.departmentId,
        is_visiting_faculty: faculty.isVisitingFaculty,
        availability: faculty.availability
    }, { onConflict: 'id' });
    if (error) {
        console.error("Failed to add global faculty.", error);
    }
};

export const updateGlobalFacultyWithPropagation = async (faculty: Faculty) => {
    // Only update global reference
    await addOrUpdateGlobalFaculty(faculty);
};

export const deleteGlobalRoom = async (id: string) => {
    // Can only delete if project_id is null (true global rooms) to prevent wiping out a specific project's room by accident
    await supabase.from('rooms').delete().eq('id', id).is('project_id', null);
};

export const deleteGlobalFaculty = async (id: string) => {
    await supabase.from('faculty').delete().eq('id', id).is('project_id', null);
};

export const getDeletionImpact = (type: 'room' | 'faculty', id: string): DeletionImpact[] => [];
export const getAvailabilityUpdateImpact = (facultyId: string, newAvail: any): DeletionImpact[] => [];
