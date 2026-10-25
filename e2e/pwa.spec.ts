import { test, expect } from '@playwright/test';
import PDFDocument from 'pdfkit';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';

async function syntheticExamPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'LETTER', margin: 54 });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.font('Helvetica').fontSize(16).text('INVENTED PRACTICE EXAM');
  doc.fontSize(11).text('Read each question and choose one answer.');
  doc.text('This invented example is only for software testing.');
  doc.moveDown(2);
  doc.fontSize(12).text('1. Which invented shape has four equal sides?');
  doc.text('A. Circle');
  doc.text('B. Rhombus');
  doc.text('C. Triangle');
  doc.text('D. Oval');
  doc.addPage();
  doc.fontSize(16).text('KEY');
  doc.moveDown(2);
  doc.fontSize(12).text('1.', 54, 120);
  doc.text('B', 74, 120);
  doc.text('A rhombus has four equal sides, so it matches the definition.', 54, 142);
  doc.end();
  return finished;
}

async function expectNoHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
  expect(widths.document, 'document width ' + widths.document + 'px exceeded viewport ' + widths.viewport + 'px').toBeLessThanOrEqual(widths.viewport);
}

test('mobile PWA installs, imports, studies, backs up, restores and works offline', async ({ page, context }, testInfo) => {
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toContain('/PetePrep/manifest.webmanifest');
  const manifest = await page.evaluate(async (href) => (await fetch(href!).then((response) => response.json())) as { display: string; scope: string; icons: { sizes: string }[] }, manifestHref);
  expect(manifest.display).toBe('standalone');
  expect(manifest.scope).toBe('/PetePrep/');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Your exams' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Import exam' }).click();
  const pdf = await syntheticExamPdf();
  await page.getByTestId('pdf-input').setInputFiles({ name: 'invented-practice-exam.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByRole('heading', { name: 'We read your exam' })).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Review questions' }).click();
  await expect(page.getByRole('heading', { name: 'Check your questions' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Continue to save' }).click();
  const acknowledgement = page.getByRole('checkbox', { name: /checked the flagged questions/i });
  if (await acknowledgement.count()) await acknowledgement.check();
  await page.getByRole('button', { name: 'Save exam' }).click();
  await expect(page.getByRole('heading', { name: 'Your exams' })).toBeVisible();

  await page.getByRole('button', { name: 'Practice INVENTED PRACTICE EXAM' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: /^A: Circle/ }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByTestId('bank-line')).toContainText('1 question is in your mistake bank');
  await expectNoHorizontalOverflow(page);
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Mistake bank' }).click();
  await page.getByRole('button', { name: 'Start mixed drill' }).click();
  await page.getByRole('button', { name: /^B: Rhombus/ }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await page.getByRole('button', { name: 'Drill the mistake bank again' }).click();
  await page.getByRole('button', { name: 'Start mixed drill' }).click();
  await page.getByRole('button', { name: /^B: Rhombus/ }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByTestId('all-clear')).toContainText('All clear');
  await page.getByRole('button', { name: 'Back to library', exact: true }).click();
  await page.getByRole('button', { name: 'Stats for INVENTED PRACTICE EXAM' }).click();
  await expect(page.getByText('Statistics', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Settings' }).click();
  await expectNoHorizontalOverflow(page);
  await expect(page.getByText(/Back up automatically after each session/)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Updates' })).toHaveCount(0);
  await expect(page.getByText(/On iPhone, use Share/)).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export backup/ }).click();
  const download = await downloadPromise;
  mkdirSync(testInfo.outputDir, { recursive: true });
  const backupPath = join(testInfo.outputDir, 'peteprep-backup.json');
  await download.saveAs(backupPath);
  await expect(page.getByRole('status')).toContainText('Backup saved');

  await page.getByRole('button', { name: /Reset all data/ }).click();
  await page.getByLabel(/Type DELETE to confirm/).fill('DELETE');
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('status')).toContainText('All exams and progress were deleted');
  await page.getByRole('button', { name: /Restore from backup/ }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /Choose backup file/ }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(backupPath);
  await expect(page.getByRole('status')).toContainText('Backup restored');
  await page.getByRole('button', { name: 'Go to library' }).click();
  await expect(page.getByRole('heading', { name: 'INVENTED PRACTICE EXAM' })).toBeVisible();

  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your exams' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 20_000 }).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Your exams' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'INVENTED PRACTICE EXAM' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await context.setOffline(false);
  expect(consoleErrors, testInfo.project.name + ' browser console errors').toEqual([]);
});
