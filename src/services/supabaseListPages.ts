export const SUPABASE_LIST_PAGE_SIZE = 500;
const MAX_LIST_ROWS = 100_000;
const MAX_LIST_PAGES = 1000;

export interface SupabaseListPage {
    data: unknown;
    error: unknown;
}

/** Advance by returned rows: a server may cap responses below the requested range. */
export async function collectSupabaseListPages(
    fetchPage: (from: number, to: number) => PromiseLike<SupabaseListPage>,
): Promise<unknown[]> {
    const rows: unknown[] = [];
    const seenIds = new Set<string>();
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
        const { data, error } = await fetchPage(rows.length, rows.length + SUPABASE_LIST_PAGE_SIZE - 1);
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Supabase returned an invalid list page.');
        if (data.length > SUPABASE_LIST_PAGE_SIZE) throw new Error('Supabase list page exceeds the row limit.');
        if (data.length === 0) return rows;
        if (rows.length + data.length > MAX_LIST_ROWS) throw new Error('Supabase listing exceeds the row limit.');
        for (const row of data) {
            if (typeof row !== 'object' || row === null || !('id' in row) || typeof row.id !== 'string' || !row.id) continue;
            if (seenIds.has(row.id)) throw new Error('Supabase listing repeated a row. Refresh the list and try again.');
            seenIds.add(row.id);
        }
        rows.push(...data);
    }
    throw new Error('Supabase listing exceeds the page limit.');
}
