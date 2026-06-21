import ExcelJS from 'exceljs';
import { Faculty, StudentBatch, Course, ScheduleEntry, SessionType, Department, DayOfWeek, ImportedData, OEGroupConfig } from '../types';
import { TIME_SLOTS } from '../constants';

// --- Regex Helpers ---
const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const _time_range_re = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?\s*[-–to]{1,3}\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?/;
const _day_token_re = /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\b/gi;

const parseTimePart = (hourStr: string, minuteStr: string | undefined, ampm: string | undefined): number => {
  let hour = parseInt(hourStr);
  let minute = minuteStr ? parseInt(minuteStr) : 0;
  if (ampm) {
    const lower = ampm.toLowerCase();
    if (lower.endsWith('pm') && hour !== 12) hour += 12;
    if (lower.endsWith('am') && hour === 12) hour = 0;
  }
  return hour * 60 + minute;
};

// Returns a map of day -> slots (0 or 1)
const parseAvailability = (remarks: string | undefined): { [key: string]: number[] } => {
  const slotCount = TIME_SLOTS.length;
  const mapping: { [key: string]: number[] } = {};

  if (!remarks || !remarks.trim()) {
    DAY_ORDER.forEach(d => mapping[d] = new Array(slotCount).fill(1));
    return mapping;
  }

  // If remarks exist, we default to 0 and fill 1 where mentioned
  const parts = remarks.split(/,\s*(?![^()]*\))/);

  parts.forEach(p => {
    p = p.trim();
    if (!p) return;

    // Check Full Day
    if (/\b(full day|fullday|all day)\b/i.test(p)) {
      const days = p.match(_day_token_re);
      if (days) {
        days.forEach(d => {
          const dayKey = d.substring(0, 3).toLowerCase();
          mapping[dayKey] = new Array(slotCount).fill(1);
        });
      } else {
        // All days
        DAY_ORDER.forEach(d => mapping[d] = new Array(slotCount).fill(1));
      }
      return;
    }

    // Check Time Range
    const m = p.match(_time_range_re);
    const days = p.match(_day_token_re);

    if (m) {
      const startMin = parseTimePart(m[1], m[2], m[3]);
      const endMin = parseTimePart(m[4], m[5], m[6]);

      const dayKeys = days ? days.map(d => d.substring(0, 3).toLowerCase()) : DAY_ORDER;

      dayKeys.forEach(d => {
        // Initialize if not present. Default to 0 (Busy) because specific times are being set.
        if (!mapping[d]) {
          mapping[d] = new Array(slotCount).fill(0);
        }

        TIME_SLOTS.forEach((slot, idx) => {
          const [sh, sm] = slot.startTime.split(':').map(Number);
          const [eh, em] = slot.endTime.split(':').map(Number);
          const slotStartMin = sh * 60 + sm;
          const slotEndMin = eh * 60 + em;

          // Check intersection or containment
          if (startMin < slotEndMin && endMin > slotStartMin) {
            mapping[d][idx] = 1;
          }
        });
      });
    } else if (days) {
      days.forEach(d => {
        const dayKey = d.substring(0, 3).toLowerCase();
        // Explicit day mention without time -> Full Day Available
        mapping[dayKey] = new Array(slotCount).fill(1);
      });
    }
  });

  return mapping;
};

// --- Importer Logic ---

const generateId = (_prefix?: string) => crypto.randomUUID();

export const processExcelFile = async (file: File): Promise<ImportedData> => {
  const data = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(data) as any);

  // Sheet 1: Main Schedule — convert worksheet rows to plain objects keyed by header
  const mainSheet = workbook.worksheets[0];
  const headers: string[] = [];
  const mainRows: any[] = [];
  mainSheet.eachRow((row, rowIndex) => {
    if (rowIndex === 1) {
      (row.values as any[]).forEach((v, i) => { if (i > 0) headers[i] = String(v ?? ''); });
    } else {
      const obj: any = {};
      (row.values as any[]).forEach((v, i) => {
        if (i > 0 && headers[i]) obj[headers[i]] = (v !== null && v !== undefined) ? v : undefined;
      });
      mainRows.push(obj);
    }
  });

  const facultyMap = new Map<string, Faculty>();
  const batchMap = new Map<string, StudentBatch>();
  const courseMap = new Map<string, Course>();
  const deptMap = new Map<string, Department>();
  const unassigned: Partial<ScheduleEntry>[] = [];

  // Deduplication Set for OE Sessions: "courseId_type_compositeBatchId"
  const processedOESessions = new Set<string>();

  const ensureDepartment = (deptName: string): string => {
    const safeName = deptName ? String(deptName).trim() : 'General';
    const id = `dept_${safeName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    if (!deptMap.has(id)) {
      deptMap.set(id, {
        id,
        name: safeName,
        assignedFloors: [1, 2], // Default
        assignedShift: 'Morning'
      });
    }
    return id;
  };

  const ensureFaculty = (name: string, deptId: string, isVF: boolean, availabilityRaw?: string): string => {
    if (!name || String(name).trim() === '') return '';
    const cleanName = String(name).trim();
    const key = cleanName.toLowerCase();

    for (const f of facultyMap.values()) {
      if (f.name.toLowerCase() === key) return f.id;
    }

    const id = generateId('f');
    const newFaculty: Faculty = {
      id,
      name: cleanName,
      departmentId: deptId,
      isVisitingFaculty: isVF,
      availability: parseAvailability(availabilityRaw)
    };
    facultyMap.set(id, newFaculty);
    return id;
  };

  const ensureBatch = (program: string, sem: string | number, div: string, deptId: string): string => {
    const cleanProg = String(program || 'Gen').trim();
    const cleanSem = String(sem || '1').trim();
    const cleanDiv = String(div || 'A').trim();

    const batchName = `${cleanProg}-Sem${cleanSem}-${cleanDiv}`;

    for (const b of batchMap.values()) {
      if (b.name === batchName) return b.id;
    }

    const id = generateId('b');
    const newBatch: StudentBatch = {
      id,
      name: batchName,
      departmentId: deptId,
      division: cleanDiv,
      shift: 'Morning',
      program: cleanProg,
      semester: cleanSem
    };
    batchMap.set(batchName, newBatch);
    return id;
  };

  const ensureCourse = (name: string, deptId: string, isElective: boolean, combined: string[]): string => {
    if (!name) return '';
    const cleanName = String(name).trim();

    for (const c of courseMap.values()) {
      if (c.name === cleanName) return c.id;
    }

    const id = generateId('c');
    const newCourse: Course = {
      id,
      name: cleanName,
      code: cleanName.substring(0, 6).toUpperCase(),
      departmentId: deptId,
      isElective,
      combinedWith: combined
    };
    courseMap.set(cleanName, newCourse);
    return id;
  };

  // Helper to find a batch ID by fuzzy name matching (for OE linkage)
  // We need to look up existing batches in our current map
  const findBatchIdByName = (name: string, referenceSemester?: string | number): string | undefined => {
    // Remove leading count numbers like "1 " if present
    const clean = name.replace(/^\d+\s+/, '').trim().toLowerCase();

    // 1. Try exact match (Case insensitive)
    for (const [bName, b] of batchMap.entries()) {
      if (bName.toLowerCase() === clean) return b.id;
    }

    // 2. Try partial match: "Div A" or "Division A"
    for (const [bName, b] of batchMap.entries()) {
      const parts = bName.toLowerCase().split('-');
      const lastPart = parts[parts.length - 1]; // "A"
      if (lastPart === clean || `div ${lastPart}` === clean || `division ${lastPart}` === clean) {
        return b.id;
      }
    }

    // 3. Try Component Match (e.g. "MBA.Tech (AI) M" matching "MBA.Tech (AI)-Sem5-M")
    if (referenceSemester) {
      for (const b of batchMap.values()) {
        const prog = b.program.toLowerCase();
        const div = b.division.toLowerCase();
        if (clean.includes(prog) && clean.includes(div)) {
          return b.id;
        }
      }
    }

    return undefined;
  };

  // 1. First Pass: Create all Standard Batches
  mainRows.forEach((row: any) => {
    const program = row['Program'];
    const sem = row['Semester'];
    const div = row['Division'];
    const deptName = row['Department to which Services Requested'] || program;

    const deptId = ensureDepartment(deptName);
    ensureBatch(program, sem, div, deptId);
  });

  // 2. Second Pass: Process Schedule & OEs
  mainRows.forEach((row: any) => {
    const program = row['Program'];
    const sem = row['Semester'];
    const div = row['Division'];
    const courseName = row['Name of the Course'];
    const deptName = row['Department to which Services Requested'] || program;

    const electiveFlag = row['Elective'];
    const isElective = electiveFlag === 1 || String(electiveFlag).toLowerCase() === 'yes';
    const combinedRaw = row['Combined Lectures'];
    const combinedList = combinedRaw ? String(combinedRaw).split(',').map(s => s.trim()) : [];

    const deptId = ensureDepartment(deptName);
    const standardBatchId = ensureBatch(program, sem, div, deptId);
    const courseId = ensureCourse(courseName, deptId, isElective, combinedList);

    const remarks = row['Remarks'] || row['Availability'] || row['vf hours'];

    // --- OE LOGIC ---
    const isOEColumn = row['Is OE'] || row['OE'] || row['Open Elective'];
    const isOE = isOEColumn === 1 || String(isOEColumn).toLowerCase() === 'yes';
    const oeComposition = row['Composition'] || row['Combined Divisions'] || row['Participating Divisions'];
    const oeBatchName = row['Batch'] || row['OE Batch'];

    let finalBatchId = standardBatchId;
    let isOESession = false;

    if (isOE && oeComposition) {
      isOESession = true;

      // Create a unique composite name including the Batch Name if present
      // This ensures Batch 1 and Batch 2 are treated as different groups
      const suffix = oeBatchName ? `-${String(oeBatchName).replace(/\s+/g, '')}` : '';
      const compBatchName = `OE-${courseName}${suffix}`;

      let compBatchId = '';
      for (const [name, b] of batchMap.entries()) {
        if (name === compBatchName) compBatchId = b.id;
      }

      if (!compBatchId) {
        compBatchId = generateId('b_oe');
        const parentBatchIds: string[] = [];

        // Parse Composition
        const comps = String(oeComposition).split(',').map(s => s.trim());
        comps.forEach(c => {
          const pid = findBatchIdByName(c, sem);
          if (pid) parentBatchIds.push(pid);
          else if (c.toLowerCase() === 'current' || c === '') parentBatchIds.push(standardBatchId);
        });

        if (!parentBatchIds.includes(standardBatchId)) {
          parentBatchIds.push(standardBatchId);
        }

        const newCompBatch: StudentBatch = {
          id: compBatchId,
          name: compBatchName,
          departmentId: deptId, // Use actual department from current row, not a hardcoded phantom ID
          division: 'OE',
          shift: 'Morning',
          program: 'OE',
          semester: 0,
          includesBatchIds: [...new Set(parentBatchIds)]
        };
        batchMap.set(compBatchName, newCompBatch);
      } else {
        // Update existing composite batch to include current row's batch if missing
        const existingBatch = batchMap.get(compBatchName);
        if (existingBatch && existingBatch.includesBatchIds && !existingBatch.includesBatchIds.includes(standardBatchId)) {
          existingBatch.includesBatchIds.push(standardBatchId);
        }
      }
      finalBatchId = compBatchId;
    }

    // Theory
    const theoryHours = parseInt(row['Theory'] || '0');
    const isVF = (String(row['C/VF'] || '')).toUpperCase().includes('VF');
    const theoryFacName = row['Name of Faculty (Theory)'];
    const theoryFacId = ensureFaculty(theoryFacName, deptId, isVF, isVF ? remarks : undefined);

    if (theoryHours > 0 && theoryFacId) {
      // DEDUPLICATION Check for OE:
      // If this is an OE, and we already processed sessions for this Course+Fac+Type+CompositeBatch, skip.
      const dedupKey = `${courseId}_${theoryFacId}_${SessionType.THEORY}_${finalBatchId}`;

      if (!isOESession || !processedOESessions.has(dedupKey)) {
        if (isOESession) processedOESessions.add(dedupKey);

        for (let i = 0; i < theoryHours; i++) {
          unassigned.push({
            id: generateId('u_th'),
            courseId,
            facultyId: theoryFacId,
            batchId: finalBatchId,
            type: SessionType.THEORY,
            durationInSlots: 1,
            isOE: isOESession,
            // Use the explicit batch name from Excel as the subBatch identifier for display
            subBatch: isOESession && oeBatchName ? String(oeBatchName) : undefined
          });
        }
      }
    }

    // Practical
    const praHours = parseInt(row['PRA'] || '0');
    let numBatches = parseInt(row['No. of Batches for Practical/ Tutorial'] || '1');
    const facCol1 = row['Name of Faculty Batch 1 (Lab/Tut)'];
    const facCol2 = row['Name of Faculty Batch 2 (Lab/Tut)'];
    const facCol3 = row['Name of Faculty Batch 3 (Lab/Tut)'];
    if (numBatches === 1 && (facCol2 || facCol3)) numBatches = Math.max(numBatches, facCol2 ? 2 : 0, facCol3 ? 3 : 0);

    if (praHours > 0) {
      const num2h = Math.floor(praHours / 2);
      const num1h = praHours % 2;
      const createLabSession = (facName: string, subBatch: string, duration: number) => {
        const facId = ensureFaculty(facName, deptId, isVF, isVF ? remarks : undefined);
        unassigned.push({
          id: generateId('u_lab'),
          courseId,
          facultyId: facId,
          batchId: finalBatchId,
          type: SessionType.LAB,
          durationInSlots: duration,
          subBatch
        });
      };
      const handleBatch = (facName: string, batchNum: number) => {
        if (!facName && batchNum === 1) facName = theoryFacName;
        if (!facName) return;
        // If OE, we might want to qualify the Lab batch if names collide, but standard 'Batch 1' usually suffices for local context
        for (let k = 0; k < num2h; k++) createLabSession(facName, `Batch ${batchNum}`, 2);
        for (let k = 0; k < num1h; k++) createLabSession(facName, `Batch ${batchNum}`, 1);
      };
      handleBatch(facCol1, 1);
      if (numBatches >= 2) handleBatch(facCol2, 2);
      if (numBatches >= 3) handleBatch(facCol3, 3);
    }

    // Tutorial
    const tutHours = parseInt(row['Tutorial'] || '0');
    if (tutHours > 0) {
      const handleTutBatch = (facName: string, batchNum: number) => {
        if (!facName && batchNum === 1) facName = theoryFacName;
        if (!facName) return;
        for (let k = 0; k < tutHours; k++) {
          unassigned.push({
            id: generateId('u_tut'),
            courseId,
            facultyId: ensureFaculty(facName, deptId, isVF, isVF ? remarks : undefined),
            batchId: finalBatchId,
            type: SessionType.TUTORIAL,
            durationInSlots: 1,
            subBatch: numBatches > 1 ? `Batch ${batchNum}` : undefined
          });
        }
      };
      handleTutBatch(facCol1, 1);
      if (numBatches >= 2) handleTutBatch(facCol2, 2);
      if (numBatches >= 3) handleTutBatch(facCol3, 3);
    }
  });

  const facultyList = Array.from(facultyMap.values());
  const batchList = Array.from(batchMap.values());
  const courseList = Array.from(courseMap.values());
  const deptList = Array.from(deptMap.values());

  return {
    faculty: facultyList,
    batches: batchList,
    courses: courseList,
    departments: deptList,
    unassigned,
    oeGroups: []
  };
};

export const downloadTemplate = async () => {
  const colDefs = [
    { header: 'Program', key: 'Program', width: 10 },
    { header: 'Semester', key: 'Semester', width: 8 },
    { header: 'Division', key: 'Division', width: 8 },
    { header: 'Department to which Services Requested', key: 'Department to which Services Requested', width: 20 },
    { header: 'Name of the Course', key: 'Name of the Course', width: 25 },
    { header: 'Elective', key: 'Elective', width: 8 },
    { header: 'Theory', key: 'Theory', width: 8 },
    { header: 'PRA', key: 'PRA', width: 8 },
    { header: 'Tutorial', key: 'Tutorial', width: 8 },
    { header: 'Name of Faculty (Theory)', key: 'Name of Faculty (Theory)', width: 25 },
    { header: 'C/VF', key: 'C/VF', width: 10 },
    { header: 'Name of Faculty Batch 1 (Lab/Tut)', key: 'Name of Faculty Batch 1 (Lab/Tut)', width: 25 },
    { header: 'Name of Faculty Batch 2 (Lab/Tut)', key: 'Name of Faculty Batch 2 (Lab/Tut)', width: 25 },
    { header: 'Name of Faculty Batch 3 (Lab/Tut)', key: 'Name of Faculty Batch 3 (Lab/Tut)', width: 25 },
    { header: 'Is OE', key: 'Is OE', width: 8 },
    { header: 'Batch', key: 'Batch', width: 10 },
    { header: 'Composition', key: 'Composition', width: 20 },
    { header: 'Remarks', key: 'Remarks', width: 30 },
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Template');
  ws.columns = colDefs;
  ws.addRow(['CS', 3, 'A', 'CS', 'Data Structures', 'No', 3, 2, 0,
    'Prof. Smith', 'Regular', 'Prof. Smith', 'Prof. Doe', '',
    '', 'Batch 1', '', '']);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Schedule_Template.xlsx';
  a.click();
  window.URL.revokeObjectURL(url);
};