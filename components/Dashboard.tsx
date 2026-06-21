

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Trash2, Calendar, Clock, ArrowRight, Layout, AlertTriangle, Settings2, LogOut } from 'lucide-react';
import { getProjects, createProject, deleteProject, getGlobalConstraints, saveGlobalConstraints, getAllDepartments } from '../services/db';
import { ProjectMeta, SchedulingConstraints, DeletionImpact, Department } from '../types';
import { GlobalConstraintsModal } from './GlobalConstraintsModal';
import { useAuth } from '../src/contexts/AuthContext';

export const Dashboard: React.FC = () => {
   const [projects, setProjects] = useState<ProjectMeta[]>([]);
   const [isCreating, setIsCreating] = useState(false);
   const [newName, setNewName] = useState('');
   const [newDeptId, setNewDeptId] = useState('');
   const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
   const [departments, setDepartments] = useState<Department[]>([]);

   // Constraints Modal
   const [isConstraintsOpen, setIsConstraintsOpen] = useState(false);
   const [currentConstraints, setCurrentConstraints] = useState<SchedulingConstraints>(getGlobalConstraints());

   const navigate = useNavigate();
   const { signOut, profile } = useAuth();
   const isStudent = profile?.role === 'student';
   const isSuperAdmin = profile?.role === 'super_admin';
   useEffect(() => {
      const loadData = async () => {
         const projList = await getProjects(profile?.role === 'department_admin' ? profile.department_id : undefined);
         setProjects(projList);

         if (profile?.role === 'super_admin') {
            const depts = await getAllDepartments();
            setDepartments(depts);
         }
      };
      loadData();
      setCurrentConstraints(getGlobalConstraints());
   }, []);

   const handleCreate = async () => {
      if (!newName.trim()) return;
      try {
         const targetDept = profile?.role === 'super_admin' ? (newDeptId || null) : (profile?.role === 'department_admin' ? profile.department_id : null);
         const id = await createProject(newName, undefined, targetDept);

         const updatedProjects = await getProjects(profile?.role === 'department_admin' ? profile.department_id : undefined);
         setProjects(updatedProjects);
         setIsCreating(false);
         setNewName('');
         setNewDeptId('');
         navigate(`/project/${id}`);
      } catch (err) {
         console.error("Error creating project:", err);
      }
   };

   const handleTrashClick = (id: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setProjectToDelete(id);
   };

   const confirmDelete = async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (projectToDelete) {
         await deleteProject(projectToDelete);
         const updatedProjects = await getProjects();
         setProjects(updatedProjects);
         setProjectToDelete(null);
      }
   };

   const cancelDelete = (e: React.MouseEvent) => {
      e.stopPropagation();
      setProjectToDelete(null);
   }

   const handleCardClick = (id: string, e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) {
         return;
      }
      navigate(`/project/${id}`);
   };

   const handleSaveConstraints = (newConstraints: SchedulingConstraints): DeletionImpact[] => {
      saveGlobalConstraints(newConstraints);
      setCurrentConstraints(newConstraints);
      // For Postgres MVP, we skip applying constraints retroactively to all projects simultaneously 
      // as it would require downloading and updating all schedules. They will apply on load.
      return [];
   };

   const handleSignOut = async () => {
      await signOut();
      navigate('/login');
   };

   return (
      <div className="min-h-screen bg-gray-50 p-8">
         <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
               <div>
                  <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
                  <p className="text-gray-500 mt-1">
                     Manage your academic schedules
                     {profile && <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full uppercase font-bold">{profile.role.replace('_', ' ')}</span>}
                  </p>
               </div>
               <div className="flex gap-4">
                  {isSuperAdmin && (
                     <button
                        onClick={() => setIsConstraintsOpen(true)}
                        className="px-4 py-2 bg-white border border-gray-300 rounded text-gray-700 font-medium hover:bg-gray-50 flex items-center gap-2 transition-colors"
                     >
                        <Settings2 size={18} /> Global Constraints
                     </button>
                  )}
                  {isSuperAdmin && (
                     <Link to="/resources" className="px-4 py-2 bg-white border border-gray-300 rounded text-gray-700 font-medium hover:bg-gray-50 flex items-center gap-2 transition-colors">
                        <Layout size={18} /> Global Resources
                     </Link>
                  )}
                  {!isStudent && (
                     <button
                        onClick={() => setIsCreating(true)}
                        className="px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 flex items-center gap-2 shadow-sm transition-all"
                     >
                        <Plus size={18} /> New Project
                     </button>
                  )}
                  <div className="h-8 w-px bg-gray-300 self-center mx-2"></div>
                  <button
                     onClick={handleSignOut}
                     className="px-4 py-2 bg-neutral-900 text-white rounded font-medium hover:bg-neutral-800 flex items-center gap-2 shadow-sm transition-all"
                  >
                     <LogOut size={16} /> Sign Out
                  </button>
               </div>
            </div>

            {isCreating && (
               <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-8 animate-in fade-in slide-in-from-top-4">
                  <h3 className="font-bold text-lg mb-4">Create New Project</h3>
                  <div className="flex gap-4">
                     <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Project Name (e.g., Summer 2024 - CS Dept)"
                        className="flex-1 border border-gray-300 rounded px-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                     />
                     {isSuperAdmin && (
                        <select
                           value={newDeptId}
                           onChange={(e) => setNewDeptId(e.target.value)}
                           className="border border-gray-300 rounded px-4 py-2 outline-none text-gray-700 bg-gray-50 text-sm"
                        >
                           <option value="">Global / No Dept</option>
                           {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                           ))}
                        </select>
                     )}
                     <button onClick={handleCreate} className="px-6 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700">
                        Create
                     </button>
                     <button onClick={() => setIsCreating(false)} className="px-6 py-2 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200">
                        Cancel
                     </button>
                  </div>
               </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               {projects.length === 0 && !isCreating && (
                  <div className="col-span-full py-20 text-center text-gray-400">
                     <Calendar size={48} className="mx-auto mb-4 opacity-30" />
                     <p>{isStudent || profile?.role === 'faculty' ? "No schedules available." : "No projects yet. Create one to get started."}</p>
                  </div>
               )}

               {projects.map((p) => (
                  <div
                     key={p.id}
                     onClick={(e) => handleCardClick(p.id, e)}
                     className="group block bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-blue-300 transition-all overflow-hidden relative cursor-pointer"
                  >
                     <div className="p-6">
                        <div className="flex justify-between items-start mb-4">
                           <div className="p-3 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                              <Calendar size={24} />
                           </div>
                           {!isStudent && (
                              <button
                                 type="button"
                                 onClick={(e) => handleTrashClick(p.id, e)}
                                 className="text-gray-400 hover:text-red-500 p-2 hover:bg-red-50 rounded-full transition-colors z-[30] relative border border-transparent hover:border-red-100"
                                 title="Delete Project"
                              >
                                 <Trash2 size={16} className="pointer-events-none" />
                              </button>
                           )}
                        </div>
                        <h3 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{p.name}</h3>
                        <div className="text-sm text-gray-500 flex items-center gap-4 mt-4">
                           <span className="flex items-center gap-1"><Clock size={14} /> {new Date(p.updatedAt).toLocaleDateString()}</span>
                        </div>
                     </div>
                     <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex justify-between items-center text-sm font-medium text-blue-600 group-hover:bg-blue-50 transition-colors">
                        Open Project <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                     </div>
                  </div>
               ))}
            </div>

            {/* Custom Delete Confirmation Modal */}
            {projectToDelete && (
               <div
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in zoom-in-95 duration-200"
                  onClick={cancelDelete}
               >
                  <div
                     className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden p-6"
                     onClick={(e) => e.stopPropagation()}
                  >
                     <div className="flex items-center gap-3 mb-4 text-red-600">
                        <div className="p-2 bg-red-50 rounded-full">
                           <AlertTriangle size={24} />
                        </div>
                        <h3 className="text-xl font-bold text-gray-900">Delete Project?</h3>
                     </div>
                     <p className="text-gray-600 mb-6">
                        Are you sure you want to delete this project? All schedules and data within it will be permanently lost.
                     </p>
                     <div className="flex justify-end gap-3">
                        <button
                           onClick={cancelDelete}
                           className="px-4 py-2 bg-gray-100 text-gray-700 rounded font-medium hover:bg-gray-200"
                        >
                           Cancel
                        </button>
                        <button
                           onClick={confirmDelete}
                           className="px-4 py-2 bg-red-600 text-white rounded font-medium hover:bg-red-700 shadow-sm"
                        >
                           Yes, Delete It
                        </button>
                     </div>
                  </div>
               </div>
            )}

            <GlobalConstraintsModal
               isOpen={isConstraintsOpen}
               onClose={() => setIsConstraintsOpen(false)}
               currentConstraints={currentConstraints}
               onSave={handleSaveConstraints}
            />
         </div>
      </div>
   );
};