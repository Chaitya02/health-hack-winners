/** Horizontal bars for a handful of labelled values; one hue, value printed beside each bar. */
export function Bars({
  rows,
  format,
}: {
  rows: { label: string; value: number | null }[]
  format: (v: number) => string
}) {
  const max = Math.max(1, ...rows.map((r) => r.value ?? 0))
  return (
    <table className="mt-4 w-full border-separate border-spacing-y-1.5 text-left">
      <thead className="sr-only">
        <tr>
          <th>Label</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} title={`${r.label}: ${r.value == null ? 'no data yet' : format(r.value)}`}>
            <th scope="row" className="w-40 pr-3 align-middle text-sm font-normal text-pine-soft">
              {r.label}
            </th>
            <td className="align-middle">
              <div className="flex items-center gap-2">
                <div className="h-4 flex-1 rounded-r bg-curtain">
                  <div
                    className="h-4 rounded-r bg-care"
                    style={{ width: `${r.value ? Math.max(2, (100 * r.value) / max) : 0}%` }}
                  />
                </div>
                <span className="w-16 text-right text-sm font-bold tabular-nums">
                  {r.value == null ? '–' : format(r.value)}
                </span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
