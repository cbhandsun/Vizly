/** Launch each supported engine and verify a local DOM interaction, without network access. */
export async function probeBrowserRuntimes(engines) {
  const results = [];
  for (const name of ['chromium', 'firefox', 'webkit']) {
    let browser, context;
    const result = { name, status: 'failed' };
    try {
      browser = await engines[name].launch({ headless: true, timeout: 30000 });
      context = await browser.newContext();
      await context.route('**/*', route => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      await page.setContent('<input aria-label="Probe"><button onclick="document.querySelector(\'output\').textContent=document.querySelector(\'input\').value">Check</button><output></output>');
      await page.getByLabel('Probe').fill('vizly-browser-probe');
      await page.getByRole('button', { name: 'Check' }).click();
      if (await page.locator('output').textContent() !== 'vizly-browser-probe') throw Error('DOM probe failed');
      const version = browser.version();
      if (typeof version !== 'string' || !/^[\d.]{1,64}$/.test(version)) throw Error('Invalid browser version');
      result.version = version;
      result.status = 'passed';
    } catch {
      result.status = 'failed';
    } finally {
      try { await context?.close(); } catch { result.status = 'failed'; }
      try { await browser?.close(); } catch { result.status = 'failed'; }
    }
    results.push(result);
  }
  return { schema: 'vizly-browser-runtime-v1', status: results.every(result => result.status === 'passed') ? 'passed' : 'failed', engines: results };
}
