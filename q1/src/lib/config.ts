const params = new URLSearchParams(window.location.search);

/** Tests pass ?session=<uuid> so the server keeps each test's orders apart. */
export const SESSION_ID = params.get('session') ?? `manual-${crypto.randomUUID().slice(0, 8)}`;

/** ?unsafe=1 is the negative control for test d: malformed numbers are coerced silently. */
export const PARSE_MODE: 'strict' | 'unsafe' = params.get('unsafe') === '1' ? 'unsafe' : 'strict';

/** Every order ticket is for a fixed 500-lot so payload tampering is easy to see. */
export const DEFAULT_QUANTITY = '500';
