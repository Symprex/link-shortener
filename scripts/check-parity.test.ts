import { describe, expect, it } from 'vitest'
import { buildProbes, compareOutcomes } from './check-parity.ts'

describe('compareOutcomes', () => {
  it('passes when status and Location match exactly', () => {
    expect(compareOutcomes('/careers', { status: 301, location: 'https://a.example/x' }, { status: 301, location: 'https://a.example/x' }))
      .toEqual({ name: '/careers', status: 'PASS', detail: '301 -> https://a.example/x' })
  })

  it('fails on a status difference, naming both sides', () => {
    expect(compareOutcomes('/careers', { status: 302, location: 'https://a.example/x' }, { status: 301, location: 'https://a.example/x' }))
      .toEqual({ name: '/careers', status: 'FAIL', detail: 'legacy 302 -> https://a.example/x, new 301 -> https://a.example/x' })
  })

  it('fails on a Location difference as small as a trailing slash', () => {
    expect(compareOutcomes('/', { status: 302, location: 'https://www.symprex.com/' }, { status: 302, location: 'https://www.symprex.com' }).status)
      .toBe('FAIL')
  })

  it('ignores Location on a non-redirect, where only the status is part of the contract', () => {
    expect(compareOutcomes('/nope', { status: 404, location: null }, { status: 404, location: '/ignored' }).status)
      .toBe('PASS')
  })
})

describe('buildProbes', () => {
  it('probes every slug, the case-folding, slash and query behaviour, the root and an unknown slug', () => {
    expect(buildProbes(['careers', 'status'], [])).toEqual([
      '/careers',
      '/status',
      '/CAREERS',
      '/careers/',
      '/careers?utm_source=parity',
      '/',
      '/parity-check-unknown-slug',
    ])
  })

  it('also probes each original KV key as it was spelt, once, so a lowercased or withheld link shows up', () => {
    expect(buildProbes(['teams-help'], ['Teams-Help', 'teams-help', 'team_wiki'])).toEqual([
      '/teams-help',
      '/TEAMS-HELP',
      '/teams-help/',
      '/teams-help?utm_source=parity',
      '/',
      '/parity-check-unknown-slug',
      '/Teams-Help',
      '/team_wiki',
    ])
  })
})
