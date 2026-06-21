import { TimeSlot, DayOfWeek, SchedulingConstraints } from './types';

export const TIME_SLOTS: TimeSlot[] = [
  { id: 8, startTime: '08:00', endTime: '09:00', label: '08:00 - 09:00' },
  { id: 9, startTime: '09:00', endTime: '10:00', label: '09:00 - 10:00' },
  { id: 10, startTime: '10:00', endTime: '11:00', label: '10:00 - 11:00' },
  { id: 11, startTime: '11:00', endTime: '12:00', label: '11:00 - 12:00' },
  { id: 12, startTime: '12:00', endTime: '13:00', label: '12:00 - 13:00' }, // Lunch usually, but schedulable
  { id: 13, startTime: '13:00', endTime: '14:00', label: '13:00 - 14:00' },
  { id: 14, startTime: '14:00', endTime: '15:00', label: '14:00 - 15:00' },
  { id: 15, startTime: '15:00', endTime: '16:00', label: '15:00 - 16:00' },
  { id: 16, startTime: '16:00', endTime: '17:00', label: '16:00 - 17:00' },
  { id: 17, startTime: '17:00', endTime: '18:00', label: '17:00 - 18:00' },
];

export const DAYS = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

// Default Configuration Limits
export const DEFAULT_CONSTRAINTS: SchedulingConstraints = {
  maxFacultyTheoryContinuous: 3,
  maxFacultyMixedContinuous: 5,
  maxStudentContinuous: 5,
  maxSubjectDailyHours: 3,
  facultyWorkdayWindow: 8,
  studentDailyGapLimit: 2,
};

// Legacy exports for backward compatibility (referencing defaults)
export const MAX_FACULTY_THEORY_CONTINUOUS = DEFAULT_CONSTRAINTS.maxFacultyTheoryContinuous;
export const MAX_FACULTY_MIXED_CONTINUOUS = DEFAULT_CONSTRAINTS.maxFacultyMixedContinuous;
export const MAX_STUDENT_CONTINUOUS = DEFAULT_CONSTRAINTS.maxStudentContinuous;
export const MAX_SUBJECT_DAILY_HOURS = DEFAULT_CONSTRAINTS.maxSubjectDailyHours;
export const FACULTY_WORKDAY_WINDOW = DEFAULT_CONSTRAINTS.facultyWorkdayWindow;