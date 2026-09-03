import type { LinkFile } from './validate-links.ts'
import { Buffer } from 'node:buffer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildAlgNoneAccessToken,
  buildJunkAccessToken,
  buildUnsignedAccessToken,
  checkAccessWiredUp,
  checkAdminRefused,
  checkBodyExcludesStatistics,
  checkLocation,
  checkNeverExposedToAccess,
  checkNoStore,
  checkStatus,
  expectedRedirects,
  runAdminChecks,
  summarize,
} from './verify-deployment.ts'

describe('checkStatus', () => {
  it('passes when the observed status matches', () => {
    expect(checkStatus('name', 404, 404)).toEqual({ name: 'name', status: 'PASS', detail: '404' })
  })

  it('fails and names both statuses when they differ', () => {
    const result = checkStatus('name', 404, 200)
    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('404')
    expect(result.detail).toContain('200')
  })
})

describe('checkAdminRefused', () => {
  it('passes on 403 and reports it as the Worker guard', () => {
    const result = checkAdminRefused('name', 403, null)
    expect(result.status).toBe('PASS')
    expect(result.detail).toContain('403')
  })

  it('passes on a 302 to the team Access login and reports it as a login redirect', () => {
    const result = checkAdminRefused(
      'name',
      302,
      'https://symprex.cloudflareaccess.com/cdn-cgi/access/login',
    )
    expect(result.status).toBe('PASS')
    expect(result.detail).toMatch(/access/i)
    expect(result.detail).toContain('symprex.cloudflareaccess.com')
  })

  it('fails loudly on 200 — the dangerous success case', () => {
    const result = checkAdminRefused('name', 200, null)
    expect(result.status).toBe('FAIL')
    expect(result.detail).toMatch(/SECURITY/i)
    expect(result.detail).toContain('exposed')
  })

  it('fails a 200 even when a stray Location header is present', () => {
    const result = checkAdminRefused('name', 200, 'https://symprex.cloudflareaccess.com/login')
    expect(result.status).toBe('FAIL')
    expect(result.detail).toMatch(/SECURITY/i)
  })

  it('fails on a 3xx to an unrelated host', () => {
    const result = checkAdminRefused('name', 302, 'https://example.com/somewhere-else')
    expect(result.status).toBe('FAIL')
  })

  it('fails on a 3xx to a lookalike host that merely contains cloudflareaccess.com', () => {
    const result = checkAdminRefused(
      'name',
      302,
      'https://evil-cloudflareaccess.com.attacker.test/phish',
    )
    expect(result.status).toBe('FAIL')
  })

  it('fails on any other status too', () => {
    expect(checkAdminRefused('name', 500, null).status).toBe('FAIL')
  })
})

describe('checkAccessWiredUp', () => {
  it('fails when every admin path answered 403 (a detached Access application still fails closed)', () => {
    const result = checkAccessWiredUp('name', [
      { status: 403, location: null },
      { status: 403, location: null },
      { status: 403, location: null },
    ])
    expect(result.status).toBe('FAIL')
    expect(result.detail).toMatch(/detached|not.*wired|no.*login redirect/i)
  })

  it('passes when at least one admin path was answered with a cloudflareaccess.com login redirect', () => {
    const result = checkAccessWiredUp('name', [
      { status: 403, location: null },
      { status: 302, location: 'https://symprex.cloudflareaccess.com/cdn-cgi/access/login' },
    ])
    expect(result.status).toBe('PASS')
  })

  it('fails when a redirect goes somewhere other than cloudflareaccess.com', () => {
    const result = checkAccessWiredUp('name', [
      { status: 302, location: 'https://example.com/somewhere-else' },
    ])
    expect(result.status).toBe('FAIL')
  })

  it('errors, not fails, when no admin request was ever answered — a verdict about Access cannot be drawn from zero answers', () => {
    const result = checkAccessWiredUp('name', [])
    expect(result.status).toBe('ERROR')
  })
})

describe('checkNoStore', () => {
  it('passes when Cache-Control is exactly no-store', () => {
    expect(checkNoStore('name', 'no-store').status).toBe('PASS')
  })

  it('passes when no-store is one directive among several, as Access sends it', () => {
    const result = checkNoStore(
      'name',
      'private, max-age=0, no-store, no-cache, must-revalidate, post-check=0, pre-check=0',
    )
    expect(result.status).toBe('PASS')
  })

  it('fails when the header is absent', () => {
    const result = checkNoStore('name', null)
    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('absent')
  })

  it('fails when the header allows caching', () => {
    expect(checkNoStore('name', 'public, max-age=3600').status).toBe('FAIL')
  })

  it('fails when a multi-directive header is missing no-store', () => {
    const result = checkNoStore('name', 'private, max-age=0, no-cache, must-revalidate')
    expect(result.status).toBe('FAIL')
  })
})

describe('checkLocation', () => {
  it('passes on an exact match', () => {
    expect(checkLocation('name', 'https://example.com/x', 'https://example.com/x').status).toBe(
      'PASS',
    )
  })

  it('fails when a query string has been appended', () => {
    const result = checkLocation('name', 'https://example.com/x', 'https://example.com/x?foo=bar')
    expect(result.status).toBe('FAIL')
  })

  it('fails when Location is absent', () => {
    expect(checkLocation('name', 'https://example.com/x', null).status).toBe('FAIL')
  })
})

describe('checkBodyExcludesStatistics', () => {
  it('passes on a plain refusal body', () => {
    expect(checkBodyExcludesStatistics('name', 'Forbidden', ['careers', 'status']).status).toBe(
      'PASS',
    )
  })

  it('fails when table markup leaked', () => {
    expect(checkBodyExcludesStatistics('name', '<table><tr>1</tr></table>', []).status).toBe(
      'FAIL',
    )
  })

  it('fails when the word Clicks leaked, case-insensitively', () => {
    expect(checkBodyExcludesStatistics('name', 'Total Clicks: 4', []).status).toBe('FAIL')
  })

  it('fails when SVG markup leaked', () => {
    expect(checkBodyExcludesStatistics('name', '<svg></svg>', []).status).toBe('FAIL')
  })

  it('fails when a slug name leaked', () => {
    expect(checkBodyExcludesStatistics('name', 'see careers for detail', ['careers']).status).toBe(
      'FAIL',
    )
  })

  it('passes when a slug is a live one but only appears as part of an unrelated word', () => {
    // Real slugs: careers, status, support. An Access login page saying a browser is
    // "unsupported" or listing "statuses" must not be read as the statistics table
    // leaking the support/status slug rows.
    const result = checkBodyExcludesStatistics(
      'name',
      'This browser is not supported. Please check the statuses of your extensions.',
      ['status', 'support'],
    )
    expect(result.status).toBe('PASS')
  })

  it('still fails when the slug appears as its own word, not just as a substring of another', () => {
    const result = checkBodyExcludesStatistics('name', 'see support for detail', ['support'])
    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('support')
  })
})

describe('checkNeverExposedToAccess', () => {
  it('passes on an ordinary redirect Worker response', () => {
    expect(checkNeverExposedToAccess('name', 301, 'https://www.symprex.com/careers').status).toBe(
      'PASS',
    )
  })

  it('fails loudly on 403 — Access wrongly applied to the redirect Worker', () => {
    const result = checkNeverExposedToAccess('name', 403, null)
    expect(result.status).toBe('FAIL')
    expect(result.detail).toMatch(/SECURITY/i)
  })

  it('fails loudly on a redirect to a cloudflareaccess.com login', () => {
    const result = checkNeverExposedToAccess(
      'name',
      302,
      'https://symprex.cloudflareaccess.com/cdn-cgi/access/login',
    )
    expect(result.status).toBe('FAIL')
    expect(result.detail).toMatch(/SECURITY/i)
  })

  it('passes on a 404', () => {
    expect(checkNeverExposedToAccess('name', 404, null).status).toBe('PASS')
  })
})

describe('summarize', () => {
  it('counts each status and is only ok when nothing failed or errored', () => {
    const results = [
      { name: 'a', status: 'PASS' as const, detail: '' },
      { name: 'b', status: 'PASS' as const, detail: '' },
      { name: 'c', status: 'FAIL' as const, detail: '' },
      { name: 'd', status: 'ERROR' as const, detail: '' },
    ]
    expect(summarize(results)).toEqual({ passed: 2, failed: 1, errored: 1, ok: false })
  })

  it('is ok with zero results', () => {
    expect(summarize([])).toEqual({ passed: 0, failed: 0, errored: 0, ok: true })
  })

  it('is ok when everything passed', () => {
    const results = [
      { name: 'a', status: 'PASS' as const, detail: '' },
      { name: 'b', status: 'PASS' as const, detail: '' },
    ]
    expect(summarize(results)).toEqual({ passed: 2, failed: 0, errored: 0, ok: true })
  })
})

describe('expectedRedirects', () => {
  it('reads slug and url straight out of each link file, independent of readLinkFiles ordering', () => {
    const files: LinkFile[] = [
      {
        filename: 'links/careers.json',
        content: JSON.stringify({
          id: 'kfde65bxsc',
          url: 'https://www.symprex.com/careers',
          slug: 'careers',
          createdAt: 1735689600,
          updatedAt: 1735689600,
        }),
      },
      {
        filename: 'links/status.json',
        content: JSON.stringify({
          id: 'gw94ym3tma',
          url: 'https://www.symprex.com/status',
          slug: 'status',
          createdAt: 1735862400,
          updatedAt: 1735862400,
        }),
      },
    ]
    expect(expectedRedirects(files)).toEqual([
      { slug: 'careers', url: 'https://www.symprex.com/careers' },
      { slug: 'status', url: 'https://www.symprex.com/status' },
    ])
  })
})

describe('forged access tokens', () => {
  it('the junk token is not shaped like a JWT at all', () => {
    expect(buildJunkAccessToken().split('.')).toHaveLength(1)
  })

  it('the unsigned token is a well-formed three-segment JWT claiming a real algorithm', () => {
    const token = buildUnsignedAccessToken()
    const segments = token.split('.')
    expect(segments).toHaveLength(3)
    const header = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'))
    expect(header.alg).toBe('RS256')
    const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'))
    expect(payload.email).toBe('attacker@example.com')
  })

  it('the alg:none token declares no signature and carries an empty signature segment', () => {
    const token = buildAlgNoneAccessToken()
    const segments = token.split('.')
    expect(segments).toHaveLength(3)
    const header = JSON.parse(Buffer.from(segments[0], 'base64url').toString('utf8'))
    expect(header.alg).toBe('none')
    expect(segments[2]).toBe('')
  })
})

// runAdminChecks drives the real HTTP path (fetchSafely -> checkAdminRequest), so this is
// the only place the four branches the deployed proof actually depends on can be exercised
// without a live Worker: a detached-Access run where every path only gets the Worker's own
// 403 guard, a run where at least one path gets a real Access login redirect, a run where a
// path is wrongly exposed with a 200, and a run where a request cannot be made at all.
describe('runAdminChecks (fetch stubbed)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function forbiddenResponse(): Response {
    return new Response('Forbidden', { status: 403, headers: { 'cache-control': 'no-store' } })
  }

  it('fails the wired-up assertion when every admin path only ever sees the Worker\'s own 403 — a detached Access application must not read as green', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => forbiddenResponse()),
    )

    const results = await runAdminChecks('https://admin.example.test', ['careers'], 1000)

    const wired = results.find(result => result.name === 'Access is actually wired up')
    expect(wired?.status).toBe('FAIL')
    // Every per-path refusal still passes: the Worker's own guard held.
    const refusals = results.filter(result => result.name.endsWith(': refused'))
    expect(refusals.every(result => result.status === 'PASS')).toBe(true)
  })

  it('passes the wired-up assertion once at least one admin path is answered with a cloudflareaccess.com login redirect', async () => {
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount += 1
        if (callCount === 1) {
          return new Response(null, {
            status: 302,
            headers: {
              'location': 'https://symprex.cloudflareaccess.com/cdn-cgi/access/login',
              'cache-control': 'no-store',
            },
          })
        }
        return forbiddenResponse()
      }),
    )

    const results = await runAdminChecks('https://admin.example.test', ['careers'], 1000)

    const wired = results.find(result => result.name === 'Access is actually wired up')
    expect(wired?.status).toBe('PASS')
  })

  it('fails loudest of all when an admin path returns 200', async () => {
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount += 1
        if (callCount === 1) {
          return new Response('<table><tr><td>Clicks</td></tr></table>', {
            status: 200,
            headers: { 'cache-control': 'no-store' },
          })
        }
        return forbiddenResponse()
      }),
    )

    const results = await runAdminChecks('https://admin.example.test', ['careers'], 1000)

    const refused = results.find(result => result.name === 'admin GET /: refused')
    expect(refused?.status).toBe('FAIL')
    expect(refused?.detail).toMatch(/SECURITY/i)
    expect(refused?.detail).toContain('exposed')
  })

  it('reports a network fault as its own ERROR outcome, never folded into PASS or FAIL', async () => {
    let callCount = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        callCount += 1
        if (callCount === 1)
          throw new TypeError('fetch failed: getaddrinfo ENOTFOUND')
        return forbiddenResponse()
      }),
    )

    const results = await runAdminChecks('https://admin.example.test', ['careers'], 1000)

    const failedRequest = results.find(result => result.name === 'admin GET /: request failed')
    expect(failedRequest?.status).toBe('ERROR')
    expect(failedRequest?.status).not.toBe('FAIL')
  })

  it('errors, not fails, the wired-up assertion when every admin fetch faults — no request was ever answered, so nothing was proved about Access', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed: getaddrinfo ENOTFOUND')
      }),
    )

    const results = await runAdminChecks('https://admin.example.test', ['careers'], 1000)

    const wired = results.find(result => result.name === 'Access is actually wired up')
    expect(wired?.status).toBe('ERROR')
    // Every per-path request failed too — none of the nine could be answered at all.
    const requestFailures = results.filter(result => result.name.endsWith(': request failed'))
    expect(requestFailures).toHaveLength(9)
    expect(requestFailures.every(result => result.status === 'ERROR')).toBe(true)
  })
})
