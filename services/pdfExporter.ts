import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ScheduleEntry, TimeSlot, DayOfWeek, Course, Faculty, Room, StudentBatch, SessionType } from '../types';
import { TIME_SLOTS, DAYS } from '../constants';

interface ExportContext {
  schedule: ScheduleEntry[];
  courses: Course[];
  faculty: Faculty[];
  rooms: Room[];
  batches: StudentBatch[];
  title: string;
  subTitle?: string;
  isFacultyView: boolean;
}

const getFacultyInitials = (name: string): string => {
    // Remove titles
    const clean = name.replace(/^(Prof\.|Dr\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim();
    const parts = clean.split(/\s+/);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].substring(0, 3).toUpperCase();
    
    // First char of first name + First 2 chars of last name
    const first = parts[0][0];
    const last = parts[parts.length - 1];
    const lastPart = last.length >= 2 ? last.substring(0, 2) : (last + 'X').substring(0, 2);
    
    return (first + lastPart).toUpperCase();
};

export const exportScheduleToPDF = (ctx: ExportContext) => {
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const dateStr = new Date().toLocaleString();

    // --- 1. Compact Header ---
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("SVKM's NMIMS", pageWidth / 2, 7, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text("Mukesh Patel School of Technology Management & Engineering", pageWidth / 2, 12, { align: 'center' });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text("(Mumbai Campus) A.Y 2025-26", pageWidth / 2, 16, { align: 'center' });

    // Meta Info Line
    doc.setFontSize(8);
    doc.setLineWidth(0.1);
    doc.line(10, 19, pageWidth - 10, 19);
    
    const leftText = `Program: ${ctx.title}`; 
    const centerText = ctx.subTitle || "Sem: IX  Div: B"; 
    const rightText = `W.e.f: ${new Date().toLocaleDateString()}`;

    doc.text(leftText, 10, 23);
    doc.text(centerText, pageWidth / 2, 23, { align: 'center' });
    doc.text(rightText, pageWidth - 10, 23, { align: 'right' });
    
    doc.line(10, 25, pageWidth - 10, 25);

    // --- 2. Main Timetable Data Prep ---

    const rowSpans = new Array(DAYS.length).fill(0);
    const head = [['Time/Day', ...DAYS]];
    const body: any[] = [];

    const usedFaculty = new Set<string>();
    const usedCourses = new Set<string>();

    TIME_SLOTS.forEach((slot) => {
        const row: any[] = [];
        
        // Col 0: Time
        row.push({ 
            content: `${slot.startTime}\n-\n${slot.endTime}`, 
            styles: { valign: 'middle', halign: 'center', fontStyle: 'bold' } 
        });

        // Col 1..N: Days
        DAYS.forEach((day, dayIndex) => {
            if (rowSpans[dayIndex] > 0) {
                rowSpans[dayIndex]--;
                return; 
            }

            const entry = ctx.schedule.find(s => s.day === day && s.timeSlotId === slot.id);

            if (entry) {
                const span = entry.durationInSlots > 1 ? entry.durationInSlots : 1;
                rowSpans[dayIndex] = span - 1;

                const course = ctx.courses.find(c => c.id === entry.courseId);
                const faculty = ctx.faculty.find(f => f.id === entry.facultyId);
                const room = ctx.rooms.find(r => r.id === entry.roomId);
                const batch = ctx.batches.find(b => b.id === entry.batchId);

                if (entry.facultyId) usedFaculty.add(entry.facultyId);
                if (entry.courseId) usedCourses.add(entry.courseId);

                const courseCode = course?.code || entry.courseId;
                const courseDisplay = courseCode.length > 8 ? courseCode.substring(0,8)+'..' : courseCode;
                
                const facInitials = faculty ? getFacultyInitials(faculty.name) : 'TBA';
                const roomName = room ? room.name : '';
                const batchSuffix = entry.subBatch ? entry.subBatch : (batch?.division || '');
                const batchDisplay = batchSuffix.length > 5 ? batchSuffix.substring(0,5) : batchSuffix;

                const text = [
                    courseDisplay,
                    `[${facInitials}]`,
                    roomName,
                    batchDisplay
                ].filter(Boolean).join('\n');

                const isLab = entry.type === SessionType.LAB;
                const isOE = entry.isOE;
                
                row.push({
                    content: text,
                    rowSpan: span,
                    styles: { 
                        halign: 'center', 
                        valign: 'middle',
                        fillColor: isLab ? [235, 235, 235] : isOE ? [240, 248, 255] : [255, 255, 255],
                        textColor: isOE ? [0, 80, 0] : [0, 0, 0] 
                    }
                });
            } else {
                row.push({ content: '', styles: { fillColor: [255, 255, 255] } });
            }
        });

        body.push(row);
    });

    // --- 3. Render Main Table ---
    // @ts-ignore
    autoTable(doc, {
        startY: 27,
        head: head,
        body: body,
        theme: 'plain',
        styles: {
            fontSize: 7, // Compact font
            cellPadding: 0.5,
            lineWidth: 0.1,
            lineColor: [0, 0, 0],
            textColor: [0, 0, 0],
            font: 'helvetica',
            valign: 'middle'
        },
        headStyles: {
            fillColor: [255, 255, 255],
            textColor: [0, 0, 0],
            fontStyle: 'bold',
            lineWidth: 0.1,
            lineColor: [0, 0, 0],
            halign: 'center'
        },
        columnStyles: {
            0: { cellWidth: 16 } // Compact time column
        },
        // IMPORTANT: Reduced margins allow content to fit on Page 1
        margin: { top: 27, bottom: 10, left: 10, right: 10 } 
    });

    // --- 4. Legend Table ---
    // @ts-ignore
    const finalY = doc.lastAutoTable.finalY || 150;
    
    // Determine how to render legend based on remaining space
    const remainingHeight = pageHeight - finalY - 10;
    
    const facultyArr = Array.from(usedFaculty).map(id => ctx.faculty.find(f => f.id === id)).filter(Boolean) as Faculty[];
    const courseArr = Array.from(usedCourses).map(id => ctx.courses.find(c => c.id === id)).filter(Boolean) as Course[];
    const maxRows = Math.max(facultyArr.length, courseArr.length);

    // If lots of rows, use 2-column layout for Legend to save vertical space
    const useMultiCol = maxRows > 8 && remainingHeight < (maxRows * 5); 

    const legendBody: any[] = [];
    
    if (useMultiCol) {
        // Split into 2 chunks
        const half = Math.ceil(maxRows / 2);
        for(let i=0; i<half; i++) {
            const f1 = facultyArr[i]; const c1 = courseArr[i];
            const f2 = facultyArr[i+half]; const c2 = courseArr[i+half];
            
            legendBody.push([
                f1 ? getFacultyInitials(f1.name) : '', f1 ? f1.name : '', c1 ? c1.code : '', c1 ? c1.name : '',
                '|', // Divider visual
                f2 ? getFacultyInitials(f2.name) : '', f2 ? f2.name : '', c2 ? c2.code : '', c2 ? c2.name : '',
            ]);
        }
    } else {
        for (let i = 0; i < maxRows; i++) {
            const fac = facultyArr[i];
            const course = courseArr[i];
            legendBody.push([
                fac ? getFacultyInitials(fac.name) : '',
                fac ? fac.name : '',
                course ? course.code : '',
                course ? course.name : ''
            ]);
        }
    }

    doc.setFontSize(8);
    doc.text("Legend / Details:", 10, finalY + 5);

    const legendHeaders = useMultiCol 
        ? [['Init', 'Faculty', 'Code', 'Subject', '', 'Init', 'Faculty', 'Code', 'Subject']]
        : [['Initial', 'Faculty Name', 'Subject Code', 'Subject Name']];

    // @ts-ignore
    autoTable(doc, {
        startY: finalY + 6,
        head: legendHeaders,
        body: legendBody,
        theme: 'plain',
        styles: {
            fontSize: 6,
            cellPadding: 0.5,
            lineWidth: 0.1,
            lineColor: [0, 0, 0],
            valign: 'middle',
            overflow: 'ellipsize'
        },
        headStyles: {
            fontStyle: 'bold',
            fillColor: [240, 240, 240]
        },
        columnStyles: useMultiCol ? { 4: { cellWidth: 2, fillColor: [0,0,0] } } : {}, // Divider column style
        margin: { left: 10, right: 10, bottom: 5 }
    });

    // --- 5. Footer Info ---
    const bottomY = pageHeight - 4;
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text(`Generated by University Smart Scheduler on ${dateStr}`, 10, bottomY);
    doc.text("Page 1 of 1", pageWidth - 10, bottomY, { align: 'right' });

    const safeTitle = ctx.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${safeTitle}_formatted.pdf`);
};
