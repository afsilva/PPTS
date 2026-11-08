import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csvCell,
  monthlyReportCsv,
  neutralizeSpreadsheetFormula,
} from "../../src/modules/reports/csv";

test("CSV cells quote delimiters, quotes, and line breaks", () => {
  assert.equal(csvCell('Alpha, "Beta"\nGamma'), '"Alpha, ""Beta""\nGamma"');
});

test("spreadsheet formula prefixes are neutralized", () => {
  for (const value of ["=1+1", "+SUM(A1:A2)", "-2+3", "@cmd"])
    assert.equal(neutralizeSpreadsheetFormula(value), `'${value}`);
  assert.equal(neutralizeSpreadsheetFormula("Normal"), "Normal");
});

test("monthly report CSV includes timezone, stable rows, totals, and CRLF", () => {
  const csv = monthlyReportCsv(
    [
      {
        projectId: "project",
        clientName: "Client, Inc.",
        projectName: "=Project",
        totalSeconds: 3600,
        people: [{ userId: "user", displayName: "+Person", seconds: 3600 }],
      },
    ],
    { year: 2026, month: 3, timeZone: "America/New_York" },
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"Organization time zone","America\/New_York"\r\n/);
  assert.match(csv, /"Client, Inc\.","'=Project","'\+Person","3600","1\.00"/);
  assert.match(csv, /"Project total","3600","1\.00"\r\n$/);
});
