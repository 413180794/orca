import { afterAll, describe, expect, it } from 'vitest'
import type { SessionOptionDescriptor } from '../../../../../../src/shared/native-chat/input/native-chat-session-options'
import { activateMobileUiLocale } from '../../../../i18n/mobile-i18n'
import {
  mobileEffectivePermissionValue,
  mobileReportedPermissionAccessibleValue,
  mobileSessionOptionSummaryValue
} from './mobile-native-chat-session-option-labels'

function permission(kind: { currentValue?: string; reportedValue?: string } = {}) {
  return {
    id: 'permissionMode',
    label: 'Permissions',
    category: 'mode',
    transport: 'agent-session',
    valueSource: 'applied',
    settable: true,
    kind: {
      type: 'select',
      currentValue: 'own',
      settingsAgent: 'claude',
      choices: [
        { value: 'own', label: "Agent's own settings" },
        { value: 'ask', label: 'Ask for approval' },
        { value: 'full-access', label: 'Full access' }
      ],
      ...kind
    }
  } satisfies SessionOptionDescriptor
}

afterAll(() => activateMobileUiLocale('en'))

describe('an Own permission choice on mobile', () => {
  it('shows the mode the agent reports, and its settings until it reports one', () => {
    expect(mobileSessionOptionSummaryValue(permission({ reportedValue: 'full-access' }))).toBe(
      'Full access'
    )
    expect(mobileSessionOptionSummaryValue(permission({ reportedValue: 'plan' }))).toBe('Plan')
    expect(mobileSessionOptionSummaryValue(permission())).toBe('Claude Code settings')
    // A report Orca has no name for keeps naming the settings rather than a raw mode id.
    expect(mobileSessionOptionSummaryValue(permission({ reportedValue: 'read-only' }))).toBe(
      'Claude Code settings'
    )
  })

  it('says a reported mode comes from the agent settings, so it does not read as a pick', () => {
    expect(mobileReportedPermissionAccessibleValue(permission({ reportedValue: 'ask' }))).toBe(
      'Ask for approval, from Claude Code settings'
    )
    expect(mobileReportedPermissionAccessibleValue(permission())).toBeUndefined()
    expect(
      mobileReportedPermissionAccessibleValue(
        permission({ currentValue: 'ask', reportedValue: 'full-access' })
      )
    ).toBeUndefined()
  })

  it('runs in the reported mode while the saved choice stays Own', () => {
    const own = permission({ reportedValue: 'full-access' })
    expect(mobileEffectivePermissionValue(own)).toBe('full-access')
    expect(own.kind.currentValue).toBe('own')
    expect(mobileEffectivePermissionValue(permission())).toBe('own')
    expect(mobileEffectivePermissionValue(permission({ currentValue: 'ask' }))).toBe('ask')
  })

  it('uses the shared desktop translations in other languages', async () => {
    await activateMobileUiLocale('de')
    expect(mobileSessionOptionSummaryValue(permission({ reportedValue: 'full-access' }))).toBe(
      'Vollzugriff'
    )
    expect(mobileSessionOptionSummaryValue(permission({ reportedValue: 'plan' }))).toBe('Planen')
    expect(mobileSessionOptionSummaryValue(permission())).toBe('Claude Code-Einstellungen')
    expect(mobileReportedPermissionAccessibleValue(permission({ reportedValue: 'ask' }))).toBe(
      'Genehmigung anfordern, aus den Claude Code-Einstellungen'
    )
    await activateMobileUiLocale('ja')
    expect(mobileReportedPermissionAccessibleValue(permission({ reportedValue: 'auto' }))).toBe(
      '代わりに承認（Claude Code の設定より）'
    )
  })
})
