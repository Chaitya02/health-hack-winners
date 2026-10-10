import { Route, Routes } from 'react-router-dom'
import AdminPage from './pages/AdminPage'
import HomePage from './pages/HomePage'
import PatientPage from './pages/PatientPage'
import StaffPage from './pages/StaffPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/patient/:roomId" element={<PatientPage />} />
      <Route path="/staff/:department" element={<StaffPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<HomePage />} />
    </Routes>
  )
}
