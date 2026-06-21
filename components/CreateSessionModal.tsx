import React, { useState, useEffect } from 'react';
import { X, Plus, BookOpen, Users, Wand2 } from 'lucide-react';
import { Combobox } from './Combobox';
import { SessionType } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: SessionFormData) => void;
  facultyOptions: {id: string, label: string}[];
  // Removed batchOptions
  roomOptions: {id: string, label: string}[];
  courseOptions: {id: string, label: string}[];
  selectedBatchName: string;
  hasSelectedBatch: boolean;
}

export interface SessionFormData {
    courseId: string | null; 
    courseName: string;
    facultyId: string | null; 
    facultyName: string;
    // Batch handled by parent context
    roomId: string | null; 
    roomName: string;
    type: SessionType;
    duration: number;
    isNewFaculty: boolean;
    isNewRoom: boolean;
    isNewCourse: boolean;
}

export const CreateSessionModal: React.FC<Props> = ({ 
    isOpen, onClose, onSave, 
    facultyOptions, roomOptions, courseOptions,
    selectedBatchName, hasSelectedBatch
}) => {
    const initialFormState = {
        courseId: null, courseName: '',
        facultyId: null, facultyName: '',
        roomId: 'auto', roomName: '✨ Auto-assign Room',
        type: SessionType.THEORY,
        duration: 1,
        isNewFaculty: false, isNewRoom: false, isNewCourse: false
    };

    const [form, setForm] = useState<SessionFormData>(initialFormState);

    // Reset form whenever modal opens
    useEffect(() => {
        if (isOpen) {
            setForm(initialFormState);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = () => {
        if (!hasSelectedBatch) return;
        if (!form.courseName || !form.facultyName) {
            alert("Course Name and Faculty are required.");
            return;
        }
        onSave(form);
        onClose();
        // State resets via useEffect when reopened
    };

    const enhancedRoomOptions = [
        { id: 'auto', label: '✨ Auto-assign Room' },
        ...roomOptions
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <div className="p-2 bg-blue-100 text-blue-600 rounded-lg"><BookOpen size={18}/></div>
                        Create Custom Lecture
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors"><X size={20} /></button>
                </div>
                
                <div className="p-6 space-y-4 overflow-y-auto">
                    {/* Detected Batch Display */}
                    <div className={`p-3 rounded-lg border flex items-center gap-3 ${hasSelectedBatch ? 'bg-blue-50 border-blue-100' : 'bg-red-50 border-red-100'}`}>
                        <div className={`p-2 rounded-full ${hasSelectedBatch ? 'bg-blue-100 text-blue-600' : 'bg-red-100 text-red-600'}`}>
                            <Users size={16} />
                        </div>
                        <div className="flex-1">
                            <div className={`text-xs uppercase font-bold ${hasSelectedBatch ? 'text-blue-400' : 'text-red-400'}`}>
                                Target Class
                            </div>
                            <div className={`font-bold ${hasSelectedBatch ? 'text-blue-900' : 'text-red-900'}`}>
                                {hasSelectedBatch ? selectedBatchName : "No Class Selected"}
                            </div>
                        </div>
                        {!hasSelectedBatch && (
                            <div className="text-xs font-medium text-red-600 max-w-[120px] text-right">
                                Select a batch in main view to continue
                            </div>
                        )}
                    </div>

                    <Combobox 
                        label="Lecture / Course Name" 
                        placeholder="Search existing course or type new name..." 
                        options={courseOptions} 
                        value={form.courseName} 
                        onChange={(id, name, isNew) => {
                            setForm(prev => ({ 
                                ...prev, 
                                courseId: id, 
                                courseName: name,
                                isNewCourse: isNew 
                            }));
                        }}
                        disabled={!hasSelectedBatch}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
                         <Combobox 
                            label="Faculty" 
                            placeholder="Search or add faculty..." 
                            options={facultyOptions} 
                            value={form.facultyName} 
                            onChange={(id, name, isNew) => {
                                setForm(prev => ({ 
                                    ...prev, 
                                    facultyId: id, 
                                    facultyName: name,
                                    isNewFaculty: isNew 
                                }));
                            }} 
                            disabled={!hasSelectedBatch}
                        />
                        <div>
                             <label className="block text-xs font-semibold text-gray-700 mb-1 uppercase tracking-wide">Duration (Hours)</label>
                             <input 
                                type="number" min={1} max={8} 
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400"
                                value={form.duration}
                                onChange={e => setForm(prev => ({...prev, duration: parseInt(e.target.value) || 1}))}
                                disabled={!hasSelectedBatch}
                             />
                        </div>
                    </div>

                     <div className="grid grid-cols-1 gap-x-4">
                        <Combobox 
                            label="Room Assignment" 
                            placeholder="Select room..." 
                            options={enhancedRoomOptions} 
                            value={form.roomName} 
                            onChange={(id, name, isNew) => {
                                setForm(prev => ({ 
                                    ...prev, 
                                    roomId: id, 
                                    roomName: name,
                                    isNewRoom: isNew 
                                }));
                            }} 
                            disabled={!hasSelectedBatch}
                        />
                     </div>
                     
                     <div className="pt-2">
                        <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Session Type</label>
                        <div className="flex gap-4 p-1">
                            {[SessionType.THEORY, SessionType.LAB, SessionType.TUTORIAL].map(t => (
                                <label key={t} className={`
                                    flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border transition-all
                                    ${form.type === t && hasSelectedBatch
                                        ? 'bg-blue-50 border-blue-200 shadow-sm' 
                                        : 'bg-white border-gray-200'}
                                    ${!hasSelectedBatch ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50'}
                                `}>
                                    <input 
                                        type="radio" 
                                        name="sessionType"
                                        checked={form.type === t}
                                        onChange={() => setForm(prev => ({...prev, type: t}))}
                                        className="text-blue-600 focus:ring-blue-500"
                                        disabled={!hasSelectedBatch}
                                    />
                                    <span className={`text-sm font-medium ${form.type === t ? 'text-blue-800' : 'text-gray-600'}`}>{t}</span>
                                </label>
                            ))}
                        </div>
                     </div>
                </div>
                
                <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={!hasSelectedBatch}
                        className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm transition-all active:scale-95 ${!hasSelectedBatch ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'}`}
                    >
                        <Plus size={16} /> Create Lecture
                    </button>
                </div>
            </div>
        </div>
    );
};