import React, { memo, useRef } from 'react';
import { ScheduleEntry, SessionType, EnrichedScheduleEntry } from '../types';
import { COURSES, FACULTY } from '../services/mockData';
import { MapPin, User, Clock, GraduationCap, Users, Lock, Unlock } from 'lucide-react';

interface Props {
    entry: EnrichedScheduleEntry;
    onDragStart: (e: React.DragEvent, entryId: string) => void;
    onToggleLock?: (id: string) => void;
    className?: string;
    showDetails?: boolean;
    courseCode?: string;
    facultyName?: string;
    roomName?: string;
    batchName?: string;
    style?: React.CSSProperties;
    isReadOnly?: boolean;
}

const DraggableSlotComponent: React.FC<Props> = ({
    entry,
    onDragStart,
    onToggleLock,
    className = '',
    showDetails = true,
    courseCode,
    facultyName,
    roomName,
    batchName,
    style,
    isReadOnly
}) => {
    const lookupCourse = COURSES.find(c => c.id === entry.courseId);
    const lookupFaculty = FACULTY.find(f => f.id === entry.facultyId);

    const displayCourse = courseCode || entry._courseName || lookupCourse?.code || (entry.courseId?.startsWith('c_') ? 'New Course' : entry.courseId);
    const displayFaculty = facultyName || entry._facultyName || lookupFaculty?.name || (entry.facultyId?.startsWith('f_') ? 'New Faculty' : entry.facultyId);
    const isVF = lookupFaculty?.isVisitingFaculty || (entry.facultyId && entry.facultyId.includes('VF'));

    // Refined Color Palette
    let colorStyles = {
        bg: 'bg-indigo-50',
        border: 'border-indigo-200',
        text: 'text-indigo-900',
        accent: 'text-indigo-500',
        iconBg: 'bg-indigo-100',
        hoverBorder: 'group-hover/slot:border-indigo-400'
    };

    if (entry.isOE) {
        colorStyles = {
            bg: 'bg-teal-50',
            border: 'border-teal-200',
            text: 'text-teal-900',
            accent: 'text-teal-600',
            iconBg: 'bg-teal-100',
            hoverBorder: 'group-hover/slot:border-teal-400'
        };
    } else if (entry.type === SessionType.LAB) {
        colorStyles = {
            bg: 'bg-rose-50',
            border: 'border-rose-200',
            text: 'text-rose-900',
            accent: 'text-rose-500',
            iconBg: 'bg-rose-100',
            hoverBorder: 'group-hover/slot:border-rose-400'
        };
    } else if (entry.type === SessionType.TUTORIAL) {
        colorStyles = {
            bg: 'bg-amber-50',
            border: 'border-amber-200',
            text: 'text-amber-900',
            accent: 'text-amber-600',
            iconBg: 'bg-amber-100',
            hoverBorder: 'group-hover/slot:border-amber-400'
        };
    }

    const combinedNames = entry._combinedBatchNames || [];

    const fullDisplayName = entry.isOE && entry.subBatch
        ? `${displayCourse} (${entry.subBatch})`
        : displayCourse;

    const isLocked = entry.isLocked;

    const cardRef = useRef<HTMLDivElement>(null);

    return (
        <div
            draggable={!isLocked && !isReadOnly}
            onDragStart={(e) => {
                if (!isLocked && !isReadOnly) {
                    if (cardRef.current) {
                        // Use nativeEvent.offsetX/Y to keep the cursor positioned exactly where they grabbed it
                        e.dataTransfer.setDragImage(cardRef.current, e.nativeEvent.offsetX || 20, e.nativeEvent.offsetY || 20);
                    }
                    onDragStart(e, entry.id);
                }
            }}
            style={style}
            className={`
        ${colorStyles.bg} ${colorStyles.border} ${colorStyles.text}
        border rounded-lg shadow-sm 
        ${isLocked ? 'cursor-default opacity-90' : 'cursor-grab active:cursor-grabbing'} 
        transition-all select-none group/slot flex flex-col z-20 hover:z-[60] hover:shadow-md
        ${colorStyles.hoverBorder}
        ${className}
      `}
        >
            {/* --- COMPACT CARD CONTENT --- */}
            <div ref={cardRef} className="flex flex-col h-full p-2 relative overflow-hidden rounded-lg bg-inherit">
                {/* Top Bar: Type, SubBatch & Lock */}
                <div className="flex justify-between items-start mb-1 gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                        <span className={`text-[9px] uppercase tracking-wider font-bold opacity-70 ${colorStyles.accent}`}>
                            {entry.isOE ? 'OE' : (entry.type === SessionType.LAB ? 'LAB' : entry.type === SessionType.TUTORIAL ? 'TUT' : 'LEC')}
                        </span>
                        {entry.subBatch && !entry.isOE && (
                            <span className="text-[9px] font-mono bg-white/60 px-1 rounded text-gray-600 truncate max-w-[60px]">
                                {entry.subBatch}
                            </span>
                        )}
                    </div>

                    {/* Pin/Lock Button - Only show if toggle handler provided AND not read only */}
                    {!isReadOnly && onToggleLock && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleLock(entry.id);
                            }}
                            className={`
                        z-30 p-0.5 rounded hover:bg-black/5 transition-colors
                        ${isLocked ? 'text-gray-800' : 'text-transparent group-hover/slot:text-gray-400 hover:text-gray-600'}
                    `}
                            title={isLocked ? "Unlock Slot" : "Pin/Lock Slot"}
                        >
                            {isLocked ? <Lock size={10} fill="currentColor" /> : <Unlock size={10} />}
                        </button>
                    )}
                </div>

                {/* Course Name (Main) */}
                <div className="font-bold text-xs leading-tight mb-auto line-clamp-2 pr-2" title={fullDisplayName}>
                    {fullDisplayName}
                </div>

                {/* Footer Details */}
                {showDetails && (
                    <div className="mt-1 space-y-0.5 border-t border-black/5 pt-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <User size={10} className={`shrink-0 ${colorStyles.accent}`} />
                            <span className="truncate text-[10px] font-medium opacity-90">{displayFaculty}</span>
                        </div>

                        {entry.isOE && combinedNames.length > 0 ? (
                            <div className="flex items-start gap-1.5 min-w-0">
                                <Users size={10} className={`shrink-0 mt-0.5 ${colorStyles.accent}`} />
                                <span className="text-[9px] font-medium opacity-90 leading-tight">
                                    Combined: {combinedNames.length} classes
                                </span>
                            </div>
                        ) : (
                            batchName && (
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <Users size={10} className={`shrink-0 ${colorStyles.accent}`} />
                                    <span className="truncate text-[10px] font-medium opacity-90">{batchName}</span>
                                </div>
                            )
                        )}

                        {roomName && (
                            <div className="flex items-center gap-1.5 min-w-0">
                                <MapPin size={10} className={`shrink-0 ${colorStyles.accent}`} />
                                <span className="truncate text-[10px] font-semibold opacity-90">{roomName}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Hover Overlay Hint */}
                <div className="absolute inset-0 bg-white/0 group-hover/slot:bg-white/10 pointer-events-none transition-colors" />

                {/* Lock Overlay Tint */}
                {isLocked && (
                    <div className="absolute inset-0 bg-gray-50/10 pointer-events-none border-2 border-transparent" />
                )}
            </div>

            {/* --- EXPANDED HOVER POPOVER --- */}
            {showDetails && (
                <div className="
            invisible group-hover/slot:visible 
            absolute left-1/2 -translate-x-1/2 top-[95%] 
            w-[260px] z-[100] pt-2
            opacity-0 group-hover/slot:opacity-100 transition-opacity duration-200 delay-300
        ">
                    <div className="bg-white rounded-xl shadow-2xl border border-gray-100 p-4 relative text-gray-800">
                        {/* Arrow */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white border-t border-l border-gray-100 rotate-45"></div>

                        <div className="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-gray-50">
                            <div>
                                <h3 className="font-bold text-sm leading-snug">{fullDisplayName}</h3>
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${colorStyles.accent}`}>
                                    {entry.isOE ? 'Open Elective' : entry.type} {entry.subBatch ? `• ${entry.subBatch}` : ''}
                                </span>
                            </div>
                            <div className={`p-2 rounded-lg ${colorStyles.iconBg} ${colorStyles.accent}`}>
                                <GraduationCap size={16} />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 text-gray-400"><User size={14} /></div>
                                <div>
                                    <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">Faculty</p>
                                    <p className="text-xs font-medium text-gray-900">{displayFaculty}</p>
                                    {isVF && <span className="text-[9px] text-purple-500 font-bold">Visiting Faculty</span>}
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 text-gray-400"><Users size={14} /></div>
                                <div>
                                    <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">
                                        {entry.isOE ? 'Combined Divisions' : 'Batch'}
                                    </p>
                                    {entry.isOE && combinedNames.length > 0 ? (
                                        <ul className="text-xs font-medium text-gray-900 list-disc list-inside">
                                            {combinedNames.map((name, i) => (
                                                <li key={i} className="truncate">{name}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs font-medium text-gray-900">{batchName}</p>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 text-gray-400"><MapPin size={14} /></div>
                                <div>
                                    <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">Room</p>
                                    <p className="text-xs font-medium text-gray-900">{roomName || 'Unassigned'}</p>
                                </div>
                            </div>

                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 text-gray-400">
                                    {isLocked ? <Lock size={14} className="text-orange-500" /> : <Unlock size={14} />}
                                </div>
                                <div>
                                    <p className="text-[10px] uppercase text-gray-400 font-semibold tracking-wide">Status</p>
                                    <p className={`text-xs font-medium ${isLocked ? 'text-orange-600' : 'text-gray-900'}`}>
                                        {isLocked ? 'Pinned (Locked)' : 'Movable'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export const DraggableSlot = memo(DraggableSlotComponent);