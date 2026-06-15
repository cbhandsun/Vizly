import { describe, expect, it } from 'vitest';
import {
    buildIconifySearchUrl,
    buildIconifySvgUrl,
    isSafeIconifyIconName,
    normalizeIconifyQuery,
    parseIconifySearchResponse,
} from '../iconifySecurity';

describe('iconifySecurity', () => {
    it('normalizes Iconify queries and builds bounded search URLs', () => {
        expect(normalizeIconifyQuery('  cloud<script>alert(1)</script> db  '))
            .toBe('cloud script alert 1 script db');

        const url = new URL(buildIconifySearchUrl({
            query: 'aws lambda&limit=999',
            collection: 'logos',
            limit: 500,
            start: -10,
        }));

        expect(url.origin + url.pathname).toBe('https://api.iconify.design/search');
        expect(url.searchParams.get('query')).toBe('aws lambda limit 999');
        expect(url.searchParams.get('collection')).toBe('logos');
        expect(url.searchParams.get('limit')).toBe('100');
        expect(url.searchParams.get('start')).toBe('0');
    });

    it('filters unsafe Iconify response names', () => {
        const parsed = parseIconifySearchResponse({
            total: 50_000,
            icons: [
                'logos:react',
                '../bad',
                'mdi:account-alert',
                'javascript:alert(1)',
                'bad:name:extra',
            ],
        }, 10);

        expect(parsed.icons).toEqual(['logos:react', 'mdi:account-alert']);
        expect(parsed.total).toBe(10_000);
    });

    it('validates icon names before rendering or URL construction', () => {
        expect(isSafeIconifyIconName('logos:aws-lambda')).toBe(true);
        expect(isSafeIconifyIconName('logos:aws/lambda')).toBe(false);
        expect(isSafeIconifyIconName('https://example.test/icon.svg')).toBe(false);

        expect(buildIconifySvgUrl('logos:aws-lambda'))
            .toBe('https://api.iconify.design/logos:aws-lambda.svg');
        expect(buildIconifySvgUrl('logos:aws/lambda')).toBeNull();
    });
});
