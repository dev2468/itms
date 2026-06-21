import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { Room } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (rooms: Room[]) => void;
  currentRooms: Room[]; // Added currentRooms prop
}

export const RoomConfigModal: React.FC<Props> = ({ isOpen, onClose, onSave, currentRooms }) => {
  const [pools, setPools] = useState({
    classroom: '',
    lab: '',
    tutorial: '',
    backupClassroom: '',
    backupLab: '',
    backupTutorial: ''
  });

  const [error, setError] = useState<string | null>(null);

  // Parse current rooms into text fields when modal opens
  useEffect(() => {
    if (isOpen && currentRooms.length > 0) {
      const getNames = (category: string, isBackup: boolean) =>
        currentRooms
          .filter(r => r.category === category && !!r.isBackup === isBackup)
          .map(r => r.name)
          .join(', ');

      setPools({
        classroom: getNames('Theory', false),
        lab: getNames('Lab', false),
        tutorial: getNames('Tutorial', false),
        backupClassroom: getNames('Theory', true),
        backupLab: getNames('Lab', true),
        backupTutorial: getNames('Tutorial', true),
      });
    }
  }, [isOpen, currentRooms]);

  if (!isOpen) return null;

  const handleChange = (field: keyof typeof pools, value: string) => {
    setPools(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const inferFloor = (name: string): number => {
    const match = name.match(/(\d{3})/);
    if (match) {
      return Math.floor(parseInt(match[1]) / 100);
    }
    const simpleMatch = name.match(/(\d+)/);
    if (simpleMatch) {
      const num = parseInt(simpleMatch[0]);
      return num < 10 ? num : Math.floor(num / 100);
    }
    return 1;
  };

  const parseAndAddRooms = (input: string, category: 'Theory' | 'Lab' | 'Tutorial', isBackup: boolean, list: Room[]) => {
    if (!input.trim()) return;
    const names = input.split(',').map(s => s.trim()).filter(s => s !== '');
    names.forEach(name => {
      // Preserve ID if room exists with same name and category
      const existing = currentRooms.find(r => r.name.toLowerCase() === name.toLowerCase() && r.category === category && !!r.isBackup === isBackup);

      list.push({
        id: existing ? existing.id : crypto.randomUUID(),
        name: name,
        floor: existing ? existing.floor : inferFloor(name),
        capacity: existing ? existing.capacity : 60,
        type: category === 'Lab' ? 'Lab' : 'Lecture',
        category: category,
        isBackup: isBackup
      });
    });
  };

  const handleSave = () => {
    if (!pools.classroom || !pools.lab || !pools.tutorial) {
      setError("Please fill in all mandatory fields (Classroom, Lab, and Tutorial Pools).");
      return;
    }

    const newRooms: Room[] = [];

    // Mandatory
    parseAndAddRooms(pools.classroom, 'Theory', false, newRooms);
    parseAndAddRooms(pools.lab, 'Lab', false, newRooms);
    parseAndAddRooms(pools.tutorial, 'Tutorial', false, newRooms);

    // Backups
    parseAndAddRooms(pools.backupClassroom, 'Theory', true, newRooms);
    parseAndAddRooms(pools.backupLab, 'Lab', true, newRooms);
    parseAndAddRooms(pools.backupTutorial, 'Tutorial', true, newRooms);

    onSave(newRooms);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 rounded-t-lg">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            Configure Rooms
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded flex items-center gap-2 border border-red-200">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Primary Pools */}
            <div className="space-y-4">
              <h3 className="font-semibold text-blue-800 border-b border-blue-100 pb-1">Primary Pools (Mandatory)</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  1. Classroom Pool <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                  placeholder="e.g. CR-301, CR-302"
                  value={pools.classroom}
                  onChange={(e) => handleChange('classroom', e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">Comma-separated theory rooms</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  2. Lab Pool <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                  placeholder="e.g. CL-401, CL-402"
                  value={pools.lab}
                  onChange={(e) => handleChange('lab', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  3. Tutorial Pool <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                  placeholder="e.g. TR-101"
                  value={pools.tutorial}
                  onChange={(e) => handleChange('tutorial', e.target.value)}
                />
              </div>
            </div>

            {/* Backup Pools */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-600 border-b border-gray-100 pb-1">Backup Pools (Optional)</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  4. Backup Classroom Pool
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-gray-500 outline-none bg-white text-gray-900"
                  placeholder="Backup theory rooms"
                  value={pools.backupClassroom}
                  onChange={(e) => handleChange('backupClassroom', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  5. Backup Lab Pool
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-gray-500 outline-none bg-white text-gray-900"
                  placeholder="Backup labs"
                  value={pools.backupLab}
                  onChange={(e) => handleChange('backupLab', e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  6. Backup Tutorial Pool
                </label>
                <input
                  type="text"
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-gray-500 outline-none bg-white text-gray-900"
                  placeholder="Backup tutorial rooms"
                  value={pools.backupTutorial}
                  onChange={(e) => handleChange('backupTutorial', e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 flex items-center gap-2 shadow-sm"
          >
            <Save size={16} /> Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};