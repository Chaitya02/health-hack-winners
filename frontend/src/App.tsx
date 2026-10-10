import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import AdminPage from './pages/AdminPage'
import PatientPage from './pages/PatientPage'
import StaffPage from './pages/StaffPage'

// Old /staff/<dept> links (bookmarks, printed QR codes) keep working.
function LegacyStaffRedirect() {
  const { department = '' } = useParams()
  return <Navigate to={`/${department}`} replace />
}

export default function App() {
  return (
    <Routes>
      {/* Home is the bedside screen for this device's room (VITE_DEFAULT_ROOM, default 401). */}
      <Route path="/" element={<PatientPage />} />
      <Route path="/patient/:roomId" element={<PatientPage />} />
      <Route path="/admin" element={<AdminPage />} />
      {/* /nursing, /housekeeping, /food, /it. Static routes like /admin rank above this one. */}
      <Route path="/:department" element={<StaffPage />} />
      <Route path="/staff/:department" element={<LegacyStaffRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
