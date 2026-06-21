import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, UserRole } from '../../contexts/AuthContext';

interface PrivateRouteProps {
    children: React.ReactNode;
    allowedRoles?: UserRole[];
}

export function PrivateRoute({ children, allowedRoles }: PrivateRouteProps) {
    const { session, profile, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
                <div className="text-white text-xl animate-pulse font-light tracking-widest">
                    LOADING...
                </div>
            </div>
        );
    }

    if (!session) {
        // Redirect to login if not authenticated
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles && profile && !allowedRoles.includes(profile.role)) {
        // Redirect to dashboard (or an unauthorized page) if they don't have the right role
        return <Navigate to="/" replace />;
    }

    // If authenticated and authorized, render the children
    return <>{children}</>;
}
