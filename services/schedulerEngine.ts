import { ScheduleEntry, Faculty, ValidationResult, DayOfWeek, SessionType, StudentBatch, Room, Course, Department, SchedulingConstraints } from '../types';
import { TIME_SLOTS, DAYS, DEFAULT_CONSTRAINTS } from '../constants';
import { GlobalCollisionEntry } from './db';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const mapDayToKey = (day: DayOfWeek) => day.substring(0, 3).toLowerCase();

/**
 * Checks if two batches are related (same, parent, or child).
 * Returns true if scheduling for b1 conflicts with b2.
 */
const areBatchesConflicting = (b1Id: string, b2Id: string, batchList: StudentBatch[]): boolean => {
    if (b1Id === b2Id) return true;

    const b1 = batchList.find(b => b.id === b1Id);
    const b2 = batchList.find(b => b.id === b2Id);

    if (!b1 || !b2) return false;

    // Check if B1 includes B2 (B1 is Parent of B2)
    // e.g., B1 = "OE-Batch-2 (B+C+D)", B2 = "Div B". 
    // If we schedule OE, Div B is busy.
    if (b1.includesBatchIds && b1.includesBatchIds.includes(b2Id)) return true;

    // Check if B2 includes B1 (B2 is Parent of B1)
    // e.g., B1 = "Div B", B2 = "OE-Batch-2 (B+C+D)". 
    // If we schedule Div B, OE Batch cannot run.
    if (b2.includesBatchIds && b2.includesBatchIds.includes(b1Id)) return true;

    // Check if they share any common atomic constituent
    // (Advanced case: Two different composite batches sharing a division)
    if (b1.includesBatchIds && b2.includesBatchIds) {
        const intersection = b1.includesBatchIds.filter(x => b2.includesBatchIds?.includes(x));
        if (intersection.length > 0) return true;
    }

    return false;
}

/**
 * Checks if a proposed move is valid based on all constraints.
 */
export const validateMove = (
    newEntry: ScheduleEntry,
    currentSchedule: ScheduleEntry[],
    facultyList: Faculty[],
    batchList: StudentBatch[],
    totalBatchWeeklyHours: number = 0, // New Parameter: Total hours the batch has in the semester
    isRelaxed: boolean = false, // New Parameter: If true, ignore the daily limit derived from total hours
    constraints: SchedulingConstraints = DEFAULT_CONSTRAINTS, // Injected Constraints
    globalSchedule: GlobalCollisionEntry[] = [] // New Parameter for Global Collisions
): ValidationResult => {
    const faculty = facultyList.find(f => f.id === newEntry.facultyId);
    if (!faculty) return { valid: false, message: 'Faculty not found' };

    const batch = batchList.find(b => b.id === newEntry.batchId);

    // 1. Availability Check
    const dayKey = mapDayToKey(newEntry.day);
    const slotIndex = TIME_SLOTS.findIndex(ts => ts.id === newEntry.timeSlotId);

    // Strict Check for Visiting Faculty
    if (faculty.isVisitingFaculty) {
        if (!faculty.availability) {
            // If marked VF but no avail object, assume unavailable or data error
            return { valid: false, message: `${faculty.name} (VF) has no availability data.` };
        }

        const daySlots = faculty.availability[dayKey];
        // If day is missing from map, assume unavailable
        if (!daySlots) {
            return { valid: false, message: `${faculty.name} is not available on ${newEntry.day}.` };
        }

        // Check specific slots
        if (slotIndex >= 0) {
            for (let i = 0; i < newEntry.durationInSlots; i++) {
                const checkIdx = slotIndex + i;
                if (checkIdx >= daySlots.length || daySlots[checkIdx] !== 1) {
                    return { valid: false, message: `${faculty.name} is unavailable at ${TIME_SLOTS[checkIdx]?.startTime || 'this time'}.` };
                }
            }
        }
    }
    // Standard Check for Regular Faculty (Only block if explicitly 0)
    else if (faculty.availability) {
        const daySlots = faculty.availability[dayKey];
        if (daySlots && slotIndex >= 0) {
            for (let i = 0; i < newEntry.durationInSlots; i++) {
                if (daySlots[slotIndex + i] === 0) {
                    return { valid: false, message: `${faculty.name} is marked busy at this time.` };
                }
            }
        }
    }

    // 2. Check for Direct Collisions (Room, Faculty, Batch)
    const newEntrySlots = Array.from({ length: newEntry.durationInSlots }, (_, i) => newEntry.timeSlotId + i);

    for (const existing of currentSchedule) {
        if (existing.day !== newEntry.day) continue;
        // Skip self if validating existing schedule (though usually validateMove is for NEW entries)
        if (existing.id === newEntry.id) continue;

        const existingSlots = Array.from({ length: existing.durationInSlots }, (_, i) => existing.timeSlotId + i);
        const hasOverlap = newEntrySlots.some(slot => existingSlots.includes(slot));

        if (hasOverlap) {
            // Room Collision
            if (existing.roomId === newEntry.roomId) return { valid: false, message: `Room occupied by ${existing.type}` };

            // Faculty Collision
            if (existing.facultyId === newEntry.facultyId) return { valid: false, message: `${faculty.name} is already teaching.` };

            // Batch Collision (Advanced Intersection Check)
            // We check if the new batch conflicts with existing batch (Identity or Dependency)
            // OR if we are doing sub-batch logic (legacy)
            const batchConflict = areBatchesConflicting(existing.batchId, newEntry.batchId, batchList);

            if (batchConflict) {
                // Allow if they are distinctly different sub-batches of the SAME ID (Legacy Lab Logic)
                if (existing.batchId === newEntry.batchId && existing.subBatch && newEntry.subBatch && existing.subBatch !== newEntry.subBatch) {
                    // Valid (Parallel Labs)
                } else {
                    // If one is composite (OE), detailed message
                    const bExisting = batchList.find(b => b.id === existing.batchId);
                    const bNew = batchList.find(b => b.id === newEntry.batchId);

                    let msg = `Batch Conflict`;
                    if (bNew?.includesBatchIds?.includes(existing.batchId)) msg = `Conflict: ${bExisting?.name} is part of OE Batch`;
                    if (bExisting?.includesBatchIds?.includes(newEntry.batchId)) msg = `Conflict: OE ${bExisting?.name} uses ${bNew?.name}`;

                    return { valid: false, message: msg };
                }
            }
        }
    }

    // 2.5 GLOBAL COLLISIONS Check (Room and Faculty across other projects)
    for (const globalEntry of globalSchedule) {
        if (globalEntry.day !== newEntry.day) continue;

        const globalSlots = Array.from({ length: globalEntry.durationInSlots }, (_, i) => (globalEntry.timeSlotId || 0) + i);
        const hasOverlap = newEntrySlots.some(slot => globalSlots.includes(slot));

        if (hasOverlap) {
            if (globalEntry.roomId === newEntry.roomId) {
                return { valid: false, message: `Global Conflict: Room already booked in another division.` };
            }
            if (globalEntry.facultyId === newEntry.facultyId) {
                return { valid: false, message: `Global Conflict: ${faculty.name} is teaching in another division.` };
            }
        }
    }

    // VF Priority - Skip fatigue checks
    if (faculty.isVisitingFaculty) {
        return { valid: true };
    }

    // 3. Advanced Constraints (Fatigue, Workday)
    const dailyFacultySchedule = currentSchedule.filter(
        s => s.day === newEntry.day && s.facultyId === newEntry.facultyId && s.id !== newEntry.id
    );
    dailyFacultySchedule.push(newEntry);
    dailyFacultySchedule.sort((a, b) => a.timeSlotId - b.timeSlotId);

    const dailyStudentSchedule = currentSchedule.filter(
        s => s.day === newEntry.day && s.batchId === newEntry.batchId && s.id !== newEntry.id
    );
    dailyStudentSchedule.push(newEntry);
    dailyStudentSchedule.sort((a, b) => a.timeSlotId - b.timeSlotId);

    // --- Dynamic Daily Limit based on Total Load ---
    // Formula: Round(Total / 5) + 1
    if (!isRelaxed && totalBatchWeeklyHours > 0) {
        const dailyLimit = Math.round(totalBatchWeeklyHours / 5) + 1;

        // Calculate current proposed daily hours for this batch
        const currentDailyHours = dailyStudentSchedule.reduce((sum, s) => sum + s.durationInSlots, 0);

        if (currentDailyHours > dailyLimit) {
            return { valid: false, message: `Exceeds suggested daily limit of ${dailyLimit}h` };
        }
    }

    // --- Max Break (Gap) Limit for Students ---
    for (let i = 0; i < dailyStudentSchedule.length - 1; i++) {
        const currentSession = dailyStudentSchedule[i];
        const nextSession = dailyStudentSchedule[i + 1];

        const currentEnd = currentSession.timeSlotId + currentSession.durationInSlots;
        const nextStart = nextSession.timeSlotId;

        // Gap calculation: Start of next minus End of current
        const gap = nextStart - currentEnd;

        // Configurable Gap Limit
        if (gap > constraints.studentDailyGapLimit) {
            return { valid: false, message: `Student break > ${constraints.studentDailyGapLimit}h` };
        }
    }

    // Faculty Workday Window
    if (dailyFacultySchedule.length > 0) {
        const firstClassStart = dailyFacultySchedule[0].timeSlotId;
        const lastClassEnd = dailyFacultySchedule[dailyFacultySchedule.length - 1].timeSlotId + dailyFacultySchedule[dailyFacultySchedule.length - 1].durationInSlots;
        if ((lastClassEnd - firstClassStart) > constraints.facultyWorkdayWindow) {
            return { valid: false, message: `Faculty workday > ${constraints.facultyWorkdayWindow}h` };
        }
    }

    // Faculty Continuous
    let continuousTheory = 0;
    let continuousMixed = 0;
    let lastEndSlot = -1;

    for (const session of dailyFacultySchedule) {
        const start = session.timeSlotId;
        const end = start + session.durationInSlots;

        if (lastEndSlot !== -1 && start === lastEndSlot) {
            continuousMixed += session.durationInSlots;
            if (session.type === SessionType.THEORY) continuousTheory += session.durationInSlots;
            else continuousTheory = 0;
        } else {
            continuousMixed = session.durationInSlots;
            continuousTheory = session.type === SessionType.THEORY ? session.durationInSlots : 0;
        }
        lastEndSlot = end;

        if (continuousTheory > constraints.maxFacultyTheoryContinuous) return { valid: false, message: `Faculty continuous theory > ${constraints.maxFacultyTheoryContinuous}h` };
        if (continuousMixed > constraints.maxFacultyMixedContinuous) return { valid: false, message: `Faculty continuous mixed > ${constraints.maxFacultyMixedContinuous}h` };
    }

    // Student Continuous
    let studentContinuous = 0;
    lastEndSlot = -1;
    for (const session of dailyStudentSchedule) {
        const start = session.timeSlotId;
        const end = start + session.durationInSlots;
        if (lastEndSlot !== -1 && start === lastEndSlot) studentContinuous += session.durationInSlots;
        else studentContinuous = session.durationInSlots;
        lastEndSlot = end;
        if (studentContinuous > constraints.maxStudentContinuous) return { valid: false, message: `Student continuous > ${constraints.maxStudentContinuous}h` };
    }

    // Subject Daily Limit
    const subjectHours = dailyStudentSchedule
        .filter(s => s.courseId === newEntry.courseId)
        .reduce((acc, curr) => acc + curr.durationInSlots, 0);

    if (subjectHours > constraints.maxSubjectDailyHours) return { valid: false, message: `Subject limit > ${constraints.maxSubjectDailyHours}h` };

    return { valid: true };
};

// --- Helper: Find Available Room ---

export const findAvailableRoom = (
    entry: Partial<ScheduleEntry>,
    day: DayOfWeek,
    timeSlotId: number,
    currentSchedule: ScheduleEntry[],
    allRooms: Room[],
    batches: StudentBatch[],
    departments: Department[],
    globalSchedule: GlobalCollisionEntry[] = []
): Room | null => {

    // 1. Determine Target Category
    let targetCategory: 'Theory' | 'Lab' | 'Tutorial';
    switch (entry.type) {
        case SessionType.LAB: targetCategory = 'Lab'; break;
        case SessionType.TUTORIAL: targetCategory = 'Tutorial'; break;
        default: targetCategory = 'Theory';
    }

    // 2. Filter Candidate Rooms
    const hasCategories = allRooms.some(r => !!r.category);
    let candidateRooms = allRooms;

    if (hasCategories) {
        // Strict Category Match
        candidateRooms = allRooms.filter(r => r.category === targetCategory);
        if (candidateRooms.length === 0 && targetCategory === 'Tutorial') {
            candidateRooms = allRooms.filter(r => r.category === 'Theory');
        }
    } else {
        // Legacy fallback
        const isLab = entry.type === SessionType.LAB;
        candidateRooms = allRooms.filter(r => isLab ? r.type === 'Lab' : r.type === 'Lecture');
    }

    // 3. Filter by Department Zoning
    const batch = batches.find(b => b.id === entry.batchId);
    let zonedRooms = candidateRooms;
    if (batch) {
        const dept = departments.find(d => d.id === batch.departmentId);
        if (dept && dept.assignedFloors && dept.assignedFloors.length > 0) {
            zonedRooms = candidateRooms.filter(r => dept.assignedFloors.includes(r.floor));
        }
    }

    // 4. Sort Rooms
    let finalSearchList = zonedRooms.length > 0 ? zonedRooms : candidateRooms;
    finalSearchList.sort((a, b) => {
        if (a.isBackup === b.isBackup) return 0;
        return a.isBackup ? 1 : -1;
    });

    // 5. Check Availability
    for (const room of finalSearchList) {
        const duration = entry.durationInSlots || 1;
        const proposedSlots = Array.from({ length: duration }, (_, i) => timeSlotId + i);

        const isOccupied = currentSchedule.some(s => {
            if (s.roomId !== room.id) return false;
            if (s.day !== day) return false;
            const existingSlots = Array.from({ length: s.durationInSlots }, (_, i) => s.timeSlotId + i);
            return proposedSlots.some(slot => existingSlots.includes(slot));
        });

        if (isOccupied) continue;

        const isGloballyOccupied = globalSchedule.some(gs => {
            if (gs.roomId !== room.id) return false;
            if (gs.day !== day) return false;
            const existingSlots = Array.from({ length: gs.durationInSlots }, (_, i) => (gs.timeSlotId || 0) + i);
            return proposedSlots.some(slot => existingSlots.includes(slot));
        });

        if (!isGloballyOccupied) return room;
    }

    return null;
};

// --- Auto Scheduler Logic ---

interface SchedulerContext {
    schedule: ScheduleEntry[];
    faculty: Faculty[];
    batches: StudentBatch[];
    rooms: Room[];
    courses: Course[];
    departments: Department[];
    batchWeeklyLoads: Map<string, number>; // Cache for total loads
    constraints: SchedulingConstraints;
    globalSchedule: GlobalCollisionEntry[];
}

// Helper to find a common slot for multiple parallel labs
const findSharedSlot = (entries: Partial<ScheduleEntry>[], ctx: SchedulerContext) => {
    // Iterate all slots
    for (const day of DAYS) {
        for (const ts of TIME_SLOTS) {
            // Check duration (assume max of group, usually labs are equal)
            const duration = Math.max(...entries.map(e => e.durationInSlots || 1));
            if (ts.id + duration > 18) continue;

            const proposedAssignments: ScheduleEntry[] = [];
            const usedRooms = new Set<string>();

            let allFit = true;

            // "Simulate" the state for this slot
            const tempSchedule = [...ctx.schedule];

            for (const entry of entries) {
                // Find room, excluding already usedRooms in this step
                const room = findAvailableRoom(
                    entry, day, ts.id, tempSchedule,
                    ctx.rooms.filter(r => !usedRooms.has(r.id)),
                    ctx.batches, ctx.departments, ctx.globalSchedule
                );

                if (!room) { allFit = false; break; }

                const candidate: ScheduleEntry = {
                    ...entry,
                    day,
                    timeSlotId: ts.id,
                    roomId: room.id,
                    id: entry.id!
                } as ScheduleEntry;

                // Validate
                const validRes = validateMove(
                    candidate, tempSchedule, ctx.faculty, ctx.batches,
                    (ctx.batchWeeklyLoads.get(candidate.batchId!) || 0),
                    false, // Strict check for auto
                    ctx.constraints,
                    ctx.globalSchedule
                );

                if (!validRes.valid) { allFit = false; break; }

                // Valid for this one. Add to temp.
                tempSchedule.push(candidate);
                usedRooms.add(room.id);
                proposedAssignments.push(candidate);
            }

            if (allFit) {
                return { assignments: proposedAssignments };
            }
        }
    }
    return null;
}

// Strategy to schedule labs in parallel
const attemptParallelScheduling = (
    unassigned: Partial<ScheduleEntry>[],
    ctx: SchedulerContext
): string[] => {
    const scheduledIds: string[] = [];

    // 1. Group by Batch
    const batchMap = new Map<string, Partial<ScheduleEntry>[]>();
    unassigned.forEach(u => {
        // Only consider Labs with SubBatches
        if (u.type === SessionType.LAB && u.batchId && u.subBatch) {
            const list = batchMap.get(u.batchId) || [];
            list.push(u);
            batchMap.set(u.batchId, list);
        }
    });

    for (const [batchId, labs] of batchMap.entries()) {
        // 2. Group by SubBatch (e.g. "Batch 1", "Batch 2")
        const subBatchMap = new Map<string, Partial<ScheduleEntry>[]>();
        labs.forEach(l => {
            const list = subBatchMap.get(l.subBatch!) || [];
            list.push(l);
            subBatchMap.set(l.subBatch!, list);
        });

        const subBatches = Array.from(subBatchMap.keys());
        if (subBatches.length < 2) continue; // Need at least 2 distinct sub-batches to parallelize

        // 3. Pair up items from distinct sub-batch buckets
        while (true) {
            const currentGroup: Partial<ScheduleEntry>[] = [];
            for (const sb of subBatches) {
                const list = subBatchMap.get(sb);
                if (list && list.length > 0) {
                    currentGroup.push(list[0]);
                }
            }

            if (currentGroup.length < 2) break; // Can't pair anymore

            // Try to find a slot for this group
            const slot = findSharedSlot(currentGroup, ctx);

            if (slot) {
                // Success! Commit them.
                slot.assignments.forEach(assign => {
                    ctx.schedule.push(assign);
                    scheduledIds.push(assign.id);
                    // Remove from the subBatchMap lists so we don't pick them again
                    const list = subBatchMap.get(assign.subBatch!);
                    if (list) {
                        const idx = list.findIndex(x => x.id === assign.id);
                        if (idx > -1) list.splice(idx, 1);
                    }
                });
            } else {
                // If we failed to schedule this specific combination together,
                // break the loop for this batch to avoid infinite retries.
                // The remaining items will be handled by the individual scheduler (Soft Constraint).
                break;
            }
        }
    }
    return scheduledIds;
}

const findBestSlot = (
    entry: Partial<ScheduleEntry>,
    ctx: SchedulerContext,
    isRelaxed: boolean = false
): ScheduleEntry | null => {

    // Get total weekly hours for this batch to pass to validation
    const totalHours = ctx.batchWeeklyLoads.get(entry.batchId!) || 0;

    // --- Faculty Distribution Strategy ---
    // Prioritize days where this faculty member has fewer classes to spread load
    let dayOrder = [...DAYS];
    if (entry.facultyId) {
        const facLoad = new Map<string, number>();
        DAYS.forEach(d => facLoad.set(d, 0));

        ctx.schedule.forEach(s => {
            if (s.facultyId === entry.facultyId) {
                facLoad.set(s.day, (facLoad.get(s.day) || 0) + 1);
            }
        });

        // Sort Ascending: Least loaded days first
        dayOrder.sort((a, b) => (facLoad.get(a) || 0) - (facLoad.get(b) || 0));
    }
    // ------------------------------------

    for (const day of dayOrder) {
        for (const ts of TIME_SLOTS) {
            if (ts.id + (entry.durationInSlots || 1) > 18) continue;

            const room = findAvailableRoom(
                entry,
                day,
                ts.id,
                ctx.schedule,
                ctx.rooms,
                ctx.batches,
                ctx.departments,
                ctx.globalSchedule
            );

            if (room) {
                const candidate: ScheduleEntry = {
                    ...entry,
                    day,
                    timeSlotId: ts.id,
                    roomId: room.id,
                    id: entry.id || Math.random().toString()
                } as ScheduleEntry;

                // Validate with relaxed flag and total hours
                const result = validateMove(
                    candidate,
                    ctx.schedule,
                    ctx.faculty,
                    ctx.batches,
                    totalHours,
                    isRelaxed,
                    ctx.constraints,
                    ctx.globalSchedule
                );

                if (result.valid) {
                    return candidate;
                }
            }
        }
    }
    return null;
};

export const generateSchedule = (
    currentUnassigned: Partial<ScheduleEntry>[],
    currentSchedule: ScheduleEntry[],
    faculty: Faculty[],
    batches: StudentBatch[],
    rooms: Room[],
    courses: Course[],
    departments: Department[],
    constraints: SchedulingConstraints = DEFAULT_CONSTRAINTS,
    globalSchedule: GlobalCollisionEntry[] = []
): { schedule: ScheduleEntry[], unassigned: Partial<ScheduleEntry>[] } => {

    let newSchedule = [...currentSchedule];
    let remainingUnassigned = [...currentUnassigned];

    // Pre-calculate Total Weekly Hours for each Batch
    const batchWeeklyLoads = new Map<string, number>();
    const allSessions = [...currentSchedule, ...currentUnassigned];

    for (const s of allSessions) {
        if (s.batchId) {
            const current = batchWeeklyLoads.get(s.batchId) || 0;
            batchWeeklyLoads.set(s.batchId, current + (s.durationInSlots || 1));
        }
    }

    const ctx: SchedulerContext = {
        schedule: newSchedule,
        faculty,
        batches,
        rooms,
        courses,
        departments,
        batchWeeklyLoads,
        constraints,
        globalSchedule
    };

    // Sort: Harder to schedule items first
    remainingUnassigned.sort((a, b) => {
        const facA = faculty.find(f => f.id === a.facultyId);
        const facB = faculty.find(f => f.id === b.facultyId);
        const courseA = courses.find(c => c.id === a.courseId);
        const courseB = courses.find(c => c.id === b.courseId);

        if (courseA?.isElective && !courseB?.isElective) return -1;
        if (!courseA?.isElective && courseB?.isElective) return 1;

        if (facA?.isVisitingFaculty && !facB?.isVisitingFaculty) return -1;
        if (!facA?.isVisitingFaculty && facB?.isVisitingFaculty) return 1;

        if (a.type === SessionType.LAB && b.type !== SessionType.LAB) return -1;
        if (a.type !== SessionType.LAB && b.type === SessionType.LAB) return 1;

        return 0;
    });

    // --- PHASE 1: Parallel Lab Scheduling (Soft Constraint) ---
    // Try to schedule labs for different sub-batches at the same time
    const parallelIds = attemptParallelScheduling(remainingUnassigned, ctx);

    // Filter out items that were successfully scheduled in Phase 1
    if (parallelIds.length > 0) {
        remainingUnassigned = remainingUnassigned.filter(u => !parallelIds.includes(u.id!));
    }

    const successIds: string[] = [];

    // --- PHASE 2: Individual Scheduling ---
    for (const entry of remainingUnassigned) {
        if (successIds.includes(entry.id!)) continue;

        // Pass 1: Strict (Respect Daily Limit: Total/5 + 1)
        let assigned = findBestSlot(entry, ctx, false);

        // Pass 2: Relaxed (Ignore Daily Limit if Pass 1 fails)
        if (!assigned) {
            assigned = findBestSlot(entry, ctx, true);
        }

        if (assigned) {
            newSchedule.push(assigned);
            successIds.push(entry.id!);
        }
    }

    return {
        schedule: newSchedule,
        unassigned: remainingUnassigned.filter(u => !successIds.includes(u.id!))
    };
};