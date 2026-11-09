import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";
import fixture from "../fixtures/legacy-monthly-report.json" with { type: "json" };
import { aggregateMonthlyEntries } from "../../src/modules/reports/aggregation";

type FixtureEntry = (typeof fixture.entries)[number];

const projects = new Map(fixture.projects.map((project) => [project.id, project]));
const entries = fixture.entries.map((entry) => {
  const project = projects.get(entry.projectId);
  assert.ok(project, `fixture project not found: ${entry.projectId}`);
  return {
    startedAt: new Date(entry.startedAt),
    endedAt: new Date(entry.endedAt),
    user: { id: entry.userId, displayName: entry.displayName },
    project: {
      id: project.id,
      name: project.projectName,
      client: { name: project.clientName },
    },
  };
});

function legacySecondsByProject(source: readonly FixtureEntry[], year: number, month: number) {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const project = new Map<string, Map<string, { hours: number; minutes: number }>>();
  for (const entry of source) {
    // myreport.cgi and myoldreport.cgi used:
    //   EndTime LIKE '$year-$month-%'
    if (!entry.endedAt.slice(0, 10).startsWith(prefix)) continue;
    const milliseconds = new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime();
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    // Date::Calc Delta_DHMS returned (days, hours, minutes, seconds), but the
    // original report discarded both days and seconds.
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const people = project.get(entry.projectId) ?? new Map();
    const person = people.get(entry.userId) ?? { hours: 0, minutes: 0 };
    person.hours += hours;
    person.minutes += minutes;
    people.set(entry.userId, person);
    project.set(entry.projectId, people);
  }
  return new Map(
    Array.from(project, ([projectId, people]) => [
      projectId,
      new Map(
        Array.from(people, ([userId, value]) => {
          // The CGI used `if ($minutes > 60)`, not `>= 60`.
          if (value.minutes > 60) {
            value.hours += Math.floor(value.minutes / 60);
            value.minutes %= 60;
          }
          return [userId, value.hours * 3_600 + value.minutes * 60];
        }),
      ),
    ]),
  );
}

test("legacy report fixture is synthetic and bound to the reviewed archive", async () => {
  const archive = await readFile(
    fileURLToPath(new URL(`../../${fixture.source.archive}`, import.meta.url)),
  );
  assert.equal(createHash("sha256").update(archive).digest("hex"), fixture.source.sha256);
  assert.ok(fixture.source.reports.every((path) => path.startsWith("ppts/reports/")));
  assert.ok(fixture.projects.every((project) => project.clientName.startsWith("Synthetic ")));
  assert.ok(fixture.entries.every((entry) => entry.userId.startsWith("legacy-user-")));
});

test("legacy reconciliation preserves ordinary monthly project and person totals", () => {
  const ordinary = fixture.entries.filter((entry) => entry.case === "ordinary-completed-entry");
  const legacy = legacySecondsByProject(ordinary, fixture.report.year, fixture.report.month);
  const modern = aggregateMonthlyEntries(
    entries.filter((_, index) => fixture.entries[index].case === "ordinary-completed-entry"),
    new Date(fixture.report.start),
    new Date(fixture.report.end),
  );
  assert.equal(legacy.get("legacy-project-7")?.get("legacy-user-alex"), 5_400);
  assert.equal(modern[0].people[0].seconds, fixture.expected.preservedOrdinaryEntrySeconds);
  assert.equal(modern[0].totalSeconds, fixture.expected.preservedOrdinaryEntrySeconds);
});

test("legacy reconciliation records intentional boundary, multi-day, and carry corrections", () => {
  const legacy = legacySecondsByProject(fixture.entries, fixture.report.year, fixture.report.month);
  const legacyPeople = legacy.get("legacy-project-7");
  assert.ok(legacyPeople);
  assert.deepEqual(
    Object.fromEntries(legacyPeople),
    fixture.expected.legacyDefects.reportedPeopleSeconds,
  );
  assert.equal(
    Array.from(legacyPeople.values()).reduce((sum, seconds) => sum + seconds, 0),
    fixture.expected.legacyDefects.reportedProjectTotalSeconds,
  );

  const modern = aggregateMonthlyEntries(
    entries,
    new Date(fixture.report.start),
    new Date(fixture.report.end),
  );
  assert.deepEqual(
    modern.map((group) => group.projectId),
    fixture.expected.modern.visibleProjectIds,
  );
  assert.equal(modern[0].totalSeconds, fixture.expected.modern.projectTotalSeconds);
  assert.deepEqual(
    Object.fromEntries(modern[0].people.map((person) => [person.userId, person.seconds])),
    fixture.expected.modern.peopleSeconds,
  );
  assert.deepEqual(fixture.expected.legacyDefects.excludedCases, ["ends-after-month"]);
  assert.equal(fixture.expected.legacyDefects.explanations.length, 3);
});
