

export enum SessionType {
  THEORY = 'Theory',
  LAB = 'Lab',
  TUTORIAL = 'Tutorial',
}

export enum DayOfWeek {
  MONDAY = 'Monday',
  TUESDAY = 'Tuesday',
  WEDNESDAY = 'Wednesday',
  THURSDAY = 'Thursday',
  FRIDAY = 'Friday',
  SATURDAY = 'Saturday',
}

export interface Room {
  id: string;
  name: string;
  floor: number;
  capacity: number;
  type: 'Lecture' | 'Lab' | 'Tutorial' | 'Event' | 'Other';
  category?: 'Theory' | 'Lab' | 'Tutorial';
  isBackup?: boolean;
  isComputerCenter?: boolean;
}

export interface Faculty {
  id: string;
  name: string;
  departmentId: string;
  isVisitingFaculty: boolean;
  contactNumber?: string;
  availability?: { [key: string]: number[] };
}

export interface Course {
  id: string;
  name: string;
  code: string;
  departmentId: string;
  isElective?: boolean;
  combinedWith?: string[];
  oeGroupId?: string; // Links course to an OE Group
}

export interface StudentBatch {
  id: string;
  name: string;
  departmentId: string;
  division: string;
  shift: 'Morning' | 'Evening';
  program: string;
  semester: string | number;
  // For OE: List of other batch IDs that are included in this batch
  // e.g. "OE-Batch-2" includes ["Div-B-Id", "Div-C-Id", "Div-D-Id"]
  includesBatchIds?: string[];
}

// --- OPEN ELECTIVE CONFIGURATION ---
export interface OEGroupConfig {
  id: string;
  name: string; // e.g. "OE-1"
  participatingBatchIds: string[]; // All unique atomic batches involved (Union of all subjects)
  color?: string; // Visual helper
}

export interface TimeSlot {
  id: number;
  startTime: string;
  endTime: string;
  label: string;
}

export interface ScheduleEntry {
  id: string;
  courseId: string;
  facultyId: string;
  batchId: string;
  roomId: string;
  day: DayOfWeek;
  timeSlotId: number;
  type: SessionType;
  durationInSlots: number;
  subBatch?: string;
  isLocked?: boolean;
  isOE?: boolean; // Flag to identify OE entries
  oeGroupId?: string;
}

// Used for UI components that need resolved names
export interface EnrichedScheduleEntry extends Partial<ScheduleEntry> {
  id: string;
  _courseName?: string;
  _facultyName?: string;
  _batchName?: string;
  _combinedBatchNames?: string[];
  // Legacy props from initial code
  courseCode?: string;
  facultyName?: string;
  roomName?: string;
  batchName?: string;
}

export interface Department {
  id: string;
  name: string;
  assignedFloors: number[];
  assignedShift: 'Morning' | 'Evening';
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

export interface ImportedData {
  faculty: Faculty[];
  batches: StudentBatch[];
  courses: Course[];
  unassigned: Partial<ScheduleEntry>[];
  departments: Department[];
  oeGroups?: OEGroupConfig[]; // Optional OE data
}

// --- CONFIGURATION TYPES ---

export interface SchedulingConstraints {
  maxFacultyTheoryContinuous: number;
  maxFacultyMixedContinuous: number;
  maxStudentContinuous: number;
  maxSubjectDailyHours: number;
  facultyWorkdayWindow: number;
  studentDailyGapLimit: number; // Max empty slots between classes
}

// --- NEW TYPES FOR MULTI-PROJECT & VERSION CONTROL ---

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  departmentId?: string;
}

export interface ProjectData {
  schedule: ScheduleEntry[];
  unassigned: Partial<ScheduleEntry>[];
  faculty: Faculty[];
  batches: StudentBatch[];
  courses: Course[];
  rooms: Room[];
  departments: Department[];
  oeGroups?: OEGroupConfig[];
}

export interface SavedVersion {
  id: string;
  projectId: string;
  name: string;
  timestamp: number;
  data: ProjectData;
}

export interface GlobalState {
  globalRooms: Room[];
  globalFaculty: Faculty[];
}

export interface DeletionImpact {
  projectId: string;
  projectName: string;
  affectedCount: number;
}

export interface HistorySnapshot {
  schedule: ScheduleEntry[];
  unassigned: Partial<ScheduleEntry>[];
}

export interface HistoryState {
  history: HistorySnapshot[];
  future: HistorySnapshot[];
}