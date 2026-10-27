async page => {
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => requests.push(request.url()));
    await page.goto('http://127.0.0.1:3013/pair/');
    check(await page.locator('[data-items]>li').count() === 4, 'Four paired documents expected');
    await page.getByRole('link', { name: /Olga Schnitzler an Richard/ }).click();
    const letterUrl = page.url();
    check((await page.locator('main').innerText()).includes('[9. 6. 1909?]'), 'Source uncertainty wording must be visible');
    check((await page.locator('main').innerText()).includes('Compiler diagnostics (0)'), 'Letter must compile without diagnostics');
    check(!(await page.locator('section .transcript').allTextContents()).join('').includes('Die Datierung'), 'Commentary must stay out of running text');
    await page.getByRole('link', { name: 'Note 1', exact: true }).click();
    check((await page.locator(':target').innerText()).includes('Die Datierung'), 'Note link must land on the note');
    const noteUrl = page.url();
    await page.locator(':target').getByRole('link', { name: 'Donnerstag, 10. Juni 1909', exact: true }).click();
    check((await page.locator('h1').innerText()) === 'Donnerstag, 10. Juni 1909', 'Note must link to the supplied diary document');
    await page.goBack(); check(page.url() === noteUrl, 'Back must return to the linked note');
    await page.locator(':target').getByRole('link', { name: 'Source attachment point', exact: true }).click();
    check(await page.locator(':target').evaluate(node => !!node.closest('.transcript')), 'Attachment backlink must land in running text');
    await page.getByRole('link', { name: 'Note 2', exact: true }).click();
    check((await page.locator(':target').innerText()).includes('tant mieux'), 'Second note must retain French wording');
    await page.reload(); check((await page.locator(':target').innerText()).includes('tant mieux'), 'Reload must preserve note fragment');
    await page.setViewportSize({ width: 390, height: 844 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Mobile page must not overflow');
    await page.screenshot({ path: '/tmp/tei-paired-notes-mobile.png', fullPage: false });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(letterUrl);
    await page.screenshot({ path: '/tmp/tei-paired-letter-desktop.png', fullPage: false });
    const context = await page.context().browser().newContext({ javaScriptEnabled: false });
    try {
        const plain = await context.newPage();
        await plain.goto(letterUrl);
        await plain.getByRole('link', { name: 'Note 1', exact: true }).click();
        await plain.locator(':target').getByRole('link', { name: 'Donnerstag, 10. Juni 1909', exact: true }).click();
        check((await plain.locator('h1').innerText()) === 'Donnerstag, 10. Juni 1909', 'Linked commentary must work without JavaScript');
    } finally { await context.close(); }
    check(errors.length === 0, 'Runtime errors: ' + errors.join(', '));
    check(!requests.some(url => /\.(xml|json)(?:[?#]|$)/.test(url)), 'No XML or JSON requests');
    return { noteAttachments: true, crossEditionReference: true, sourceDateWording: true, history: true, noJavaScript: true, mobileOverflow: false, runtimeErrors: 0, xmlOrJsonRequests: 0 };
}
