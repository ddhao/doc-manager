import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import DashboardPage from './pages/dashboard/DashboardPage';
import IncomingPage from './pages/incoming/IncomingPage';
import OutgoingPage from './pages/outgoing/OutgoingPage';
import MeetingsPage from './pages/meetings/MeetingsPage';
import UnitsPage from './pages/units/UnitsPage';
import DepartmentsPage from './pages/departments/DepartmentsPage';
import ContactsPage from './pages/contacts/ContactsPage';
import ConfigPage from './pages/config/ConfigPage';
import ArchivesPage from './pages/archives/ArchivesPage';
import ArchiveRecordsPage from './pages/archives/ArchiveRecordsPage';
import BackupPage from './pages/backup/BackupPage';
import TemplatePage from './pages/templates/TemplatePage';

export default function Router() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/incoming" element={<IncomingPage />} />
        <Route path="/outgoing" element={<OutgoingPage />} />
        <Route path="/meetings" element={<MeetingsPage />} />
        <Route path="/units" element={<UnitsPage />} />
        <Route path="/departments" element={<DepartmentsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/archives" element={<ArchivesPage />} />
        <Route path="/archives/records" element={<ArchiveRecordsPage />} />
        <Route path="/backup" element={<BackupPage />} />
        <Route path="/templates" element={<TemplatePage />} />
      </Route>
    </Routes>
  );
}
