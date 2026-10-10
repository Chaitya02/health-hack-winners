import { useParams } from 'react-router-dom'

export default function PatientPage() {
  const { roomId = '' } = useParams()
  return (
    <main className="min-h-screen bg-white p-6 text-2xl text-slate-900">
      <h1 className="text-4xl font-bold">Room {roomId}</h1>
      <p className="mt-4">How can we help you?</p>
    </main>
  )
}
