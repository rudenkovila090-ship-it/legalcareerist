// Dedicated entry point so a pasted shell environment assignment cannot select the wrong update.
process.env.SITE_RELIABILITY_MANIFEST = 'updates/material-manager/manifest.json'
await import('./install-site-reliability.mjs')
