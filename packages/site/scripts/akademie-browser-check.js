async page => {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    const base = 'http://127.0.0.1:3014/akademie/';
    await page.goto(base);
    check(await page.locator('[data-items]>li').count() === 2, 'Two independently encoded meeting documents expected');
    await page.getByRole('searchbox').fill('1852-05-29');
    check(await page.locator('[data-items]>li:visible').count() === 1, 'Typed meeting date must be filterable');
    await page.locator('[data-items]>li:visible a').click();
    const documentUrl = page.url();
    check((await page.locator('h1').innerText()) === 'Gesamtsitzung am 29. Mai 1852', 'Meeting title must come from the declared source heading');
    check((await page.locator('.notice').innerText()).includes('6 source entries remain uncompiled'), 'Uncompiled choices must be prominent');
    check((await page.locator('main').innerText()).includes('Compiler diagnostics (8)'), 'Unsupported choices, zones and layout must stay visible');
    check((await page.locator('.transcript').first().innerText()).includes('◇'), 'Source markers must remain explicit');
    check(await page.getByRole('link', { name: 'Open facsimile resource', exact: true }).getAttribute('href') === 'https://diarium-images.acdh-dev.oeaw.ac.at/ga/Seite_NaN', 'Questionable source image identifier must not be silently repaired');
    await page.getByRole('link', { name: 'Entities', exact: true }).click();
    await page.locator('[data-items]>li').filter({ hasText: '#grillparzer-franz' }).getByRole('link').click();
    const entityUrl = page.url();
    check((await page.locator('h1').innerText()).includes('Grillparzer'), 'Explicit register name required');
    check(await page.locator('main>ul a').count() >= 2, 'Shared person identity must have occurrence backlinks');
    await page.locator('main>ul a').first().click();
    check(await page.locator(':target').evaluate(node => !!node.closest('.transcript')), 'Backlink must land in the text');
    await page.goBack(); check(page.url() === entityUrl, 'Back must return to the entity');
    await page.reload(); check((await page.locator('h1').innerText()).includes('Grillparzer'), 'Entity direct route must survive reload');
    await page.goto(documentUrl);
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Meeting page must not overflow horizontally');
    await page.screenshot({ path: '/tmp/tei-akademie-mobile.png', fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: '/tmp/tei-akademie-desktop.png', fullPage: false });
    const context = await page.context().browser().newContext({ javaScriptEnabled: false });
    try {
        const plain = await context.newPage();
        await plain.goto(documentUrl);
        check((await plain.locator('.notice').innerText()).includes('6 source entries remain uncompiled'), 'Incomplete reading must remain explicit without JavaScript');
        check((await plain.locator('.transcript').innerText()).includes('waren anwesend'), 'Source attendance wording must be readable without inferred roles');
    } finally { await context.close(); }
    check(errors.length === 0, 'Runtime errors: ' + errors.join(', '));
    check(!requests.some(url => /\.(xml|json)(?:[?#]|$)/.test(url)), 'No XML or JSON requests');
    return { meetingMetadata: true, incompleteReadingsExplicit: true, registerBacklinks: true, sourceImageIdentity: true, history: true, noJavaScript: true, mobileOverflow: false, xmlOrJsonRequests: 0, runtimeErrors: 0 };
}
