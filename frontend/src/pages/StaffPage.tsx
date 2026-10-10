import { useParams } from 'react-router-dom'
import { DEPARTMENT_LABELS, DEPARTMENTS, type Department } from '../types/ticket'

export default function StaffPage() {
  const { department = '' } = useParams()
  const known = (DEPARTMENTS as readonly string[]).includes(department)
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <h1 className="text-3xl font-bold">
        {known ? DEPARTMENT_LABELS[department as Department] : 'Unknown department'}
      </h1>
      <p className="mt-2 text-slate-600">Live request queue</p>
    </main>
  )
}
