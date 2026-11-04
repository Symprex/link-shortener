import type { KvRecord } from './export-kv-links.ts'
import { describe, expect, it } from 'vitest'
import { compareWithExisting, planExport, serialiseLink } from './export-kv-links.ts'

const NOW = 1_800_000_000

function record(slug: string, value: Record<string, unknown> | string, extra: Partial<KvRecord> = {}): KvRecord {
  return {
    key: `link:${slug}`,
    value: typeof value === 'string' ? value : JSON.stringify(value),
    ...extra,
  }
}

// The shape the Sink fork writes (server/api/link/create.post.ts): LinkSchema's
// defaults fill id, createdAt and updatedAt on every record.
function sinkValue(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc123defg',
    url: 'https://www.symprex.com/careers',
    slug: 'careers',
    createdAt: 1_700_000_000,
    updatedAt: 1_700_000_100,
    ...overrides,
  }
}

describe('planExport', () => {
  it('reduces a Sink record to the three-field format', () => {
    const plan = planExport([record('careers', sinkValue({ comment: 'Careers page' }))], NOW)

    expect(plan.links).toEqual([
      { url: 'https://www.symprex.com/careers', slug: 'careers', comment: 'Careers page' },
    ])
    expect(plan.issues).toEqual([])
  })

  it('omits an empty or whitespace comment rather than writing ""', () => {
    const plan = planExport([record('careers', sinkValue({ comment: '  ' }))], NOW)

    expect(plan.links).toEqual([{ url: 'https://www.symprex.com/careers', slug: 'careers' }])
  })

  it('takes the slug from the KV key, which is what the legacy lookup reads, and reports a disagreeing value', () => {
    const plan = planExport([record('careers', sinkValue({ slug: 'jobs' }))], NOW)

    expect(plan.links.map(link => link.slug)).toEqual(['careers'])
    expect(plan.issues).toEqual([
      { kind: 'slug-mismatch', key: 'link:careers', blocking: false, detail: 'value.slug is "jobs"; the key wins' },
    ])
  })

  it('lowercases a mixed-case slug and reports it', () => {
    const plan = planExport([record('Teams-Help', sinkValue({ slug: 'Teams-Help' }))], NOW)

    expect(plan.links.map(link => link.slug)).toEqual(['teams-help'])
    expect(plan.issues).toEqual([
      { kind: 'lowercased', key: 'link:Teams-Help', blocking: false, detail: 'written as "teams-help"' },
    ])
  })

  it('writes neither side of a case collision and blocks on it', () => {
    const plan = planExport([
      record('teams', sinkValue({ slug: 'teams', url: 'https://a.example' })),
      record('Teams', sinkValue({ slug: 'Teams', url: 'https://b.example' })),
    ], NOW)

    expect(plan.links).toEqual([])
    expect(plan.issues).toContainEqual({
      kind: 'case-collision',
      key: 'link:Teams',
      blocking: true,
      detail: '"teams" is claimed by link:Teams, link:teams; neither is written',
    })
    expect(plan.issues.filter(issue => issue.kind === 'case-collision')).toHaveLength(2)
  })

  it('blocks on a slug the new regex rejects', () => {
    const plan = planExport([record('team_wiki', sinkValue({ slug: 'team_wiki' }))], NOW)

    expect(plan.links).toEqual([])
    expect(plan.issues).toEqual([
      expect.objectContaining({ kind: 'invalid-slug', key: 'link:team_wiki', blocking: true }),
    ])
  })

  it('blocks on the reserved admin slug in any case', () => {
    const plan = planExport([record('Admin', sinkValue({ slug: 'Admin' }))], NOW)

    expect(plan.links).toEqual([])
    expect(plan.issues).toContainEqual(
      expect.objectContaining({ kind: 'reserved-slug', key: 'link:Admin', blocking: true }),
    )
  })

  it('blocks on a value that is not JSON, or has no url', () => {
    const plan = planExport([
      record('broken', '{not json'),
      record('nourl', sinkValue({ url: undefined })),
      { key: 'link:gone', value: null },
    ], NOW)

    expect(plan.links).toEqual([])
    expect(plan.issues.map(issue => [issue.kind, issue.key, issue.blocking])).toEqual([
      ['invalid-value', 'link:broken', true],
      ['invalid-value', 'link:nourl', true],
      ['invalid-value', 'link:gone', true],
    ])
  })

  it('writes a link with a future expiry as permanent but blocks so someone decides', () => {
    const plan = planExport([record('event', sinkValue({ slug: 'event', expiration: NOW + 86_400 }), { expiration: NOW + 86_400 })], NOW)

    expect(plan.links.map(link => link.slug)).toEqual(['event'])
    expect(plan.issues).toEqual([
      { kind: 'expires', key: 'link:event', blocking: true, detail: 'expires 2027-01-16T08:00:00.000Z; the new format makes it permanent' },
    ])
  })

  it('drops a link whose value-level expiry has passed, since KV would have removed it had the TTL been set', () => {
    const plan = planExport([record('old', sinkValue({ slug: 'old', expiration: NOW - 1 }))], NOW)

    expect(plan.links).toEqual([])
    expect(plan.issues).toEqual([
      expect.objectContaining({ kind: 'expired', key: 'link:old', blocking: true }),
    ])
  })

  it('reports Sink-only fields that carry content, and is silent about id and the timestamps', () => {
    const plan = planExport([record('careers', sinkValue({ title: 'Careers', description: '', image: 'https://img.example/a.png' }))], NOW)

    expect(plan.links).toEqual([{ url: 'https://www.symprex.com/careers', slug: 'careers' }])
    expect(plan.issues).toEqual([
      { kind: 'dropped-fields', key: 'link:careers', blocking: false, detail: 'title, image' },
    ])
  })

  it('ignores keys outside the link: prefix', () => {
    const plan = planExport([{ key: 'config:something', value: '{}' }], NOW)

    expect(plan).toEqual({ links: [], issues: [] })
  })

  it('returns links sorted by slug', () => {
    const plan = planExport([
      record('zeta', sinkValue({ slug: 'zeta' })),
      record('alpha', sinkValue({ slug: 'alpha' })),
    ], NOW)

    expect(plan.links.map(link => link.slug)).toEqual(['alpha', 'zeta'])
  })
})

describe('compareWithExisting', () => {
  const existing = [
    { filename: 'links/careers.json', content: '{"url":"https://www.symprex.com/careers","slug":"careers"}' },
    { filename: 'links/status.json', content: '{"url":"https://status.symprex.com","slug":"status"}' },
  ]

  it('reports files in links/ that KV does not have, and targets KV disagrees with', () => {
    const issues = compareWithExisting(
      [{ url: 'https://symprex.com/jobs', slug: 'careers' }, { url: 'https://x.example', slug: 'new' }],
      existing,
    )

    expect(issues).toEqual([
      { kind: 'url-changed', key: 'links/careers.json', blocking: false, detail: 'https://www.symprex.com/careers -> https://symprex.com/jobs (KV wins)' },
      { kind: 'not-in-kv', key: 'links/status.json', blocking: true, detail: 'not live today; keep it or delete it' },
    ])
  })
})

describe('serialiseLink', () => {
  it('writes the same layout as the hand-written link files', () => {
    expect(serialiseLink({ url: 'https://www.symprex.com/careers', slug: 'careers', comment: 'Symprex careers page' })).toBe(
      '{\n  "url": "https://www.symprex.com/careers",\n  "slug": "careers",\n  "comment": "Symprex careers page"\n}\n',
    )
  })
})
