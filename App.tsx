

import React from 'react';
import { HashRouter as Router, Routes, Route, useParams } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { ProjectScheduler } from './components/ProjectScheduler';
import { GlobalResources } from './components/GlobalResources';
import { AuthProvider } from './src/contexts/AuthContext';
import { Login } from './src/components/auth/Login';
import { Signup } from './src/components/auth/Signup';
import { PrivateRoute } from './src/components/auth/PrivateRoute';

// Wrapper to force remount of ProjectScheduler when the project ID changes.
// This ensures that the state (including Undo/Redo history) is re-initialized properly.
const ProjectSchedulerWrapper = () => {
  const params = useParams();
  return <ProjectScheduler key={params.id} />;
};

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected Routes */}
          <Route path="/" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />

          <Route path="/resources" element={
            <PrivateRoute allowedRoles={['super_admin', 'department_admin']}>
              <GlobalResources />
            </PrivateRoute>
          } />

          <Route path="/project/:id" element={
            <PrivateRoute>
              <ProjectSchedulerWrapper />
            </PrivateRoute>
          } />
        </Routes>
      </AuthProvider>
    </Router>
  );
}
