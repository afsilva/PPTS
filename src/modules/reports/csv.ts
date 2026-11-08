export type MonthlyReportGroup = {
  projectId: string;
  clientName: string;
  projectName: string;
  totalSeconds: number;
  people: Array<{ userId: string; displayName: string; seconds: number }>;
};

/**
 * Prevent spreadsheet applications from interpreting exported text as a
 * formula. A leading apostrophe is visible only in the formula bar in common
 * spreadsheet software and preserves the user's original display text.
 */
export function neutralizeSpreadsheetFormula(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export function csvCell(value: string | number) {
  const text = typeof value === "number" ? String(value) : neutralizeSpreadsheetFormula(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function monthlyReportCsv(
  groups: readonly MonthlyReportGroup[],
  input: { year: number; month: number; timeZone: string },
) {
  const rows: Array<Array<string | number>> = [
    ["Reporting year", input.year],
    ["Reporting month", input.month],
    ["Organization time zone", input.timeZone],
    [],
    ["Client", "Project", "Person", "Seconds", "Hours"],
  ];
  for (const group of groups) {
    for (const person of group.people)
      rows.push([
        group.clientName,
        group.projectName,
        person.displayName,
        person.seconds,
        (person.seconds / 3600).toFixed(2),
      ]);
    rows.push([
      group.clientName,
      group.projectName,
      "Project total",
      group.totalSeconds,
      (group.totalSeconds / 3600).toFixed(2),
    ]);
  }
  // UTF-8 BOM improves non-ASCII handling in desktop spreadsheet software.
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
