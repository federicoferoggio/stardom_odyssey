/*
 * BrowserCache
 * Simple localStorage-backed cache with expiry and a fetch-and-cache helper.
 * Default TTL: 1 day (configurable per instance or per-call).
 *
 * Usage examples:
 *
 * // In a browser script tag after including cache.js:
 * const cache = new BrowserCache('stardom', 1); // namespace 'stardom', default TTL 1 day
 * // store value
 * cache.set('timeline', eventsArray);
 * // read value
 * const events = cache.get('timeline');
 *
 * // fetch and cache JSON response (key defaults to the URL)
 * const events = await cache.fetchAndCache('https://example.com/data.json');
 *
 */

(function(global){
    'use strict';

    const MS_PER_DAY = 24 * 60 * 60 * 1000;

    class BrowserCache {
        /**
         * Create a BrowserCache
         * @param {string} namespace - prefix for localStorage keys to avoid collisions
         * @param {number} defaultTTLDays - default TTL in days (1 by default)
         */
        constructor(namespace = 'bc', defaultTTLDays = 1) {
            this.ns = String(namespace);
            this.defaultTTLms = Number(defaultTTLDays) * MS_PER_DAY;
            if (isNaN(this.defaultTTLms) || this.defaultTTLms <= 0) {
                this.defaultTTLms = MS_PER_DAY;
            }
        }

        _makeKey(key) {
            return `${this.ns}:${String(key)}`;
        }

        _now() {
            return Date.now();
        }

        /**
         * Set a value in the cache.
         * @param {string} key
         * @param {*} value - JSON-serializable value
         * @param {object} [opts] - { ttlDays:number } optional TTL override in days
         */
        set(key, value, opts = {}) {
            const ttlDays = opts.ttlDays;
            const ttlMs = (typeof ttlDays === 'number') ? ttlDays * MS_PER_DAY : this.defaultTTLms;
            const payload = {
                expires: this._now() + ttlMs,
                value: value
            };
            const storeKey = this._makeKey(key);
            try {
                localStorage.setItem(storeKey, JSON.stringify(payload));
                return true;
            } catch (err) {
                // Could be quota exceeded or storage disabled
                console.error('BrowserCache: failed to set item', err);
                return false;
            }
        }

        /**
         * Get a value from the cache. Returns fallback if missing or expired.
         * @param {string} key
         * @param {*} [fallback=null]
         */
        get(key, fallback = null) {
            const info = this.getWithExpiryInfo(key);
            if (!info || info.isExpired) return fallback;
            return info.value;
        }

        /**
         * Get item with expiry metadata.
         * @param {string} key
         * @returns {{value:*,expires:number,isExpired:boolean}|null}
         */
        getWithExpiryInfo(key) {
            const storeKey = this._makeKey(key);
            try {
                const raw = localStorage.getItem(storeKey);
                if (!raw) return null;
                const parsed = JSON.parse(raw);
                const expires = Number(parsed && parsed.expires) || 0;
                const value = parsed && parsed.value;
                const isExpired = this._now() > expires;
                if (isExpired) {
                    // remove expired key
                    try { localStorage.removeItem(storeKey); } catch (e) { /* ignore */ }
                    return { value: null, expires, isExpired: true };
                }
                return { value, expires, isExpired: false };
            } catch (err) {
                console.error('BrowserCache: failed to get item', err);
                return null;
            }
        }

        /**
         * Returns true if key exists and is not expired
         */
        has(key) {
            const info = this.getWithExpiryInfo(key);
            return !!(info && !info.isExpired);
        }

        /**
         * Delete a cached key
         */
        delete(key) {
            const storeKey = this._makeKey(key);
            try {
                localStorage.removeItem(storeKey);
                return true;
            } catch (err) {
                console.error('BrowserCache: failed to remove item', err);
                return false;
            }
        }

        /**
         * List all keys in this namespace
         */
        keys() {
            const prefix = `${this.ns}:`;
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf(prefix) === 0) {
                    keys.push(k.substring(prefix.length));
                }
            }
            return keys;
        }

        /**
         * Clear all keys for this namespace
         */
        clear() {
            try {
                const prefix = `${this.ns}:`;
                // Collect keys to remove to avoid modifying storage while iterating
                const toRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.indexOf(prefix) === 0) toRemove.push(k);
                }
                toRemove.forEach(k => localStorage.removeItem(k));
                return true;
            } catch (err) {
                console.error('BrowserCache: failed to clear namespace', err);
                return false;
            }
        }

        /**
         * Fetch a URL and cache its response.
         * If a cached (non-expired) value exists, it's returned instead of fetching.
         * By default the cache key is the URL string.
         * The response is parsed as JSON if Content-Type includes "application/json", otherwise as text.
         * @param {string} url
         * @param {object} [fetchInit] - fetch() init object
         * @param {object} [opts] - { key: string|undefined, ttlDays: number|undefined }
         * @returns {Promise<*>} parsed response (JSON or text)
         */
        async fetchAndCache(url, fetchInit = undefined, opts = {}) {
            const key = opts.key || url;
            const ttlDays = opts.ttlDays;

            // Return cached if present
            const cached = this.getWithExpiryInfo(key);
            if (cached && !cached.isExpired) return cached.value;

            // Else fetch
            console.log("BrowserCache: fetching URL:", url);
            try {
                const resp = await fetch(url, fetchInit);
                if (!resp.ok) {
                    throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
                }
                const ct = resp.headers.get('content-type') || '';
                let parsed;
                if (ct.includes('application/json')) {
                    parsed = await resp.json();
                } else {
                    parsed = await resp.text();
                }

                // Attempt to store parsed result
                this.set(key, parsed, typeof ttlDays === 'number' ? { ttlDays } : {});
                return parsed;
            } catch (err) {
                console.error('BrowserCache: fetchAndCache failed', err);
                // If fetch fails and we had stale cached data return it (best-effort)
                if (cached && cached.value !== null) return cached.value;
                throw err;
            }
        }
    }

    // Export
    try {
        if (typeof module !== 'undefined' && module.exports) {
            module.exports = BrowserCache;
        } else {
            global.BrowserCache = BrowserCache;
        }
    } catch (e) {
        /* ignore export errors */
    }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
