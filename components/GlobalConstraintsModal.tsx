import React, { useState, useEffect } from 'react';
import { X, Save, AlertTriangle, Settings2, Info } from 'lucide-react';
import { SchedulingConstraints, DeletionImpact } from '../types';
import { DEFAULT_CONSTRAINTS } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentConstraints: SchedulingConstraints;
  onSave: (newConstraints: SchedulingConstraints) => DeletionImpact[];
}

export const GlobalConstraintsModal: React.FC<Props> = ({ isOpen, onClose, currentConstraints, onSave }) => {
  const [form, setForm] = useState<SchedulingConstraints>(DEFAULT_CONSTRAINTS);
  const [impacts, setImpacts] = useState<DeletionImpact[] | null>(null);

  useEffect(() => {
    if (isOpen) {
      setForm(currentConstraints);
      setImpacts(null);
    }
  }, [isOpen, currentConstraints]);

  if (!isOpen) return null;

  const handleChange = (field: keyof SchedulingConstraints, value: string) => {
    const numVal = parseInt(value);
    setForm(prev => ({ ...prev, [field]: isNaN(numVal) ? 0 : numVal }));
  };

  const handleInitialSave = () => {
      const results = onSave(form);
      if (results.length > 0) {
          setImpacts(results);
      } else {
          onClose();
      }
  };

  const handleClose = () => {
      onClose();
      setImpacts(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Settings2 className="text-blue-600" /> Global Scheduling Constraints
          </h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {impacts ? (
              <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3 items-start">
                      <AlertTriangle className="text-amber-600 mt-0.5 shrink-0" size={20} />
                      <div>
                          <h3 className="font-bold text-amber-800">Constraints Updated with Conflicts</h3>
                          <p className="text-sm text-amber-700 mt-1">
                              The new constraints were applied, but some existing sessions in your projects violated these rules and were moved to <strong>Unassigned</strong>.
                          </p>
                      </div>
                  </div>
                  
                  <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 text-gray-600 font-bold border-b">
                              <tr>
                                  <th className="px-4 py-2">Project Name</th>
                                  <th className="px-4 py-2 text-right">Unassigned Items</th>
                              </tr>
                          </thead>
                          <tbody>
                              {impacts.map(i => (
                                  <tr key={i.projectId} className="border-b last:border-0">
                                      <td className="px-4 py-2">{i.projectName}</td>
                                      <td className="px-4 py-2 text-right text-red-600 font-bold">{i.affectedCount}</td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>

                  <div className="flex justify-end pt-4">
                      <button onClick={handleClose} className="px-6 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700">
                          Acknowledge & Close
                      </button>
                  </div>
              </div>
          ) : (
             <div className="space-y-6">
                 <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-800 flex items-start gap-2">
                     <Info size={16} className="mt-0.5 shrink-0"/>
                     <p>Changes here apply to <strong>all projects</strong>. Saving will re-validate schedules and unassign any sessions that violate these new limits.</p>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Faculty Constraints */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-900 border-b pb-2">Faculty Limits</h3>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Continuous Theory Hours</label>
                            <input 
                                type="number" min="1" max="10"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.maxFacultyTheoryContinuous}
                                onChange={(e) => handleChange('maxFacultyTheoryContinuous', e.target.value)}
                            />
                            <p className="text-xs text-gray-400 mt-1">Default: 3 hours</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Continuous Mixed Hours</label>
                            <input 
                                type="number" min="1" max="10"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.maxFacultyMixedContinuous}
                                onChange={(e) => handleChange('maxFacultyMixedContinuous', e.target.value)}
                            />
                            <p className="text-xs text-gray-400 mt-1">Theory + Lab combined. Default: 5 hours</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Workday Window (Hours)</label>
                            <input 
                                type="number" min="4" max="12"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.facultyWorkdayWindow}
                                onChange={(e) => handleChange('facultyWorkdayWindow', e.target.value)}
                            />
                            <p className="text-xs text-gray-400 mt-1">Max hours between first and last class. Default: 8</p>
                        </div>
                    </div>

                    {/* Student Constraints */}
                    <div className="space-y-4">
                        <h3 className="font-bold text-gray-900 border-b pb-2">Student Limits</h3>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Continuous Classes</label>
                            <input 
                                type="number" min="1" max="10"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.maxStudentContinuous}
                                onChange={(e) => handleChange('maxStudentContinuous', e.target.value)}
                            />
                            <p className="text-xs text-gray-400 mt-1">Default: 5 hours</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Daily Gap Limit (Empty Slots)</label>
                            <input 
                                type="number" min="0" max="5"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.studentDailyGapLimit}
                                onChange={(e) => handleChange('studentDailyGapLimit', e.target.value)}
                            />
                            <p className="text-xs text-gray-400 mt-1">Max consecutive free slots. Default: 2</p>
                        </div>

                         <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Max Subject Daily Hours</label>
                            <input 
                                type="number" min="1" max="8"
                                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                value={form.maxSubjectDailyHours}
                                onChange={(e) => handleChange('maxSubjectDailyHours', e.target.value)}
                            />
                            <p className="text-xs text-gray-400 mt-1">Max hours for same course per day. Default: 3</p>
                        </div>
                    </div>
                 </div>
             </div>
          )}
        </div>

        {!impacts && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                <button 
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleInitialSave}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-2 shadow-sm"
                >
                    <Save size={16} /> Save & Apply
                </button>
            </div>
        )}
      </div>
    </div>
  );
};