async page => {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    const results = [];
    for (const base of ['http://127.0.0.1:3011/diary/', 'http://127.0.0.1:3012/']) {
        await page.goto(base);
        check(await page.locator('[data-items]>li').count() === 3, 'Three static document links required');
        await page.getByRole('searchbox').fill('1909-06-10');
        check(await page.locator('[data-items]>li:visible').count() === 1, 'Document filter must work');
        await page.locator('[data-items]>li:visible a').click();
        const documentUrl = page.url();
        check((await page.locator('.transcript').first().innerText()).includes('10/6'), 'Direct document must contain text');
        check(await page.getByRole('link', { name: 'Open facsimile resource' }).count() === 2, 'Facsimile resources missing');
        check((await page.locator('main').innerText()).includes('Compiler diagnostics (0)'), 'Source diagnostics must stay visible');
        await page.getByRole('link', { name: 'Entities', exact: true }).click();
        await page.locator('[data-items]>li').filter({ hasText: '#pmb10863' }).getByRole('link').click();
        const entityUrl = page.url();
        const registerName = (await page.locator('h1').innerText()) === 'Richard Beer-Hofmann';
        if (registerName) {
            check((await page.locator('main').innerText()).includes('Name from the supplied authority register'), 'Register name must have an explanation');
            await page.locator('main>details>summary').click();
            check((await page.getByRole('link', { name: 'Canonical source', exact: true }).getAttribute('href')).endsWith('/indices/listperson.xml'), 'Register name must link to the pinned register source');
        } else {
            check((await page.locator('h1').innerText()).includes('Richard (as written)'), 'Entity should display its recorded text form');
            check((await page.locator('main').innerText()).includes('No authority-register name was supplied'), 'Text-form fallback must be explained');
        }

        check((await page.locator('h2').innerText()) === 'Occurrences (3)', 'Repeated identity must have three backlinks');
        await page.locator('main>ul a').first().click();
        check(await page.locator(':target').count() === 1, 'Occurrence backlink must target a stable anchor');
        check(await page.locator(':target').evaluate(node => !!node.closest('.transcript')), 'Backlink must land in running text');
        const passageUrl = page.url();
        await page.goBack(); check(page.url() === entityUrl, 'Back must restore entity page');
        await page.goForward(); check(page.url() === passageUrl, 'Forward must restore passage');
        await page.reload(); check(await page.locator(':target').count() === 1, 'Reload must preserve direct fragment');
        await page.setViewportSize({ width: 390, height: 844 });
        check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page must not overflow');
        if (base.includes('3011')) await page.screenshot({ path: '/tmp/tei-static-site-mobile.png', fullPage: false });
        await page.setViewportSize({ width: 1440, height: 1000 });
        if (base.includes('3011')) await page.screenshot({ path: '/tmp/tei-static-site-desktop.png', fullPage: false });
        const context = await page.context().browser().newContext({ javaScriptEnabled: false });
        try {
            const plain = await context.newPage();
            await plain.goto(documentUrl);
            check((await plain.locator('.transcript').first().innerText()).includes('10/6'), 'Text must exist without JavaScript');
            await plain.getByRole('link', { name: 'Documents', exact: true }).click();
            check(await plain.locator('[data-items]>li').count() === 3, 'Overview must work without JavaScript');
            await plain.goto(entityUrl);
            check(await plain.locator('main>ul a').count() === 3, 'Entity backlinks must exist without JavaScript');
        } finally { await context.close(); }
        results.push({ base, directPages: true, filter: true, entityBacklinks: true, registerName, history: true, noJavaScript: true, mobileOverflow: false });
    }
    check(!requests.some(url => /\.(xml|json)(?:[?#]|$)/.test(url)), 'Static consumer must not request XML or JSON');
    check(errors.length === 0, 'Runtime errors: ' + errors.join(', '));
    return { results, xmlOrJsonRequests: 0, runtimeErrors: 0 };
}
