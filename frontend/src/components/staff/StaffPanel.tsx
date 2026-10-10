import type { StaffStatus, StaffView } from '../../types/ticket'
import { ScheduleTimeline, scheduleWindow, TimeAxis } from './ScheduleTimeline'

export const STATUS_LABEL: Record<StaffStatus, string> = { available: 'Available', break: 'On break', off: 'Off shift' }
export const STATUS_STYLE: Record<StaffStatus, string> = {
  available: 'bg-fresh-tint text-fresh',
  break: 'bg-wait-tint text-wait',
  off: 'bg-curtain-deep text-pine-soft',
}

const clock = (iso: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

/** Who's on today: status now, open tasks, and the shift timeline. New requests go to whoever
 * is available with the fewest open tasks. */
export function StaffPanel({ staff, now, waiting }: { staff: StaffView[]; now: number; waiting: number }) {
  const window = scheduleWindow(staff.map((s) => s.schedule))
  return (
    <section aria-labelledby="schedule" className="rounded-2xl border-2 border-line bg-paper p-4" data-testid="staff-panel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="schedule" className="text-lg font-bold">
          Today’s schedule
        </h2>
        {waiting > 0 && (
          <span className="rounded-full bg-wait-tint px-2 py-0.5 text-sm font-bold text-wait" data-testid="waiting-count">
            {waiting} waiting for someone available
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-3">
        {staff.map((s) => (
          <li key={s.staff_id} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[12rem_minmax(0,1fr)]" data-testid="staff-member">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">{s.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-sm font-bold ${STATUS_STYLE[s.status]}`} data-testid="staff-status">
                {STATUS_LABEL[s.status]}
              </span>
              <span className="text-sm text-pine-soft" data-testid="staff-load">
                {s.open_tasks} open{s.status_until ? ` · until ${clock(s.status_until)}` : ''}
              </span>
            </div>
            <ScheduleTimeline schedule={s.schedule} now={now} window={window} />
          </li>
        ))}
      </ul>
      <div className="sm:ml-[13rem]">
        <TimeAxis window={window} />
      </div>
    </section>
  )
}
