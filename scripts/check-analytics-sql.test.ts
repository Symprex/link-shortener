import { describe, expect, it } from 'vitest'
import { buildQueryChecks, evaluateResponse, formatTable } from './check-analytics-sql.ts'

describe('buildQueryChecks', () => {
  it('names every one of the six query builders admin/page.ts sends to the SQL API', () => {
    const checks = buildQueryChecks(new Date('2024-01-10T00:00:00Z'))
    expect(checks.map(check => check.name)).toEqual([
      'buildTotalsQuery',
      'buildPerLinkQuery',
      'buildTopCountriesQuery',
      'buildTopReferrersQuery',
      'buildDailyClicksQuery',
      'buildTopMissingSlugsQuery',
    ])
  })

  it('gives each check the real SQL its builder produces, not a placeholder', () => {
    const checks = buildQueryChecks(new Date('2024-01-10T00:00:00Z'))
    const perLink = checks.find(check => check.name === 'buildPerLinkQuery')
    expect(perLink?.sql).toContain('GROUP BY blob1')
  })
})

describe('evaluateResponse', () => {
  it('passes a 200 response, regardless of body content', () => {
    const result = evaluateResponse('buildTotalsQuery', 200, '{"data":[]}')
    expect(result).toEqual({ name: 'buildTotalsQuery', status: 'PASS', detail: 'accepted' })
  })

  it('fails a 422 and carries the API\'s own error text, which names the rejected construct', () => {
    const result = evaluateResponse(
      'buildPerLinkQuery',
      422,
      'Input was invalid: in the GROUP BY clause you may only provide column names',
    )
    expect(result.status).toBe('FAIL')
    expect(result.detail).toContain('422')
    expect(result.detail).toContain('you may only provide column names')
  })

  it('truncates a long body so the table stays readable', () => {
    const result = evaluateResponse('name', 500, 'x'.repeat(1000))
    expect(result.detail.length).toBeLessThan(400)
  })
})

describe('formatTable', () => {
  it('renders one PASS/FAIL line per result, in order', () => {
    const table = formatTable([
      { name: 'buildTotalsQuery', status: 'PASS', detail: 'accepted' },
      { name: 'buildPerLinkQuery', status: 'FAIL', detail: '422: bad GROUP BY' },
    ])
    const lines = table.split('\n')
    expect(lines[0]).toContain('PASS')
    expect(lines[0]).toContain('buildTotalsQuery')
    expect(lines[1]).toContain('FAIL')
    expect(lines[1]).toContain('buildPerLinkQuery')
    expect(lines[1]).toContain('422: bad GROUP BY')
  })
})
