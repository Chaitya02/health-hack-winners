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
    <section aria-label="Today’s schedule" data-testid="staff-panel">
      {waiting > 0 && (
        <p className="mb-3 w-fit rounded-full bg-wait-tint px-3 py-1 text-sm font-bold text-wait" data-testid="waiting-count">
          {waiting} waiting for someone available
        </p>
      )}
      <ul className="space-y-3">
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
