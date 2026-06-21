import React, { useMemo } from 'react';
import { ScheduleEntry, TimeSlot, Room, DayOfWeek, Faculty, StudentBatch } from '../types';
import { DAYS, TIME_SLOTS } from '../constants';
import { DraggableSlot } from './DraggableSlot';

interface Props {
  schedule: ScheduleEntry[];
  rooms: Room[];
  batches?: StudentBatch[]; // Added prop
  filterBatchId?: string;
  filterFacultyId?: string;
  selectedFaculty?: Faculty;
  onDrop: (e: React.DragEvent, day: DayOfWeek, timeSlotId: number, roomId: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onToggleLock: (id: string) => void; // New prop
  readOnly?: boolean;
}

// Algorithm to calculate position (left) and size (width) for overlapping events
const calculateDayLayout = (entries: ScheduleEntry[]): Map<string, React.CSSProperties> => {
  const layoutMap = new Map<string, React.CSSProperties>();

  // 1. Sort by start time, then duration (longest first)
  const sorted = [...entries].sort((a, b) => {
    if (a.timeSlotId !== b.timeSlotId) return a.timeSlotId - b.timeSlotId;
    return b.durationInSlots - a.durationInSlots;
  });

  // 2. Assign Columns: "Greedy Packing"
  // We map each entry to a column index (0, 1, 2...)
  const entryColIndex = new Map<string, number>();
  const slotOccupancy = new Map<number, Set<number>>(); // timeSlot -> Set of used column indices

  sorted.forEach(entry => {
    const start = entry.timeSlotId;
    const duration = entry.durationInSlots;

    // Find the lowest column index that is free for the entire duration of this entry
    let col = 0;
    let found = false;

    while (!found) {
      let isFree = true;
      for (let t = 0; t < duration; t++) {
        const s = start + t;
        if (slotOccupancy.get(s)?.has(col)) {
          isFree = false;
          break;
        }
      }
      if (isFree) {
        found = true;
      } else {
        col++;
      }
    }

    entryColIndex.set(entry.id, col);

    // Mark this column as occupied in the slots
    for (let t = 0; t < duration; t++) {
      const s = start + t;
      if (!slotOccupancy.has(s)) slotOccupancy.set(s, new Set());
      slotOccupancy.get(s)!.add(col);
    }
  });

  // 3. Calculate Widths
  // Width is determined by the maximum number of columns active during the entry's lifespan
  sorted.forEach(entry => {
    const start = entry.timeSlotId;
    const duration = entry.durationInSlots;

    // Check "concurrency" in each slot this entry touches
    let maxConcurrent = 0;
    for (let t = 0; t < duration; t++) {
      const s = start + t;
      const colsInSlot = slotOccupancy.get(s);
      if (colsInSlot) {
        // The logical count is the max index used + 1
        const maxIdx = Math.max(...Array.from(colsInSlot));
        if (maxIdx > maxConcurrent) maxConcurrent = maxIdx;
      }
    }

    const totalCols = maxConcurrent + 1;
    const myCol = entryColIndex.get(entry.id) || 0;

    // Math for width and left
    const widthPct = 100 / totalCols;
    const leftPct = myCol * widthPct;

    // Calculate Height based on duration
    const rowHeight = 120;
    const gap = 12; // gap-3
    const totalHeight = (entry.durationInSlots * rowHeight) + ((entry.durationInSlots - 1) * gap);

    layoutMap.set(entry.id, {
      width: `calc(${widthPct}% - 4px)`, // -4px for gap
      left: `calc(${leftPct}% + 2px)`,
      height: `${totalHeight - 4}px`, // -4px for spacing
      position: 'absolute',
      top: '2px',
      zIndex: 10 + myCol, // Visual stacking
    });
  });

  return layoutMap;
};

export const TimetableGrid: React.FC<Props> = ({
  schedule,
  rooms,
  batches,
  filterBatchId,
  filterFacultyId,
  selectedFaculty,
  onDrop,
  onDragOver,
  onDragStart,
  onToggleLock,
  readOnly = false
}) => {

  // Helper to check filter match
  const isEntryVisible = (s: ScheduleEntry) => {
    if (filterFacultyId && s.facultyId !== filterFacultyId) return false;

    if (filterBatchId) {
      if (s.batchId === filterBatchId) return true;
      // Check Composite Batch
      if (batches) {
        const composite = batches.find(b => b.id === s.batchId);
        if (composite?.includesBatchIds?.includes(filterBatchId)) return true;
      }
      return false;
    }

    return true;
  };

  // Pre-calculate layout styles for all items
  const layoutStyles = useMemo(() => {
    const map = new Map<string, React.CSSProperties>();

    DAYS.forEach(day => {
      const dayEntries = schedule.filter(s => {
        if (s.day !== day) return false;
        return isEntryVisible(s);
      });

      const dayMap = calculateDayLayout(dayEntries);
      dayMap.forEach((style, id) => map.set(id, style));
    });

    return map;
  }, [schedule, filterBatchId, filterFacultyId, batches]);

  // Helper to check occupancy for drop targets (rendering 'Add Class' placeholder)
  const getActiveEntries = (day: DayOfWeek, timeId: number) => {
    return schedule.filter(s => {
      const isDayMatch = s.day === day;
      const start = s.timeSlotId;
      const end = s.timeSlotId + s.durationInSlots;
      const isTimeMatch = timeId >= start && timeId < end;
      if (!isDayMatch || !isTimeMatch) return false;
      return isEntryVisible(s);
    });
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50 relative h-full">
      <div className="min-w-[1200px] p-6 pb-32">

        {/* Header: Days */}
        <div className="grid grid-cols-[80px_repeat(6,1fr)] gap-3 mb-3 sticky top-0 z-30 bg-gray-50/95 backdrop-blur py-2">
          <div className="font-bold text-gray-400 text-xs flex items-center justify-center uppercase tracking-widest">
            Time
          </div>
          {DAYS.map(day => (
            <div key={day} className="font-bold text-gray-700 text-center text-sm bg-white rounded-lg py-3 shadow-sm border-b-2 border-gray-100 uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Body: Time Slots (Rows) */}
        {TIME_SLOTS.map((ts, index) => (
          <div
            key={ts.id}
            className="grid grid-cols-[80px_repeat(6,1fr)] gap-3 mb-3 relative"
            // High Z-Index for earlier rows so they overlap later rows
            style={{ zIndex: TIME_SLOTS.length - index }}
          >
            {/* Time Label */}
            <div className="flex flex-col items-center justify-start pt-4 font-medium text-gray-400 text-xs text-center h-[120px]">
              <span>{ts.startTime}</span>
              <div className="h-full w-px bg-gray-200 my-2"></div>
            </div>

            {/* Cells for each Day */}
            {DAYS.map(day => {
              const activeEntries = getActiveEntries(day, ts.id);
              // Only render items that START here
              const startEntries = activeEntries.filter(e => e.timeSlotId === ts.id);

              // We use the first active entry's room as a default hint for dropping
              const cellRoomId = activeEntries[0]?.roomId || '';

              // Check VF Availability for this slot
              const dayKey = day.substring(0, 3).toLowerCase();
              const isVFAvailable = selectedFaculty?.isVisitingFaculty &&
                selectedFaculty.availability?.[dayKey]?.[index] === 1;

              let cellClasses = "h-[120px] rounded-xl transition-all relative flex group/cell ";
              if (activeEntries.length > 0) {
                cellClasses += 'bg-white shadow-sm ring-1 ring-black/5 ';
                if (isVFAvailable) {
                  cellClasses += 'border-2 border-amber-400 bg-amber-50/10 ';
                } else {
                  cellClasses += 'border border-gray-100 ';
                }
              } else {
                if (isVFAvailable) {
                  cellClasses += 'bg-amber-50/40 border-2 border-amber-400 border-dashed ';
                } else {
                  cellClasses += 'bg-white/40 border border-gray-200/50 hover:bg-blue-50/50 border-dashed ';
                }
              }

              return (
                <div
                  key={`${day}-${ts.id}`}
                  onDragOver={readOnly ? undefined : onDragOver}
                  onDrop={readOnly ? undefined : (e) => onDrop(e, day, ts.id, cellRoomId)}
                  className={cellClasses}
                >
                  {/* Drop Target Indicator */}
                  {!readOnly && activeEntries.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 pointer-events-none transition-opacity">
                      <span className="text-[10px] uppercase tracking-wider text-blue-400 font-semibold bg-blue-50 px-2 py-1 rounded">Add Class</span>
                    </div>
                  )}

                  {/* Available Hint (for VF) */}
                  {isVFAvailable && activeEntries.length === 0 && (
                    <div className="absolute top-2 right-2 opacity-50 pointer-events-none">
                      <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                    </div>
                  )}

                  {/* Render entries using pre-calculated layout */}
                  {startEntries.map((entry) => {
                    const assignedRoom = rooms.find(r => r.id === entry.roomId);
                    const style = layoutStyles.get(entry.id);

                    if (!style) return null;

                    return <DraggableSlot
                      key={entry.id}
                      entry={entry}
                      onDragStart={readOnly ? undefined : onDragStart}
                      onToggleLock={readOnly ? undefined : onToggleLock}
                      style={style}
                      // @ts-ignore
                      courseCode={entry.code}
                      // @ts-ignore
                      facultyName={entry.facultyName}
                      // @ts-ignore
                      batchName={entry.batchName}
                      roomName={assignedRoom ? assignedRoom.name : 'No Room'}
                      isReadOnly={readOnly}
                    />;
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};