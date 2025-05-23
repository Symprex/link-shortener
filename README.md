# Symprex Link Shortener

This repository houses our link shortening service used throughout the company to provide
simple, static, rewritable links.

This is a fork of [Sink.Cool](https://sink.cool), with the following changes:

 - KV binding updated in wrangler.jsonc
 - Wrangler/Worker name updated

## Deployment

Deployment happens automatically through Cloudflare Worker Builds when our `master`
branch is updated.

The project can be found at https://dash.cloudflare.com/93686db668e1fd06177661df08f7c0cd/workers/services/view/symprex-link-shortener/

The link shortener service itself is hosted at https://go.symprex.com/
