import { Department, Faculty, Room, Course, StudentBatch, ScheduleEntry, SessionType, DayOfWeek } from '../types';

export const DEPARTMENTS: Department[] = [
  { id: 'dept_cs', name: 'Computer Science', assignedFloors: [3, 4], assignedShift: 'Morning' },
  { id: 'dept_me', name: 'Mechanical Eng', assignedFloors: [1, 2], assignedShift: 'Evening' },
];

export const ROOMS: Room[] = [
  // CS Floors 3, 4
  { id: 'r_301', name: '301', floor: 3, capacity: 60, type: 'Lecture', category: 'Theory' },
  { id: 'r_302', name: '302', floor: 3, capacity: 60, type: 'Lecture', category: 'Theory' },
  { id: 'r_401', name: 'CS Lab 1', floor: 4, capacity: 30, type: 'Lab', category: 'Lab' },
  { id: 'r_cc1', name: 'CC-01', floor: 1, capacity: 100, type: 'Lab', category: 'Lab', isComputerCenter: true }, 
  // ME Floors 1, 2
  { id: 'r_101', name: '101', floor: 1, capacity: 60, type: 'Lecture', category: 'Theory' },
  { id: 'r_201', name: 'Mech Lab', floor: 2, capacity: 30, type: 'Lab', category: 'Lab' },
];

export const FACULTY: Faculty[] = [
  { id: 'f_smith', name: 'Prof. Smith', departmentId: 'dept_cs', isVisitingFaculty: false }, // Regular
  { id: 'f_doe', name: 'Dr. Jane Doe', departmentId: 'dept_cs', isVisitingFaculty: true }, // VF (VIP)
  { id: 'f_mech', name: 'Prof. Gear', departmentId: 'dept_me', isVisitingFaculty: false },
];

export const COURSES: Course[] = [
  { id: 'c_algo', name: 'Algorithms', code: 'CS101', departmentId: 'dept_cs' },
  { id: 'c_db', name: 'Databases', code: 'CS102', departmentId: 'dept_cs' },
  { id: 'c_thermo', name: 'Thermodynamics', code: 'ME101', departmentId: 'dept_me' },
];

export const BATCHES: StudentBatch[] = [
  { id: 'b_cs_a', name: 'CS-A-2024', departmentId: 'dept_cs', division: 'A', shift: 'Morning', program: 'CS', semester: 1 },
  { id: 'b_me_a', name: 'ME-A-2024', departmentId: 'dept_me', division: 'A', shift: 'Evening', program: 'ME', semester: 1 },
];

// Initial seeded schedule (Partial)
export const INITIAL_SCHEDULE: ScheduleEntry[] = [
  {
    id: 's_1',
    courseId: 'c_algo',
    facultyId: 'f_smith',
    batchId: 'b_cs_a',
    roomId: 'r_301',
    day: DayOfWeek.MONDAY,
    timeSlotId: 9,
    type: SessionType.THEORY,
    durationInSlots: 1
  },
  // Lab Session (2 hours)
  {
    id: 's_2',
    courseId: 'c_db',
    facultyId: 'f_doe',
    batchId: 'b_cs_a',
    roomId: 'r_401',
    day: DayOfWeek.MONDAY,
    timeSlotId: 10,
    type: SessionType.LAB,
    durationInSlots: 2
  }
];

export const UNASSIGNED_SESSIONS: Partial<ScheduleEntry>[] = [
  {
    id: 'u_1',
    courseId: 'c_algo',
    facultyId: 'f_smith',
    batchId: 'b_cs_a',
    type: SessionType.THEORY,
    durationInSlots: 1
  },
  {
    id: 'u_2',
    courseId: 'c_db',
    facultyId: 'f_smith',
    batchId: 'b_cs_a',
    type: SessionType.TUTORIAL,
    durationInSlots: 1
  },
   {
    id: 'u_3',
    courseId: 'c_thermo',
    facultyId: 'f_mech',
    batchId: 'b_me_a',
    type: SessionType.THEORY,
    durationInSlots: 1
  },
  {
    id: 'u_4',
    courseId: 'c_algo',
    facultyId: 'f_doe', // VF
    batchId: 'b_cs_a',
    type: SessionType.THEORY,
    durationInSlots: 1
  }
];