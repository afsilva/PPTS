#!/usr/bin/env node
import assert from "node:assert/strict";
import process from "node:process";
import puppeteer from "puppeteer-core";

const app = process.env.APP_ORIGIN ?? "http://localhost:3000";
const executablePath =
  process.env.CHROME_PATH ??
  (process.platform === "darwin"
    ? "/Applications/Chromium.app/Contents/MacOS/Chromium"
    : "/usr/bin/chromium");
const password = process.env.KEYCLOAK_ALEX_PASSWORD;
if (!password) throw new Error("KEYCLOAK_ALEX_PASSWORD is required");

const suffix = `${Date.now()}-${process.pid}`;
const names = {
  client: `Browser Client ${suffix}`,
  clientUpdated: `Browser Client Updated ${suffix}`,
  status: `Browser Status ${suffix}`,
  statusUpdated: `Browser Status Updated ${suffix}`,
  code: `Browser Code ${suffix}`,
  person: `Browser Person ${suffix}`,
  personUpdated: `Browser Person Updated ${suffix}`,
  project: `Browser Project ${suffix}`,
  projectUpdated: `Browser Project Updated ${suffix}`,
  journal: `Browser journal ${suffix}`,
};

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ["--no-first-run", "--disable-background-networking"],
});
const page = await browser.newPage();
page.setDefaultTimeout(15_000);
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("requestfailed", (request) => {
  const url = new URL(request.url());
  const reason = request.failure()?.errorText ?? "failed";
  // Full-document mutations deliberately replace the current App Router page;
  // Chromium cancels speculative RSC prefetches from that old document.
  if (reason === "net::ERR_ABORTED" && url.searchParams.has("_rsc")) return;
  failedRequests.push(`${request.method()} ${request.url()} ${reason}`);
});
page.on("dialog", (dialog) => dialog.accept());

let passed = 0;
function ok(description) {
  passed += 1;
  console.log(`ok   - ${description}`);
}

async function waitForText(text) {
  await page.waitForFunction((value) => document.body.innerText.includes(value), {}, text);
}

async function field(formSelector, name, value) {
  const selector = `${formSelector} [name="${name}"]`;
  await page.waitForSelector(selector);
  await page.$eval(
    selector,
    (element, nextValue) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
        element.value = String(nextValue);
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      } else if (element instanceof HTMLSelectElement) {
        const exact = [...element.options].find(
          (option) => option.value === nextValue || option.textContent?.trim() === nextValue,
        );
        if (!exact) throw new Error(`Option not found: ${nextValue}`);
        element.value = exact.value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
    },
    value,
  );
}

let pendingSequence = 0;
async function submit(formSelector, pendingLabel, destinationText = null) {
  const button = `${formSelector} button[type="submit"]`;
  await page.waitForSelector(button);
  const binding = `pptsPendingPainted${pendingSequence++}`;
  let resolvePending;
  const pendingPainted = new Promise((resolve) => {
    resolvePending = resolve;
  });
  await page.exposeFunction(binding, () => resolvePending());
  await page.evaluate(
    (selector, expected, bindingName) => {
      const buttonElement = document.querySelector(selector);
      const observer = new MutationObserver(() => {
        if (buttonElement?.textContent?.includes(expected)) {
          observer.disconnect();
          requestAnimationFrame(() => window[bindingName]());
        }
      });
      observer.observe(buttonElement, { childList: true, subtree: true });
    },
    button,
    pendingLabel,
    binding,
  );
  const navigation = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.click(button);
  await pendingPainted;
  ok(`browser paints “${pendingLabel}” before navigation`);
  await navigation;
  if (destinationText) {
    await waitForText(destinationText);
    ok(`browser refreshes authoritative state with “${destinationText}”`);
  } else {
    ok("browser completes the mutation with a full-document refresh");
  }
}

function formByHeading(_heading, action) {
  return `form[action="${action}"]`;
}
function formBySection(_section, action) {
  return `form[action="${action}"]`;
}
function rowForm(value, action) {
  return `form[action="${action}"]:has(input[value="${value}"])`;
}
function workCodeForm(value, action) {
  return `[data-work-code="${value}"] > form[action="${action}"]`;
}

try {
  await page.goto(`${app}/auth/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[name="username"]');
  await page.type('input[name="username"]', "alex.admin");
  await page.type('input[name="password"]', password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click('input[type="submit"], button[type="submit"]'),
  ]);
  await waitForText("Alex Morgan");
  ok("administrator authenticates through the real Keycloak browser flow");

  let form = formByHeading("Add client", "/api/catalog/clients");
  await field(form, "name", names.client);
  await submit(form, "Adding client…", names.client);

  form = formByHeading("Add project status", "/api/catalog/statuses");
  await field(form, "name", names.status);
  await field(form, "description", "Browser-created status");
  await submit(form, "Adding status…", names.status);

  form = formByHeading("Add work code", "/api/catalog/work-codes");
  await field(form, "name", names.code);
  await field(form, "description", "Browser-created code");
  await submit(form, "Adding code…", names.code);

  form = formByHeading("Add project", "/api/catalog/projects");
  await field(form, "clientId", names.client);
  await field(form, "statusId", names.status);
  await field(form, "name", names.project);
  await field(form, "description", "Browser-created project");
  await field(form, "billingRate", "123.45");
  await submit(form, "Adding project…", names.project);

  await page.goto(`${app}/catalog`, { waitUntil: "networkidle0" });
  await waitForText("Catalog administration");
  ok("catalog administration page hydrates under nonce CSP");

  form = rowForm(names.client, "/api/catalog/clients/update");
  await field(form, "name", names.clientUpdated);
  await submit(form, "Saving…", names.clientUpdated);

  form = rowForm(names.status, "/api/catalog/statuses/update");
  await field(form, "name", names.statusUpdated);
  await field(form, "description", "Browser-updated status");
  await submit(form, "Saving…", names.statusUpdated);

  form = rowForm(names.code, "/api/catalog/work-codes/update");
  await field(form, "description", "Browser-updated code");
  await submit(form, "Saving…", "Your change was saved.");
  await page.waitForFunction(
    (name) => {
      const input = [...document.querySelectorAll('input[name="name"]')].find(
        (element) => element.value === name,
      );
      return (
        input?.closest("form")?.querySelector('input[name="description"]')?.value ===
        "Browser-updated code"
      );
    },
    {},
    names.code,
  );
  ok("work-code description update is rendered from persisted state");

  form = workCodeForm(names.code, "/api/catalog/work-codes/state?returnTo=/catalog");
  await submit(form, "Updating…");
  await page.goto(`${app}/catalog`, { waitUntil: "networkidle0" });
  assert.equal(
    await page.$eval(
      workCodeForm(names.code, "/api/catalog/work-codes/state?returnTo=/catalog"),
      (stateForm) => stateForm.querySelector('button[type="submit"]')?.textContent?.trim(),
    ),
    "Activate",
  );
  ok("work-code deactivation is visible after the browser mutation");

  form = workCodeForm(names.code, "/api/catalog/work-codes/state?returnTo=/catalog");
  await submit(form, "Updating…");
  await page.goto(`${app}/catalog`, { waitUntil: "networkidle0" });
  assert.equal(
    await page.$eval(
      workCodeForm(names.code, "/api/catalog/work-codes/state?returnTo=/catalog"),
      (stateForm) => stateForm.querySelector('button[type="submit"]')?.textContent?.trim(),
    ),
    "Deactivate",
  );
  ok("work-code reactivation is visible after the browser mutation");

  await page.goto(`${app}/people`, { waitUntil: "networkidle0" });
  await waitForText("People and contacts");
  form = formBySection("Add person", "/api/people");
  await field(form, "kind", "External contact");
  await field(form, "displayName", names.person);
  await field(form, "title", "Browser tester");
  await submit(form, "Adding person…", names.person);

  form = rowForm(names.person, "/api/people/update");
  await field(form, "displayName", names.personUpdated);
  await field(form, "workPhone", "+1 555 0100");
  await submit(form, "Saving profile…", names.personUpdated);

  await page.goto(`${app}/catalog`, { waitUntil: "networkidle0" });
  const href = await page.evaluate((projectName) => {
    const link = [...document.querySelectorAll('a[href^="/projects/"]')].find((candidate) =>
      candidate.closest("div")?.innerText.includes(projectName),
    );
    return link?.getAttribute("href") ?? null;
  }, names.project);
  assert.ok(href, "created project link was not rendered");
  await page.goto(new URL(href, app).href, { waitUntil: "networkidle0" });
  await waitForText(names.project);
  ok("created project opens through its browser-facing detail page");

  form = 'form[action="/api/projects/update"]';
  await field(form, "name", names.projectUpdated);
  await field(form, "languages", "TypeScript");
  await field(form, "modules", "Next.js, Prisma");
  await field(form, "developmentContactId", names.personUpdated);
  await field(form, "estimatedCodingMinutes", "480");
  await submit(form, "Saving project…", names.projectUpdated);

  form = `form[action^="/api/projects/logs?"]`;
  await field(form, "body", names.journal);
  await submit(form, "Adding entry…", names.journal);

  form = 'form[action="/api/projects/update"]';
  await field(form, "developmentContactId", "");
  await submit(form, "Saving project…", names.projectUpdated);
  ok("browser clears the project contact before contact archival");

  await page.goto(`${app}/catalog`, { waitUntil: "networkidle0" });
  form = `form[data-client="${names.clientUpdated}"]`;
  await submit(form, "Archiving…", names.clientUpdated);
  await page.waitForFunction(
    (name) =>
      document.body.innerText.includes(`${name}`) && document.body.innerText.includes("archived"),
    {},
    names.clientUpdated,
  );
  ok("browser confirms and archives the client without losing historical project data");

  await page.goto(`${app}/people`, { waitUntil: "networkidle0" });
  form = `form[data-person="${names.personUpdated}"]`;
  await submit(form, "Archiving…", `${names.personUpdated} · archived`);
  ok("browser confirms and archives the contact profile");

  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(" | ")}`);
  assert.deepEqual(consoleErrors, [], `console errors: ${consoleErrors.join(" | ")}`);
  assert.deepEqual(failedRequests, [], `failed requests: ${failedRequests.join(" | ")}`);
  ok("browser reports no console errors, page errors, or failed requests");
  console.log(`\nBrowser parity: ${passed} passed, 0 failed`);
} finally {
  await browser.close();
}
