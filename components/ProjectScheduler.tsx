

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
    ScheduleEntry,
    DayOfWeek,
    StudentBatch,
    Faculty,
    Course,
    Room,
    Department,
    ProjectData,
    SavedVersion,
    EnrichedScheduleEntry,
    HistorySnapshot,
    SchedulingConstraints
} from '../types';
import { Sidebar } from './Sidebar';
import { TimetableGrid } from './TimetableGrid';
import { ConstraintsToast, ToastType } from './ConstraintsToast';
import { RoomConfigModal } from './RoomConfigModal';
import { CreateSessionModal, SessionFormData } from './CreateSessionModal';
import { validateMove, findAvailableRoom, generateSchedule } from '../services/schedulerEngine';
import { processExcelFile } from '../services/excelImporter';
import { exportScheduleToPDF } from '../services/pdfExporter';
import {
    getProjectData,
    saveProjectData,
    getVersions,
    restoreVersion,
    getProjectHistory,
    saveProjectHistory,
    getGlobalConstraints,
    bulkSaveToSupabase,
    getAllProjectSchedules,
    GlobalCollisionEntry,
    getProjectMeta
} from '../services/db';
import { Users, Briefcase, FileDown, Upload, Loader, PlayCircle, Settings, ArrowLeft, Undo, Redo } from 'lucide-react';
import { DEFAULT_CONSTRAINTS } from '../constants';
import { useAuth } from '../src/contexts/AuthContext';

export const ProjectScheduler: React.FC = () => {
    const { id: projectId } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const { profile } = useAuth();
    const [isReadOnlyUser, setIsReadOnlyUser] = useState(true);

    // State
    const [schedule, setSchedule] = useState<ScheduleEntry[]>([]);
    const [unassigned, setUnassigned] = useState<Partial<ScheduleEntry>[]>([]);
    const [facultyList, setFacultyList] = useState<Faculty[]>([]);
    const [batchList, setBatchList] = useState<StudentBatch[]>([]);
    const [courseList, setCourseList] = useState<Course[]>([]);
    const [departmentList, setDepartmentList] = useState<Department[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [globalSchedule, setGlobalSchedule] = useState<GlobalCollisionEntry[]>([]);

    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
    const [loading, setLoading] = useState(false);
    const [generating, setGenerating] = useState(false);

    const [selectedBatch, setSelectedBatch] = useState<string>('');
    const [selectedFaculty, setSelectedFaculty] = useState<string>('');

    const [isRoomConfigOpen, setIsRoomConfigOpen] = useState(false);
    const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);

    // Version Control State
    const [versions, setVersions] = useState<SavedVersion[]>([]);

    // Constraints
    const [constraints, setConstraints] = useState<SchedulingConstraints>(DEFAULT_CONSTRAINTS);

    // --- Undo/Redo State (Project Persistent) ---
    const [history, setHistory] = useState<HistorySnapshot[]>(() => {
        if (!projectId) return [];
        return getProjectHistory(projectId).history;
    });
    const [future, setFuture] = useState<HistorySnapshot[]>(() => {
        if (!projectId) return [];
        return getProjectHistory(projectId).future;
    });

    const fileInputRef = useRef<HTMLInputElement>(null);
    const workerRef = useRef<Worker | null>(null);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        setToast({ message, type });
    }, []);

    // Save history changes to persistence
    useEffect(() => {
        if (projectId) {
            saveProjectHistory(projectId, { history, future });
        }
    }, [history, future, projectId]);

    // --- UNDO / REDO HELPERS ---

    const saveToHistory = useCallback((currSchedule: ScheduleEntry[], currUnassigned: Partial<ScheduleEntry>[]) => {
        const snapshot: HistorySnapshot = { schedule: currSchedule, unassigned: currUnassigned };

        setHistory(prev => {
            const newStack = [...prev, snapshot];
            if (newStack.length > 50) return newStack.slice(1); // Limit stack size in memory
            return newStack;
        });

        // Clear future on new action
        setFuture([]);
    }, []);

    const handleUndo = useCallback(() => {
        if (history.length === 0) {
            showToast("Nothing to undo", 'info');
            return;
        }

        const previous = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        // Save current state to Future
        setFuture(prev => [{ schedule, unassigned }, ...prev]);

        // Restore
        setSchedule(previous.schedule);
        setUnassigned(previous.unassigned);

        setHistory(newHistory);
        showToast("Undid last action", "info");
    }, [history, schedule, unassigned, showToast]);

    const handleRedo = useCallback(() => {
        if (future.length === 0) {
            showToast("Nothing to redo", 'info');
            return;
        }

        const next = future[0];
        const newFuture = future.slice(1);

        // Save current to History
        setHistory(prev => [...prev, { schedule, unassigned }]);

        // Restore
        setSchedule(next.schedule);
        setUnassigned(next.unassigned);

        setFuture(newFuture);
        showToast("Redid action", "info");
    }, [future, schedule, unassigned, showToast]);

    const canUndo = history.length > 0;
    const canRedo = future.length > 0;

    // Keyboard Shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    handleRedo();
                } else {
                    handleUndo();
                }
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);


    const handleSchedulerResult = useCallback((type: 'SUCCESS' | 'ERROR', payload: any) => {
        if (type === 'SUCCESS') {
            saveToHistory(schedule, unassigned); // Save state before applying
            setSchedule(payload.schedule);
            setUnassigned(payload.unassigned);
            setGenerating(false);
            if (payload.unassigned.length > 0) {
                showToast(`Scheduled ${payload.schedule.length} items. ${payload.unassigned.length} items remain.`, 'warning');
            } else {
                showToast(`Successfully scheduled all items!`, 'success');
            }
        } else {
            setGenerating(false);
            showToast("Error during auto-scheduling.", 'error');
            console.error(payload);
        }
    }, [showToast, saveToHistory, schedule, unassigned]);

    // --- Initialize ---
    useEffect(() => {
        // Load Constraints
        setConstraints(getGlobalConstraints());

        try {
            // @ts-ignore
            const metaUrl = import.meta?.url;
            if (metaUrl) {
                const workerUrl = new URL('../services/scheduler.worker.ts', metaUrl);
                workerRef.current = new Worker(workerUrl, { type: 'module' });
                workerRef.current.onmessage = (e) => handleSchedulerResult(e.data.type, e.data.payload);
                workerRef.current.onerror = (e) => {
                    console.warn("Worker error:", e);
                    setGenerating(false);
                    showToast("Auto-scheduler worker failed.", 'error');
                    workerRef.current = null;
                };
            } else {
                workerRef.current = null;
            }
        } catch (e) {
            workerRef.current = null;
        }
        return () => { workerRef.current?.terminate(); };
    }, [handleSchedulerResult, showToast]);

    useEffect(() => {
        const load = async () => {
            if (projectId) {
                const [data, globalData, meta] = await Promise.all([
                    getProjectData(projectId),
                    getAllProjectSchedules(),
                    getProjectMeta(projectId)
                ]);

                if (meta && profile) {
                    const isSuperAdmin = profile.role === 'super_admin';
                    const isDeptAdmin = profile.role === 'department_admin';
                    if (isSuperAdmin || (isDeptAdmin && profile.department_id === meta.departmentId)) {
                        setIsReadOnlyUser(false);
                    } else {
                        setIsReadOnlyUser(true);
                    }
                }

                if (data) {
                    loadProjectData(data);
                    setVersions(getVersions(projectId));
                }

                // Filter out current project from global schedules
                const otherProjectsSchedules = globalData.filter(g => g.projectId !== projectId);
                setGlobalSchedule(otherProjectsSchedules);
            }
        };
        load();
    }, [projectId]);

    // --- URL Param Handling ---
    useEffect(() => {
        const facultyId = searchParams.get('faculty');
        if (facultyId && facultyList.some(f => f.id === facultyId)) {
            setSelectedFaculty(facultyId);
            setSelectedBatch(''); // Clear batch to show faculty view
        }
    }, [searchParams, facultyList]);

    const loadProjectData = (data: ProjectData) => {
        setSchedule(data.schedule);
        setUnassigned(data.unassigned);
        setFacultyList(data.faculty);
        setBatchList(data.batches);
        setCourseList(data.courses);
        setDepartmentList(data.departments);
        setRooms(data.rooms);

        // Always reset selection to first batch after any data load / re-import
        // so we don't hold onto stale UUIDs from a previous upload
        if (!searchParams.get('faculty')) {
            setSelectedFaculty('');
            setSelectedBatch(data.batches[0]?.id ?? '');
        }
    };

    // --- Persist Changes ---
    const persist = useCallback(async () => {
        if (!projectId) return;
        const data: ProjectData = {
            schedule, unassigned, faculty: facultyList, batches: batchList, courses: courseList, departments: departmentList, rooms
        };
        try {
            await saveProjectData(projectId, data);
        } catch (e) {
            console.error("Failed to sync with Supabase:", e);
        }
    }, [projectId, schedule, unassigned, facultyList, batchList, courseList, departmentList, rooms]);

    useEffect(() => {
        if (projectId && (schedule.length > 0 || unassigned.length > 0 || rooms.length > 0)) {
            persist();
        }
    }, [schedule, unassigned, rooms, persist]);

    // --- Pin / Lock Toggle ---
    const handleToggleLock = useCallback((id: string) => {
        const idx = schedule.findIndex(s => s.id === id);
        if (idx !== -1) {
            saveToHistory(schedule, unassigned);
            const newSchedule = [...schedule];
            newSchedule[idx] = { ...newSchedule[idx], isLocked: !newSchedule[idx].isLocked };
            setSchedule(newSchedule);
        }
    }, [schedule, unassigned, saveToHistory]);

    // --- Helper: Batch Relevance ---
    const isRelevantBatch = useCallback((sessionBatchId: string, filterId: string) => {
        if (!sessionBatchId) return false;
        if (sessionBatchId === filterId) return true;
        const sessionBatch = batchList.find(b => b.id === sessionBatchId);
        if (sessionBatch?.includesBatchIds?.includes(filterId)) return true;
        return false;
    }, [batchList]);

    // --- Import Handler ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !projectId) return;

        setLoading(true);
        try {
            const data = await processExcelFile(file);
            await bulkSaveToSupabase(projectId, data); // Push directly to Postgres to resolve foreign keys

            // Reload the newly assembled project from Supabase instead of memory
            // This ensures we have the correct Postgres UUIDs for new entities.
            const refreshedData = await getProjectData(projectId);
            if (refreshedData) {
                saveToHistory(schedule, unassigned);
                loadProjectData(refreshedData);
                showToast(`Successfully imported sessions.`, 'success');
            }
        } catch (err: any) {
            console.error("EXCEL IMPORT ERROR:", err);
            showToast(`Failed to parse or save Excel: ${err?.message || 'Unknown error'}`, 'error');
        } finally {
            setLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // --- Create Custom Session Handler ---
    const handleCreateSession = (data: SessionFormData) => {
        if (!selectedBatch) {
            showToast("No batch selected", "error");
            return;
        }

        saveToHistory(schedule, unassigned);

        // 1. Handle Faculty
        let finalFacultyId = data.facultyId;
        if (!finalFacultyId && data.facultyName) {
            const existing = facultyList.find(f => f.name.toLowerCase() === data.facultyName.toLowerCase());
            if (existing) {
                finalFacultyId = existing.id;
            } else {
                finalFacultyId = crypto.randomUUID();
                const newFac: Faculty = {
                    id: finalFacultyId,
                    name: data.facultyName,
                    departmentId: 'dept_gen',
                    isVisitingFaculty: false
                };
                setFacultyList(prev => [...prev, newFac]);
            }
        }

        // 2. Handle Room
        let finalRoomId = data.roomId;
        if (finalRoomId === 'auto') {
            finalRoomId = null; // Auto assignment
        } else if (!finalRoomId && data.roomName) {
            const existing = rooms.find(r => r.name.toLowerCase() === data.roomName.toLowerCase());
            if (existing) {
                finalRoomId = existing.id;
            } else {
                finalRoomId = crypto.randomUUID();
                const newRoom: Room = {
                    id: finalRoomId,
                    name: data.roomName,
                    floor: 1, capacity: 60, type: 'Lecture', category: 'Theory'
                };
                setRooms(prev => [...prev, newRoom]);
            }
        }

        // 3. Handle Course
        let finalCourseId = data.courseId;
        if (!finalCourseId && data.courseName) {
            const existing = courseList.find(c => c.name.toLowerCase() === data.courseName.toLowerCase());
            if (existing) {
                finalCourseId = existing.id;
            } else {
                finalCourseId = crypto.randomUUID();
                const newCourse: Course = {
                    id: finalCourseId,
                    name: data.courseName,
                    code: data.courseName.substring(0, 6).toUpperCase(),
                    departmentId: 'dept_gen'
                };
                setCourseList(prev => [...prev, newCourse]);
            }
        }

        // 4. Handle Batch (Auto-detected from context)
        const finalBatchId = selectedBatch;

        if (finalCourseId && finalFacultyId && finalBatchId) {
            const newSession: Partial<ScheduleEntry> = {
                id: crypto.randomUUID(),
                courseId: finalCourseId,
                facultyId: finalFacultyId,
                batchId: finalBatchId,
                roomId: finalRoomId || undefined,
                type: data.type,
                durationInSlots: data.duration,
            };
            setUnassigned(prev => [...prev, newSession]);
            showToast("Custom lecture created!", "success");
        } else {
            showToast("Failed to create session. Missing data.", "error");
        }
    };

    // --- Export PDF Handler ---
    const handleExportPDF = () => {
        if (schedule.length === 0) {
            showToast("No schedule to export.", 'error');
            return;
        }

        let filteredSchedule = schedule;
        let title = "Full University Schedule";
        let subTitle = "All Departments";
        const isFacultyView = !!selectedFaculty;

        if (selectedFaculty) {
            filteredSchedule = schedule.filter(s => s.facultyId === selectedFaculty);
            const fName = facultyList.find(f => f.id === selectedFaculty)?.name || 'Faculty';
            title = `Faculty Schedule: ${fName}`;
            subTitle = "Individual Faculty Timetable";
        } else if (selectedBatch) {
            filteredSchedule = schedule.filter(s => {
                if (s.batchId === selectedBatch) return true;
                const compBatch = batchList.find(b => b.id === s.batchId);
                if (compBatch?.includesBatchIds?.includes(selectedBatch)) return true;
                return false;
            });
            const bName = batchList.find(b => b.id === selectedBatch)?.name || 'Batch';
            title = `Class Schedule: ${bName}`;
            subTitle = "Student Timetable";
        }

        if (filteredSchedule.length === 0) {
            showToast("Current view is empty. Nothing to export.", 'warning');
            return;
        }

        exportScheduleToPDF({
            schedule: filteredSchedule, courses: courseList, faculty: facultyList, rooms: rooms, batches: batchList, title, subTitle, isFacultyView
        });
    };

    // --- Auto Schedule Handler ---
    const handleAutoSchedule = () => {
        setGenerating(true);
        if (workerRef.current) {
            workerRef.current.postMessage({
                unassigned,
                currentSchedule: schedule,
                faculty: facultyList,
                batches: batchList,
                rooms,
                courses: courseList,
                departments: departmentList,
                constraints: constraints, // Pass user config
                globalSchedule // Protect auto-scheduler against cross-project collisions
            });
        } else {
            setTimeout(() => {
                try {
                    const result = generateSchedule(unassigned, schedule, facultyList, batchList, rooms, courseList, departmentList, constraints, globalSchedule);
                    handleSchedulerResult('SUCCESS', result);
                } catch (e) {
                    handleSchedulerResult('ERROR', e);
                }
            }, 100);
        }
    };

    const handleDragStart = (e: React.DragEvent, id: string) => {
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleSidebarDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;

        const fromGrid = schedule.find(s => s.id === id);
        if (fromGrid) {
            if (fromGrid.isLocked) {
                showToast("Cannot move locked item", "error");
                return;
            }

            const siblings = schedule.filter(s =>
                s.id !== id && s.facultyId === fromGrid.facultyId && s.day === fromGrid.day && s.timeSlotId === fromGrid.timeSlotId && s.roomId === fromGrid.roomId
            );

            saveToHistory(schedule, unassigned);

            const toRemoveIds = [fromGrid.id, ...siblings.map(s => s.id)];
            setSchedule(prev => prev.filter(s => !toRemoveIds.includes(s.id)));

            const recycled = [fromGrid, ...siblings].map(s => {
                const { roomId, timeSlotId, day, isLocked, ...rest } = s;
                return { ...rest, isLocked: false };
            });

            setUnassigned(prev => {
                // Dedupe just in case
                const existingIds = new Set(prev.map(p => p.id));
                const uniqueRecycled = recycled.filter(r => !existingIds.has(r.id));
                return [...prev, ...uniqueRecycled];
            });
            showToast("Session unassigned.", 'info');
        }
    };

    const handleGridDrop = (e: React.DragEvent, day: DayOfWeek, timeSlotId: number, targetRoomId: string) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;

        const fromSidebar = unassigned.find(u => u.id === id);
        const fromGrid = schedule.find(s => s.id === id);
        const entryToMove = fromSidebar || fromGrid;
        if (!entryToMove) return;

        let siblings: ScheduleEntry[] = [];
        if (fromGrid) {
            if (fromGrid.isLocked) {
                showToast("Cannot move locked item", "error");
                return;
            }
            siblings = schedule.filter(s =>
                s.id !== id && s.facultyId === fromGrid.facultyId && s.day === fromGrid.day && s.timeSlotId === fromGrid.timeSlotId && s.roomId === fromGrid.roomId
            );
        }
        const entriesToMove = [entryToMove, ...siblings];

        let finalRoomId = targetRoomId;

        // Check if the suggested targetRoomId is actually occupied by a different session
        // If so, ignore it and find a new room to allow parallel scheduling
        if (finalRoomId) {
            const isTargetOccupied = schedule.some(s =>
                s.day === day &&
                s.timeSlotId === timeSlotId &&
                s.roomId === finalRoomId &&
                !entriesToMove.some(e => e.id === s.id)
            );

            if (isTargetOccupied) {
                finalRoomId = ''; // Reset to force search
            }
        }

        if (!finalRoomId) {
            const tempScheduleForRoomCheck = schedule.filter(s => !entriesToMove.map(x => x.id).includes(s.id));
            const foundRoom = findAvailableRoom(
                entryToMove, day, timeSlotId, tempScheduleForRoomCheck, rooms, batchList, departmentList, globalSchedule
            );
            if (!foundRoom) {
                showToast("No available room found.", 'error');
                return;
            }
            finalRoomId = foundRoom.id;
        }

        for (const entry of entriesToMove) {
            const proposedEntry: ScheduleEntry = {
                ...entry, day, timeSlotId, roomId: finalRoomId,
                courseId: entry.courseId!, facultyId: entry.facultyId!, batchId: entry.batchId!, type: entry.type!, durationInSlots: entry.durationInSlots!
            } as ScheduleEntry;

            const batchTotalHours = [...schedule, ...unassigned]
                .filter(s => s.batchId === proposedEntry.batchId)
                .reduce((sum, s) => sum + (s.durationInSlots || 1), 0);

            const validationSchedule = schedule.filter(s => !entriesToMove.map(x => x.id).includes(s.id));

            // Use Global Constraints and Global Schedule Space
            const validation = validateMove(proposedEntry, validationSchedule, facultyList, batchList, batchTotalHours, false, constraints, globalSchedule);

            if (!validation.valid) {
                showToast(validation.message || 'Conflict', 'error');
                return;
            }
        }

        saveToHistory(schedule, unassigned);

        if (fromSidebar) {
            setUnassigned(prev => prev.filter(u => u.id !== id));
            const newEntry = {
                ...entryToMove, day, timeSlotId, roomId: finalRoomId,
                courseId: entryToMove.courseId!, facultyId: entryToMove.facultyId!, batchId: entryToMove.batchId!, type: entryToMove.type!, durationInSlots: entryToMove.durationInSlots!, isLocked: false
            } as ScheduleEntry;
            setSchedule(prev => [...prev, newEntry]);
            showToast("Class assigned.", 'success');
        } else {
            const movingIds = entriesToMove.map(x => x.id);
            setSchedule(prev => prev.map(s => {
                if (movingIds.includes(s.id)) return { ...s, day, timeSlotId, roomId: finalRoomId };
                return s;
            }));
        }
    };

    const getCombinedBatchNames = useCallback((batchId: string): string[] => {
        const b = batchList.find(x => x.id === batchId);
        if (b && b.includesBatchIds && b.includesBatchIds.length > 0) {
            return b.includesBatchIds
                .map(id => batchList.find(sub => sub.id === id)?.name || '')
                .filter(n => n !== '');
        }
        return [];
    }, [batchList]);

    const sidebarItems: EnrichedScheduleEntry[] = unassigned
        .filter(u => {
            if (selectedFaculty) return u.facultyId === selectedFaculty;
            if (selectedBatch) return isRelevantBatch(u.batchId!, selectedBatch);
            return true;
        })
        .map(u => ({
            ...u,
            id: u.id!,
            _courseName: courseList.find(c => c.id === u.courseId)?.name,
            _facultyName: facultyList.find(f => f.id === u.facultyId)?.name,
            _batchName: batchList.find(b => b.id === u.batchId)?.name,
            _combinedBatchNames: getCombinedBatchNames(u.batchId!)
        }));

    const selectedFacultyObj = facultyList.find(f => f.id === selectedFaculty);
    const selectedBatchObj = batchList.find(b => b.id === selectedBatch);

    return (
        <div className="flex flex-col h-screen bg-gray-50 font-sans text-gray-900 overflow-hidden">
            <input type="file" accept=".xlsx, .xls" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />

            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-20 shrink-0">
                <div className="flex items-center gap-3">
                    <Link to="/" className="p-2 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-900"><ArrowLeft size={20} /></Link>
                    <h1 className="text-xl font-bold tracking-tight text-gray-800 hidden md:block">Workspace</h1>
                    {!isReadOnlyUser && (
                        <div className="flex items-center gap-1 ml-4 border-l border-gray-200 pl-4">
                            <button
                                onClick={handleUndo}
                                disabled={!canUndo}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Undo last action"
                            >
                                <Undo size={18} />
                            </button>
                            <button
                                onClick={handleRedo}
                                disabled={!canRedo}
                                className="p-2 text-gray-500 hover:bg-gray-100 rounded-full disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Redo last action"
                            >
                                <Redo size={18} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-md">
                        <button onClick={() => { setSelectedBatch(batchList[0]?.id || ''); setSelectedFaculty(''); }} className={`px-3 py-1 text-sm rounded transition-all ${selectedBatch ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Student View</button>
                        <button onClick={() => { setSelectedFaculty(facultyList[0]?.id || ''); setSelectedBatch(''); }} className={`px-3 py-1 text-sm rounded transition-all ${selectedFaculty ? 'bg-white shadow text-blue-600 font-medium' : 'text-gray-500 hover:text-gray-700'}`}>Faculty View</button>
                    </div>
                    <div className="h-6 w-px bg-gray-300 mx-2"></div>

                    {!isReadOnlyUser && <button onClick={() => setIsRoomConfigOpen(true)} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors p-2 rounded hover:bg-gray-100"><Settings size={18} /></button>}
                    <div className="flex gap-2">
                        <button onClick={handleExportPDF} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-red-600 transition-colors p-2 rounded hover:bg-gray-100"><FileDown size={16} /></button>
                        {!isReadOnlyUser && <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors p-2 rounded hover:bg-gray-100">{loading ? <Loader className="animate-spin" size={16} /> : <Upload size={16} />}</button>}
                    </div>
                    {/* Reset button removed */}
                    {!isReadOnlyUser && <button onClick={handleAutoSchedule} disabled={unassigned.length === 0 || generating} className={`flex items-center gap-2 text-sm font-medium text-white px-4 py-2 rounded shadow transition-colors ${unassigned.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>{generating ? <Loader className="animate-spin" size={16} /> : <PlayCircle size={16} />} Auto</button>}
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {!isReadOnlyUser && (
                    <Sidebar
                        unassigned={sidebarItems}
                        onDragStart={handleDragStart}
                        onDrop={handleSidebarDrop}
                        onAddSession={() => setIsCreateSessionOpen(true)}
                    />
                )}
                <main className="flex-1 flex flex-col min-w-0 bg-gray-100/50">
                    <div className="px-6 py-4 flex items-center justify-between shrink-0">
                        <div className="flex items-center gap-4">
                            {selectedBatch && (
                                <div className="flex items-center gap-2 text-gray-700 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm">
                                    <Users size={16} className="text-blue-500" />
                                    <select className="bg-transparent border-none outline-none text-sm font-medium cursor-pointer max-w-[200px]" value={selectedBatch} onChange={(e) => { setSelectedBatch(e.target.value); setSelectedFaculty(''); }}>
                                        {batchList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                    </select>
                                </div>
                            )}
                            {selectedFaculty && (
                                <div className="flex items-center gap-2 text-gray-700 bg-white px-3 py-1.5 rounded border border-gray-200 shadow-sm">
                                    <Briefcase size={16} className="text-purple-500" />
                                    <select className="bg-transparent border-none outline-none text-sm font-medium cursor-pointer max-w-[200px]" value={selectedFaculty} onChange={(e) => { setSelectedFaculty(e.target.value); setSelectedBatch(''); }}>
                                        {facultyList.map(f => <option key={f.id} value={f.id}>{f.name} {f.isVisitingFaculty ? '(VF)' : ''}</option>)}
                                    </select>
                                </div>
                            )}
                        </div>
                        <div className="text-xs text-gray-500 flex gap-4 bg-white p-2 rounded-full border border-gray-200 shadow-sm">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-indigo-400"></div> Theory</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-400"></div> Lab</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-400"></div> Tut</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-teal-400"></div> OE</span>
                        </div>
                    </div>

                    <TimetableGrid
                        schedule={schedule.map(s => ({
                            ...s,
                            _courseName: courseList.find(c => c.id === s.courseId)?.name,
                            _facultyName: facultyList.find(f => f.id === s.facultyId)?.name,
                            _batchName: selectedFaculty ? batchList.find(b => b.id === s.batchId)?.name : undefined,
                            _combinedBatchNames: getCombinedBatchNames(s.batchId)
                        })) as unknown as ScheduleEntry[]}
                        rooms={rooms}
                        batches={batchList}
                        filterBatchId={selectedBatch}
                        filterFacultyId={selectedFaculty}
                        selectedFaculty={selectedFacultyObj}
                        onDragStart={handleDragStart}
                        onDragOver={handleDragOver}
                        onDrop={handleGridDrop}
                        onToggleLock={handleToggleLock}
                        readOnly={isReadOnlyUser}
                    />
                </main>
            </div>

            <ConstraintsToast toast={toast} onClose={() => setToast(null)} />

            <RoomConfigModal isOpen={isRoomConfigOpen} onClose={() => setIsRoomConfigOpen(false)} currentRooms={rooms} onSave={(newRooms) => { saveToHistory(schedule, unassigned); setRooms(newRooms); if (schedule.length > 0) { const recycled = schedule.map(s => { const { roomId, ...rest } = s; return rest; }); setUnassigned(prev => [...prev, ...recycled]); setSchedule([]); showToast(`Room config changed. Schedule reset.`, 'warning'); } else { showToast(`Updated rooms.`, 'success'); } }} />

            <CreateSessionModal
                isOpen={isCreateSessionOpen}
                onClose={() => setIsCreateSessionOpen(false)}
                onSave={handleCreateSession}
                facultyOptions={facultyList.map(f => ({ id: f.id, label: f.name }))}
                roomOptions={rooms.map(r => ({ id: r.id, label: r.name }))}
                courseOptions={courseList.map(c => ({ id: c.id, label: c.name }))}
                selectedBatchName={selectedBatchObj ? selectedBatchObj.name : ''}
                hasSelectedBatch={!!selectedBatch}
            />
        </div>
    );
};