/** Validation ranges only: source precision and offsets remain untouched in the IR. */
export interface DateExtent {
    earliest: number;
    latest: number;
    clock: 'civil' | 'utc';
}
const leap = (year: number) => year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
const monthDays = (year: number, month: number) => [31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
const epoch = (year: number, month: number, day: number) => {
    const value = new Date(0);
    value.setUTCFullYear(year, month - 1, day);
    return value.getTime();
};

/** Supported draft subset: Gregorian year/month/day or second-precision timestamps,
 * optional 1–3 fractional digits and an optional explicit Z/UTC offset. */
export function dateExtent(value: string): DateExtent | undefined {
    const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?)?)?)?$/.exec(value);
    if (!match) return undefined;
    const [, y, m, d, h, min, s, fraction, zone] = match;
    const year = Number(y), month = m ? Number(m) : 1, day = d ? Number(d) : 1;
    if (year === 0 || month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) return undefined;
    const earliestDay = epoch(year, month, day);
    if (h === undefined) {
        const latest = !m ? epoch(year + 1, 1, 1) - 1 : !d ? (month === 12 ? epoch(year + 1, 1, 1) : epoch(year, month + 1, 1)) - 1 : earliestDay + 86_400_000 - 1;
        return { earliest: earliestDay, latest, clock: 'civil' };
    }
    const hour = Number(h), minute = Number(min), second = Number(s);
    if (hour > 23 || minute > 59 || second > 59) return undefined;
    let offset = 0;
    if (zone && zone !== 'Z') {
        const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4, 6));
        if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return undefined;
        offset = (zone[0] === '-' ? -1 : 1) * (hours * 60 + minutes) * 60_000;
    }
    const earliest = earliestDay + hour * 3_600_000 + minute * 60_000 + second * 1000 + Number((fraction ?? '').padEnd(3, '0')) - offset;
    return { earliest, latest: earliest + (fraction ? 10 ** (3 - fraction.length) : 1000) - 1, clock: zone ? 'utc' : 'civil' };
}

export function reversedInterval(start: string, end: string): boolean {
    const a = dateExtent(start), b = dateExtent(end);
    return !!a && !!b && a.clock === b.clock && a.earliest > b.latest;
}
