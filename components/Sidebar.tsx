import React from 'react';
import { EnrichedScheduleEntry } from '../types';
import { DraggableSlot } from './DraggableSlot';
import { BookOpen, Archive, Plus } from 'lucide-react';

interface Props {
  unassigned: EnrichedScheduleEntry[]; 
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDrop?: (e: React.DragEvent) => void;
  onAddSession?: () => void; // New prop
}

export const Sidebar: React.FC<Props> = ({ unassigned, onDragStart, onDrop, onAddSession }) => {
  return (
    <div 
      className="w-64 bg-white border-r border-gray-200 flex flex-col h-full shadow-lg z-10"
      onDragOver={(e) => {
        if (onDrop) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        }
      }}
      onDrop={onDrop}
    >
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex justify-between items-center mb-2">
            <h2 className="font-bold text-gray-700 flex items-center gap-2">
            <BookOpen size={18} />
            Unassigned ({unassigned.length})
            </h2>
            {onAddSession && (
                <button 
                    onClick={onAddSession}
                    className="p-1.5 bg-blue-100 text-blue-600 rounded-md hover:bg-blue-200 transition-colors"
                    title="Create Custom Lecture"
                >
                    <Plus size={16} />
                </button>
            )}
        </div>
        <p className="text-xs text-gray-500">Drag items onto the grid</p>
      </div>
      
      {/* Drop Zone Visual Hint */}
      {unassigned.length === 0 && (
        <div className="absolute inset-0 bg-blue-50/0 pointer-events-none transition-colors" />
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3 relative">
        {unassigned.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg mx-2 mt-4">
            <Archive className="mb-2 opacity-50" />
            <span className="text-sm italic">All classes assigned!</span>
            <span className="text-[10px] text-gray-400 mt-1">Drop here to unassign</span>
            {onAddSession && (
                <button 
                    onClick={onAddSession}
                    className="mt-4 text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                    <Plus size={12} /> Add New
                </button>
            )}
          </div>
        ) : (
          unassigned.map((u) => (
            <DraggableSlot 
              key={u.id} 
              entry={u} 
              onDragStart={onDragStart}
              courseCode={u._courseName || u.courseId} 
              facultyName={u._facultyName || u.facultyId}
              batchName={u._batchName}
            />
          ))
        )}
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
        <p><strong>Legend:</strong></p>
        <div className="flex gap-2 mt-1">
          <span className="w-3 h-3 bg-indigo-100 border border-indigo-300 rounded"></span> Theory
        </div>
        <div className="flex gap-2 mt-1">
          <span className="w-3 h-3 bg-rose-100 border border-rose-300 rounded"></span> Lab
        </div>
        <div className="flex gap-2 mt-1">
          <span className="w-3 h-3 bg-amber-100 border border-amber-300 rounded"></span> Tutorial
        </div>
        <div className="flex gap-2 mt-1">
          <span className="w-3 h-3 bg-teal-100 border border-teal-300 rounded"></span> Open Elective
        </div>
         <div className="flex gap-2 mt-1">
          <span className="w-3 h-3 bg-purple-100 border border-purple-300 rounded"></span> Visiting Fac
        </div>
      </div>
    </div>
  );
};