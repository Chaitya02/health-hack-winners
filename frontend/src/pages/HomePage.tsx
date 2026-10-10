import { Link } from 'react-router-dom'
import { DEPARTMENT_LABELS, DEPARTMENTS } from '../types/ticket'

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-3xl font-bold">Ting-ting — AI Call Bell Router</h1>
      <ul className="mt-6 space-y-2 text-lg">
        <li><Link className="text-care underline" to="/patient/401">Patient tablet — Room 401</Link></li>
        {DEPARTMENTS.map((d) => (
          <li key={d}><Link className="text-care underline" to={`/staff/${d}`}>{DEPARTMENT_LABELS[d]} dashboard</Link></li>
        ))}
        <li><Link className="text-care underline" to="/admin">Admin / Impact</Link></li>
      </ul>
    </main>
  )
}
