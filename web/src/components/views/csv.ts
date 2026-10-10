/** Quote all fields and protect text cells from spreadsheet formula execution. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value == null ? 'N/A' : String(value)
  if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export function buildCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export function downloadText(filename: string, contents: string, type = 'text/csv;charset=utf-8;'): void {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  try { link.click() } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
