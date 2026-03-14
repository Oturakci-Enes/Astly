import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import Dashboard from './modules/dashboard/Dashboard';
import TaskManager from './modules/tasks/TaskManager';
import Messaging from './modules/messaging/Messaging';
import Settings from './modules/settings/Settings';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-astra-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return user ? children : <Navigate to="/login" />;
}

function ModuleRoute({ moduleId, children }) {
  const { hasAccess } = useAuth();
  if (!hasAccess(moduleId)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-astra-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<ModuleRoute moduleId="dashboard"><Dashboard /></ModuleRoute>} />
        <Route path="/tasks" element={<ModuleRoute moduleId="tasks"><TaskManager /></ModuleRoute>} />
        <Route path="/messaging" element={<ModuleRoute moduleId="messaging"><Messaging /></ModuleRoute>} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
