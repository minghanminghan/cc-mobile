import pino from 'pino'

// In the browser, pino natively logs beautifully via the console.
// pino-pretty is technically best for stdout, but we can set up a nice
// configuration that works perfectly for the frontend.
export const log = pino({
    level: import.meta.env.VITE_LOG_LEVEL || 'debug',
    browser: {
        asObject: false
    }
})
