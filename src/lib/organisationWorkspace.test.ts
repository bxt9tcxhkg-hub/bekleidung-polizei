import { describe, expect, it } from 'vitest'
import { workspacePolicy } from './organisationWorkspace'

describe('organisation workspace documentation boundaries', () => {
  it('keeps police operational documentation in PAD', () => {
    const policy = workspacePolicy('stadtpolizei')
    expect(policy.documentationSystem).toBe('pad')
    expect(policy.operationalProtocol).toBe(false)
    expect(policy.personStatusTracking).toBe(false)
    expect(policy.accommodationTracking).toBe(false)
    expect(policy.decisionProtocol).toBe(false)
    expect(policy.operationalChecklists).toBe(false)
  })

  it.each(['feuerwehr', 'krisenstab'] as const)('allows portal-native event documentation for %s', organisation => {
    const policy = workspacePolicy(organisation)
    expect(policy.documentationSystem).toBe('portal')
    expect(policy.operationalProtocol).toBe(true)
    expect(policy.decisionProtocol).toBe(true)
    expect(policy.operationalChecklists).toBe(true)
  })
})
