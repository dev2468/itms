import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, Building2, User, Plus, Pencil, X, Save, Trash2, AlertTriangle, AlertOctagon, Eye, Shield } from 'lucide-react';
import {
    getGlobalState,
    addOrUpdateGlobalRoom,
    addOrUpdateGlobalFaculty,
    updateGlobalFacultyWithPropagation,
    deleteGlobalRoom,
    deleteGlobalFaculty,
    getDeletionImpact,
    getAvailabilityUpdateImpact,
    getProjectData,
    getAllProfiles,
    updateProfileRole,
    getAllDepartments
} from '../services/db';
import { Room, Faculty, DeletionImpact, ProjectMeta, Department } from '../types';
import { UserProfile, UserRole } from '../src/contexts/AuthContext';
import { TIME_SLOTS, DAYS } from '../constants';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const GlobalResources: React.FC = () => {
    const navigate = useNavigate();
    const [rooms, setRooms] = useState<Room[]>([]);
    const [faculty, setFaculty] = useState<Faculty[]>([]);
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);

    // Modal States
    const [roomModalOpen, setRoomModalOpen] = useState(false);
    const [facultyModalOpen, setFacultyModalOpen] = useState(false);

    // Impact / Confirmation Modal
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'delete' | 'update_avail' | null>(null);

    // Redirect Modal
    const [projectSelectModalOpen, setProjectSelectModalOpen] = useState(false);
    const [activeProjectsForRedirect, setActiveProjectsForRedirect] = useState<ProjectMeta[]>([]);
    const [redirectFacultyId, setRedirectFacultyId] = useState<string | null>(null);

    // Editing State
    const [editingRoom, setEditingRoom] = useState<Room | null>(null);
    const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);

    // Deletion/Update Metadata
    const [targetItem, setTargetItem] = useState<{ id: string, name: string, type: 'room' | 'faculty' } | null>(null);
    const [impactAnalysis, setImpactAnalysis] = useState<DeletionImpact[]>([]);

    // Form States (Room)
    const [roomForm, setRoomForm] = useState<Partial<Room>>({
        name: '', floor: 1, capacity: 60, type: 'Lecture'
    });

    // Form States (Faculty)
    const [facForm, setFacForm] = useState<Partial<Faculty>>({
        name: '', isVisitingFaculty: false, availability: {}
    });

    useEffect(() => {
        refreshData();
    }, []);

    const refreshData = async () => {
        const data = await getGlobalState();
        setRooms(data.globalRooms);
        setFaculty(data.globalFaculty);

        const fetchedProfiles = await getAllProfiles();
        setProfiles(fetchedProfiles);

        const fetchedDepts = await getAllDepartments();
        setDepartments(fetchedDepts);
    };

    // --- VIEW / REDIRECT LOGIC ---

    const handleViewSchedule = async (f: Faculty) => {
        const projects = await getProjects();
        const activeProjects: ProjectMeta[] = [];

        for (const p of projects) {
            const data = await getProjectData(p.id);
            if (data && data.faculty.some(fac => fac.id === f.id)) {
                activeProjects.push(p);
            }
        }

        if (activeProjects.length === 0) {
            alert("This faculty member is not assigned to any projects yet.");
        } else if (activeProjects.length === 1) {
            // Direct redirect
            navigate(`/project/${activeProjects[0].id}?faculty=${f.id}`);
        } else {
            // Show selection modal
            setRedirectFacultyId(f.id);
            setActiveProjectsForRedirect(activeProjects);
            setProjectSelectModalOpen(true);
        }
    };

    const handleRoleChange = async (userId: string, newRole: UserRole, departmentId?: string) => {
        const success = await updateProfileRole(userId, newRole, departmentId);
        if (success) {
            alert(`Role/Department updated successfully.`);
            refreshData(); // Refresh the list
        } else {
            alert("Failed to update role. Please ensure you have Super Admin permissions.");
        }
    };

    // --- DELETE HANDLER (Step 1: Analyze) ---

    const initiateDelete = (e: React.MouseEvent, id: string, name: string, type: 'room' | 'faculty') => {
        e.preventDefault(); // Stop any parent actions
        e.stopPropagation();
        const impacts = getDeletionImpact(type, id);
        setImpactAnalysis(impacts);
        setTargetItem({ id, name, type });
        setConfirmAction('delete');
        setConfirmModalOpen(true);
    };

    const executeConfirm = () => {
        if (!targetItem && !editingFaculty) return;

        try {
            if (confirmAction === 'delete' && targetItem) {
                if (targetItem.type === 'room') {
                    deleteGlobalRoom(targetItem.id);
                } else {
                    deleteGlobalFaculty(targetItem.id);
                }
            } else if (confirmAction === 'update_avail' && facForm.name) {
                // Re-construct the full object
                const newFac: Faculty = {
                    id: editingFaculty!.id,
                    name: facForm.name!,
                    departmentId: editingFaculty?.departmentId || 'dept_gen',
                    isVisitingFaculty: facForm.isVisitingFaculty || false,
                    availability: facForm.availability
                };
                updateGlobalFacultyWithPropagation(newFac);
                setFacultyModalOpen(false);
            }

            refreshData();
            setConfirmModalOpen(false);
            setTargetItem(null);
            setConfirmAction(null);
        } catch (err) {
            console.error(err);
            alert("An error occurred. Please try again.");
        }
    };

    // --- ROOM HANDLERS ---

    const handleOpenRoomModal = (room?: Room) => {
        if (room) {
            setEditingRoom(room);
            setRoomForm({ ...room });
        } else {
            setEditingRoom(null);
            setRoomForm({ name: '', floor: 1, capacity: 60, type: 'Lecture' });
        }
        setRoomModalOpen(true);
    };

    const handleSaveRoom = () => {
        if (!roomForm.name) return;
        const newRoom: Room = {
            id: editingRoom ? editingRoom.id : `gr_${Date.now()}`,
            name: roomForm.name!,
            floor: Number(roomForm.floor),
            capacity: Number(roomForm.capacity),
            type: roomForm.type as any,
            category: roomForm.type === 'Lecture' ? 'Theory' : roomForm.type === 'Lab' ? 'Lab' : roomForm.type === 'Tutorial' ? 'Tutorial' : undefined
        };

        try {
            addOrUpdateGlobalRoom(newRoom);
            refreshData();
            setRoomModalOpen(false);
        } catch (e: any) {
            alert(e.message);
        }
    };

    // --- FACULTY HANDLERS ---

    const handleOpenFacModal = (fac?: Faculty) => {
        if (fac) {
            setEditingFaculty(fac);
            setFacForm({ ...fac }); // Availability is shallow copied here, deep copy below if needed, but simple obj
        } else {
            setEditingFaculty(null);
            const defaultAvail: any = {};
            // Initialize available slots to 0 (Strict Mode: Explicitly Available) for VF
            DAY_KEYS.forEach(d => defaultAvail[d] = new Array(TIME_SLOTS.length).fill(0));
            setFacForm({ name: '', isVisitingFaculty: false, availability: defaultAvail });
        }
        setFacultyModalOpen(true);
    };

    const handleSaveFac = () => {
        if (!facForm.name) return;

        // Construct candidate
        const newFac: Faculty = {
            id: editingFaculty ? editingFaculty.id : `gf_${Date.now()}`,
            name: facForm.name!,
            departmentId: 'dept_gen',
            isVisitingFaculty: facForm.isVisitingFaculty || false,
            availability: facForm.availability
        };

        // Check Update Impact if Availability Changed
        if (editingFaculty && facForm.availability) {
            // Detect changes roughly
            const oldAvailStr = JSON.stringify(editingFaculty.availability || {});
            const newAvailStr = JSON.stringify(facForm.availability);

            if (oldAvailStr !== newAvailStr) {
                const impacts = getAvailabilityUpdateImpact(editingFaculty.id, facForm.availability!);
                if (impacts.length > 0) {
                    setImpactAnalysis(impacts);
                    setTargetItem({ id: editingFaculty.id, name: facForm.name!, type: 'faculty' });
                    setConfirmAction('update_avail');
                    setConfirmModalOpen(true);
                    return; // STOP. Wait for confirmation.
                }
            }
        }

        // If New or No Conflicts, just save
        try {
            if (editingFaculty) {
                // Use propagation even if 0 conflicts detected to ensure project data consistency
                updateGlobalFacultyWithPropagation(newFac);
            } else {
                addOrUpdateGlobalFaculty(newFac);
            }
            refreshData();
            setFacultyModalOpen(false);
        } catch (e: any) {
            alert(e.message);
        }
    };

    const toggleAvailability = (dayKey: string, slotIndex: number) => {
        if (!facForm.availability) return;
        const newAvail = { ...facForm.availability };
        if (!newAvail[dayKey]) newAvail[dayKey] = new Array(TIME_SLOTS.length).fill(0);

        newAvail[dayKey][slotIndex] = newAvail[dayKey][slotIndex] === 1 ? 0 : 1;
        setFacForm({ ...facForm, availability: newAvail });
    };

    return (
        <div className="min-h-screen bg-gray-50 p-8 text-gray-900 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-4 mb-8">
                    <Link to="/" className="p-2 hover:bg-white rounded-full transition-colors text-gray-600 border border-transparent hover:border-gray-200">
                        <ArrowLeft size={24} />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <Database className="text-purple-600" /> Global Resources
                        </h1>
                        <p className="text-gray-500 mt-1">Manage standard classrooms and faculty availability.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Rooms Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                                <Building2 className="text-blue-500" /> Classrooms ({rooms.length})
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleOpenRoomModal()}
                                    className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="space-y-2">
                                {rooms.length === 0 && <div className="text-center text-gray-400 py-10 italic">No classrooms defined</div>}
                                {rooms.map(r => (
                                    <div key={r.id} className="p-3 border border-gray-100 rounded-lg flex justify-between items-center hover:bg-blue-50 group transition-colors">
                                        <div>
                                            <div className="font-bold text-gray-800">{r.name}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">Floor {r.floor} • Capacity {r.capacity}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded border ${r.type === 'Lab' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                                                r.type === 'Lecture' ? 'bg-indigo-50 text-indigo-700 border-indigo-100' :
                                                    'bg-gray-100 text-gray-600 border-gray-200'
                                                }`}>
                                                {r.type}
                                            </span>
                                            <div className="flex items-center gap-1 border-l border-gray-200 pl-2 ml-1">
                                                <button type="button" onClick={() => handleOpenRoomModal(r)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors">
                                                    <Pencil size={16} />
                                                </button>
                                                <button type="button" onClick={(e) => initiateDelete(e, r.id, r.name, 'room')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Faculty Section */}
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-[600px]">
                        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                                <User className="text-purple-500" /> Faculty Directory ({faculty.length})
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleOpenFacModal()}
                                    className="text-sm bg-purple-600 text-white px-3 py-1.5 rounded-md hover:bg-purple-700 flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <Plus size={16} /> Add
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2">
                            <div className="space-y-2">
                                {faculty.length === 0 && <div className="text-center text-gray-400 py-10 italic">No faculty defined</div>}
                                {faculty.map(f => (
                                    <div key={f.id} className="p-3 border border-gray-100 rounded-lg flex justify-between items-center hover:bg-purple-50 group transition-colors">
                                        <div>
                                            <div className="font-bold text-gray-800">{f.name}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">{f.isVisitingFaculty ? 'Visiting Faculty (VF)' : 'Regular Staff'}</div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {f.isVisitingFaculty && <div className="h-2 w-2 rounded-full bg-amber-400" title="Has constraints"></div>}
                                            <div className="flex items-center gap-1 border-l border-gray-200 pl-2 ml-1">
                                                <button type="button" onClick={() => handleViewSchedule(f)} className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors" title="View Schedule in Project">
                                                    <Eye size={16} />
                                                </button>
                                                <button type="button" onClick={() => handleOpenFacModal(f)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors">
                                                    <Pencil size={16} />
                                                </button>
                                                <button type="button" onClick={(e) => initiateDelete(e, f.id, f.name, 'faculty')} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* User Management Section */}
                <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-800">
                            <Shield className="text-emerald-500" /> User Roles & Access ({profiles.length})
                        </h2>
                    </div>
                    <div className="p-4 overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-700">
                            <thead className="bg-gray-100 text-gray-600 uppercase font-bold text-xs sticky top-0">
                                <tr>
                                    <th className="px-4 py-3 rounded-tl-lg">User Email / ID</th>
                                    <th className="px-4 py-3">Department</th>
                                    <th className="px-4 py-3 rounded-tr-lg">Global Role</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profiles.length === 0 && (
                                    <tr><td colSpan={3} className="text-center py-6 text-gray-400">Loading users...</td></tr>
                                )}
                                {profiles.map(p => (
                                    <tr key={p.id} className="border-b border-gray-100 hover:bg-emerald-50/50 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-gray-800">{p.name || 'Unknown User'}</div>
                                            <div className="text-xs text-gray-500 font-mono truncate max-w-[200px]" title={p.id}>{p.id}</div>
                                        </td>
                                        <td className="px-4 py-3 text-gray-500">
                                            {p.department_id || 'N/A'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col gap-2">
                                                <select
                                                    className={`
                                                        border rounded px-2 py-1 outline-none text-xs font-bold uppercase tracking-wide
                                                        ${p.role === 'super_admin' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' :
                                                            p.role === 'department_admin' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                                                                p.role === 'faculty' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                                                                    'bg-emerald-50 border-emerald-200 text-emerald-700'}
                                                    `}
                                                    value={p.role}
                                                    onChange={(e) => handleRoleChange(p.id, e.target.value as UserRole, p.role === 'department_admin' ? p.department_id : undefined)}
                                                >
                                                    <option value="student">Student (Read-Only)</option>
                                                    <option value="faculty">Faculty</option>
                                                    <option value="department_admin">Department Admin</option>
                                                    <option value="super_admin">Super Admin</option>
                                                </select>

                                                {p.role === 'department_admin' && (
                                                    <select
                                                        className="border rounded px-2 py-1 outline-none text-xs text-gray-600 bg-gray-50 border-gray-200"
                                                        value={p.department_id || ''}
                                                        onChange={(e) => handleRoleChange(p.id, p.role, e.target.value)}
                                                    >
                                                        <option value="" disabled>Select Department</option>
                                                        {departments.map(d => (
                                                            <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                                                        ))}
                                                    </select>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ... (Existing Confirmation Modals Remain Unchanged) ... */}
                {/* --- CONFIRMATION MODAL (Delete OR Update) --- */}
                {confirmModalOpen && targetItem && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border-2 border-amber-100">
                            <div className="p-6">
                                <div className="flex items-center gap-4 mb-4 text-amber-600">
                                    <div className="p-3 bg-amber-50 rounded-full">
                                        <AlertOctagon size={32} />
                                    </div>
                                    <h3 className="text-xl font-bold text-gray-900">
                                        {confirmAction === 'delete' ? 'Confirm Deletion' : 'Confirm Availability Change'}
                                    </h3>
                                </div>

                                <p className="text-gray-700 mb-6">
                                    {confirmAction === 'delete' ? (
                                        <>Are you sure you want to delete <strong>{targetItem.name}</strong>? This cannot be undone.</>
                                    ) : (
                                        <>Updating availability for <strong>{targetItem.name}</strong> will create schedule conflicts.</>
                                    )}
                                </p>

                                {impactAnalysis.length > 0 ? (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
                                        <h4 className="font-bold text-amber-800 text-sm mb-2 flex items-center gap-2">
                                            <AlertTriangle size={14} /> Impact on Schedules
                                        </h4>
                                        <p className="text-xs text-amber-700 mb-3">
                                            The following scheduled sessions will be <strong>removed from the grid</strong> and moved to Unassigned:
                                        </p>
                                        <ul className="space-y-1 max-h-40 overflow-y-auto">
                                            {impactAnalysis.map(impact => (
                                                <li key={impact.projectId} className="text-xs flex justify-between border-b border-amber-100 pb-1 last:border-0">
                                                    <span className="font-medium">{impact.projectName}</span>
                                                    <span className="font-bold text-red-600">{impact.affectedCount} Sessions</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ) : (
                                    <div className="p-3 bg-green-50 border border-green-100 text-green-700 rounded-lg text-sm mb-6 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-green-500"></div> No active sessions currently use this resource.
                                    </div>
                                )}

                                <div className="flex justify-end gap-3">
                                    <button
                                        onClick={() => setConfirmModalOpen(false)}
                                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={executeConfirm}
                                        className={`px-4 py-2 text-white rounded font-medium shadow-sm ${confirmAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
                                    >
                                        {confirmAction === 'delete' ? 'Delete Permanently' : 'Apply & Unassign Conflicts'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- PROJECT SELECTION MODAL (For View Schedule) --- */}
                {projectSelectModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800">Select Project</h3>
                                <button onClick={() => setProjectSelectModalOpen(false)}><X size={20} className="text-gray-400" /></button>
                            </div>
                            <div className="p-2 max-h-80 overflow-y-auto">
                                {activeProjectsForRedirect.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            navigate(`/project/${p.id}?faculty=${redirectFacultyId}`);
                                        }}
                                        className="w-full text-left p-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 rounded-lg group transition-colors"
                                    >
                                        <div className="font-medium text-gray-800 group-hover:text-blue-700">{p.name}</div>
                                        <div className="text-xs text-gray-400 mt-1">Last updated: {new Date(p.updatedAt).toLocaleDateString()}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* --- MODALS (Room/Faculty Editors) --- */}

                {/* Room Modal */}
                {roomModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                                <h3 className="font-bold text-gray-800">{editingRoom ? 'Edit Room' : 'Add New Room'}</h3>
                                <button onClick={() => setRoomModalOpen(false)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Room Name</label>
                                    <input className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                                        value={roomForm.name} onChange={e => setRoomForm({ ...roomForm, name: e.target.value })} placeholder="e.g. CR-101" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Floor</label>
                                        <input type="number" className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                                            value={roomForm.floor} onChange={e => setRoomForm({ ...roomForm, floor: Number(e.target.value) })} />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
                                        <input type="number" className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                                            value={roomForm.capacity} onChange={e => setRoomForm({ ...roomForm, capacity: Number(e.target.value) })} />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                                    <select className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white text-gray-900"
                                        value={roomForm.type} onChange={e => setRoomForm({ ...roomForm, type: e.target.value as any })}>
                                        <option value="Lecture">Lecture Hall (Theory)</option>
                                        <option value="Lab">Laboratory</option>
                                        <option value="Tutorial">Tutorial Room</option>
                                        <option value="Event">Seminar/Event Hall</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50">
                                <button onClick={() => setRoomModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium">Cancel</button>
                                <button onClick={handleSaveRoom} className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700">Save Room</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Faculty Modal */}
                {facultyModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                                <h3 className="font-bold text-gray-800">{editingFaculty ? 'Edit Faculty' : 'Add New Faculty'}</h3>
                                <button onClick={() => setFacultyModalOpen(false)}><X size={20} className="text-gray-400 hover:text-gray-600" /></button>
                            </div>
                            <div className="p-6 space-y-6 overflow-y-auto">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                        <input className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-purple-500 outline-none bg-white text-gray-900"
                                            value={facForm.name} onChange={e => setFacForm({ ...facForm, name: e.target.value })} placeholder="e.g. Dr. John Doe" />
                                    </div>
                                    <div className="flex items-center pt-6">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" className="w-5 h-5 text-purple-600 rounded border-gray-300 focus:ring-purple-500 bg-white"
                                                checked={facForm.isVisitingFaculty} onChange={e => setFacForm({ ...facForm, isVisitingFaculty: e.target.checked })} />
                                            <span className="text-sm font-medium text-gray-700">Is Visiting Faculty?</span>
                                        </label>
                                    </div>
                                </div>

                                {/* Availability Matrix */}
                                {facForm.isVisitingFaculty && (
                                    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                        <h4 className="font-bold text-xs uppercase text-gray-500 mb-3 tracking-wide flex items-center gap-2">
                                            <AlertTriangle size={12} className="text-amber-500" /> Weekly Availability (Green = Available)
                                        </h4>
                                        <div className="overflow-x-auto">
                                            <div className="min-w-[500px]">
                                                <div className="grid grid-cols-[60px_repeat(10,1fr)] gap-1 mb-2">
                                                    <div className="text-[10px] text-gray-400 font-bold text-right pr-2">Day</div>
                                                    {TIME_SLOTS.map(ts => (
                                                        <div key={ts.id} className="text-[9px] text-center text-gray-400 font-medium rotate-0">{ts.startTime}</div>
                                                    ))}
                                                </div>
                                                {DAY_KEYS.map(day => (
                                                    <div key={day} className="grid grid-cols-[60px_repeat(10,1fr)] gap-1 mb-1 items-center">
                                                        <div className="text-xs font-bold text-gray-600 uppercase text-right pr-2">{day}</div>
                                                        {TIME_SLOTS.map((ts, idx) => {
                                                            const isAvail = facForm.availability?.[day]?.[idx] === 1;
                                                            return (
                                                                <div
                                                                    key={idx}
                                                                    onClick={() => toggleAvailability(day, idx)}
                                                                    className={`
                                                                h-8 rounded cursor-pointer transition-colors border
                                                                ${isAvail ? 'bg-green-500 border-green-600 hover:bg-green-600' : 'bg-white border-gray-200 hover:bg-gray-100'}
                                                            `}
                                                                    title={`${day.toUpperCase()} ${ts.label}: ${isAvail ? 'Available' : 'Unavailable'}`}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-gray-500 mt-2 italic">* Click cells to toggle availability.</p>
                                    </div>
                                )}
                            </div>
                            <div className="p-4 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 shrink-0">
                                <button onClick={() => setFacultyModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm font-medium">Cancel</button>
                                <button onClick={handleSaveFac} className="px-4 py-2 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700">Save Faculty</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};