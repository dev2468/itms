import React, { useMemo, useState } from 'react';
import { X, User, MapPin, BarChart3, AlertTriangle, CheckCircle } from 'lucide-react';
import { ScheduleEntry, Faculty, Room, DayOfWeek } from '../types';
import { TIME_SLOTS, DAYS } from '../constants';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  schedule: ScheduleEntry[];
  faculty: Faculty[];
  rooms: Room[];
}

export const StatsModal: React.FC<Props> = ({ isOpen, onClose, schedule, faculty, rooms }) => {
  const [activeTab, setActiveTab] = useState<'faculty' | 'rooms'>('faculty');

  const stats = useMemo(() => {
    // Faculty Stats
    const facultyStats = faculty.map(f => {
      const assigned = schedule.filter(s => s.facultyId === f.id);
      const totalSlots = assigned.reduce((acc, s) => acc + s.durationInSlots, 0);
      
      // Calculate daily distribution for fatigue check
      const dayCounts: Record<string, number> = {};
      DAYS.forEach(d => dayCounts[d] = 0);
      assigned.forEach(s => {
          dayCounts[s.day] = (dayCounts[s.day] || 0) + s.durationInSlots;
      });
      const maxDaily = Math.max(...Object.values(dayCounts));

      return {
        ...f,
        totalSlots,
        maxDaily,
        isOverloaded: totalSlots > 18, // Heuristic limit
        isFatigued: maxDaily > 6
      };
    }).sort((a, b) => b.totalSlots - a.totalSlots);

    // Room Stats
    const totalWeeklySlots = DAYS.length * TIME_SLOTS.length;
    const roomStats = rooms.map(r => {
      const assigned = schedule.filter(s => s.roomId === r.id);
      const usedSlots = assigned.reduce((acc, s) => acc + s.durationInSlots, 0);
      const utilization = Math.round((usedSlots / totalWeeklySlots) * 100);
      
      return {
        ...r,
        usedSlots,
        utilization
      };
    }).sort((a, b) => b.utilization - a.utilization);

    return { facultyStats, roomStats };
  }, [schedule, faculty, rooms]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50 shrink-0">
          <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <BarChart3 className="text-blue-600" /> Statistics & Analytics
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-200 transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="flex border-b border-gray-200 shrink-0">
          <button 
            onClick={() => setActiveTab('faculty')}
            className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'faculty' ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}
          >
            Faculty Workload
          </button>
          <button 
            onClick={() => setActiveTab('rooms')}
            className={`flex-1 py-3 text-sm font-bold text-center border-b-2 transition-colors ${activeTab === 'rooms' ? 'border-purple-600 text-purple-600 bg-purple-50' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}
          >
            Room Utilization
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50">
          {activeTab === 'faculty' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {stats.facultyStats.map(f => (
                 <div key={f.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                       <div className={`p-2 rounded-full ${f.isVisitingFaculty ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                          <User size={18} />
                       </div>
                       <div>
                          <div className="font-bold text-gray-800 text-sm">{f.name}</div>
                          <div className="text-xs text-gray-500">{f.isVisitingFaculty ? 'Visiting' : 'Regular'} • Max Daily: {f.maxDaily}h</div>
                       </div>
                    </div>
                    <div className="text-right min-w-[100px]">
                       <div className="text-xs font-semibold text-gray-500 mb-1">Total Load</div>
                       <div className="flex items-center gap-2 justify-end">
                          <span className={`text-lg font-bold ${f.isOverloaded ? 'text-red-600' : 'text-gray-800'}`}>
                            {f.totalSlots} <span className="text-xs font-normal text-gray-400">/ 18h</span>
                          </span>
                          {f.isOverloaded && (
                              <span title="Overloaded" className="flex items-center">
                                <AlertTriangle size={14} className="text-red-500" />
                              </span>
                          )}
                       </div>
                       <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${f.isOverloaded ? 'bg-red-500' : f.totalSlots > 12 ? 'bg-amber-400' : 'bg-green-500'}`} 
                            style={{ width: `${Math.min((f.totalSlots / 18) * 100, 100)}%` }}
                          />
                       </div>
                    </div>
                 </div>
               ))}
            </div>
          )}

          {activeTab === 'rooms' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
               {stats.roomStats.map(r => (
                 <div key={r.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                           <MapPin size={16} className="text-gray-400" />
                           <span className="font-bold text-gray-700">{r.name}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded ${r.category === 'Lab' ? 'bg-rose-100 text-rose-700' : 'bg-indigo-100 text-indigo-700'}`}>
                           {r.type}
                        </span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-gray-600">
                            <span>Occupancy</span>
                            <span className="font-bold">{r.utilization}%</span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div 
                                className={`h-full rounded-full ${r.utilization > 80 ? 'bg-red-500' : r.utilization > 50 ? 'bg-blue-500' : 'bg-green-500'}`} 
                                style={{ width: `${r.utilization}%` }}
                            />
                        </div>
                        <div className="text-xs text-gray-400 text-right">{r.usedSlots} slots used</div>
                    </div>
                 </div>
               ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};