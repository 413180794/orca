import { createElement } from 'react'
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionOptionDescriptor } from '../../../../../../src/shared/native-chat/input/native-chat-session-options'
import { activateMobileUiLocale } from '../../../../i18n/mobile-i18n'
import { MobileNativeChatSessionOptionPickers } from './MobileNativeChatSessionOptionPickers'
import type { MobileNativeChatSessionOptionsController } from './use-mobile-native-chat-session-options'

vi.mock('react-native', () => ({
  AccessibilityInfo: { announceForAccessibilityWithOptions: () => {} },
  Appearance: { getColorScheme: () => 'dark', addChangeListener: () => ({ remove: () => {} }) },
  Keyboard: { dismiss: () => {} },
  Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o.ios },
  Pressable: 'Pressable',
  StyleSheet: {
    create: (styles: unknown) => styles,
    hairlineWidth: 1,
    flatten: (s: unknown) => s
  },
  Text: 'Text',
  View: 'View'
}))
vi.mock('lucide-react-native', () => {
  const icon = (name: string) => name
  return {
    Clock: icon('Clock'),
    FilePenLine: icon('FilePenLine'),
    Hand: icon('Hand'),
    LockKeyhole: icon('LockKeyhole'),
    ShieldAlert: icon('ShieldAlert'),
    ShieldCheck: icon('ShieldCheck')
  }
})
// Drawer chrome loads native modules; the rows inside it are what this test reads.
vi.mock('../../../../components/bottom-drawer/BottomDrawer', async () => {
  const React = await import('react')
  return {
    BottomDrawer: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? React.createElement('Drawer', null, children) : null
  }
})
vi.mock('../../../../components/nav-bar/SheetHeader', () => ({ SheetHeader: 'SheetHeader' }))
vi.mock('../../../../components/list/ListGroup', async () => {
  const React = await import('react')
  return {
    LIST_ROW_PADDING: 16,
    LIST_LEADING_INSET: 52,
    ListGroup: ({ children }: { children: React.ReactNode }) =>
      React.createElement('ListGroup', null, children),
    SectionHeader: 'SectionHeader',
    ListRow: (props: { accessibilityLabel: string; value?: string }) =>
      React.createElement('ListRow', props)
  }
})
vi.mock('../../../../components/controls/MobileSwitch', () => ({ MobileSwitch: 'MobileSwitch' }))
vi.mock('../../../../components/controls/MobileSegmentedControl', () => ({
  MobileSegmentedControl: 'MobileSegmentedControl'
}))

function permission(reportedValue?: string): SessionOptionDescriptor {
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
      ...(reportedValue ? { reportedValue } : {}),
      choices: [
        { value: 'own', label: "Agent's own settings" },
        { value: 'ask', label: 'Ask for approval' },
        { value: 'full-access', label: 'Full access' }
      ]
    }
  }
}

const model: SessionOptionDescriptor = {
  id: 'model',
  label: 'Model',
  category: 'model',
  transport: 'agent-session',
  valueSource: 'applied',
  settable: true,
  kind: { type: 'select', currentValue: 'opus', choices: [{ value: 'opus', label: 'Opus' }] }
}

let tree: ReactTestRenderer | null = null

function render(snapshot: SessionOptionDescriptor[], page: string | null = null) {
  const controller: MobileNativeChatSessionOptionsController = {
    snapshot,
    pendingId: null,
    setOption: () => Promise.resolve(true),
    invokeAction: () => Promise.resolve(true),
    recordCommand: () => {}
  }
  act(() => {
    tree = create(
      createElement(MobileNativeChatSessionOptionPickers, {
        controller,
        isWorking: false,
        presentation: page ? { page, refocus: false } : null,
        onNavigate: () => {},
        onDrawerOpen: () => {}
      })
    )
  })
  const root = tree!.root
  // Host components are mocked as plain strings, which the renderer's element type does not model.
  const named = (node: ReactTestInstance, name: string): boolean => String(node.type) === name
  const pill = root.find((node) => named(node, 'Pressable'))
  const pillText = root
    .findAll((node) => named(node, 'Text'))
    .map((node) => node.children.filter((child) => typeof child === 'string').join(''))
    .filter(Boolean)
  const pillIcon = pill.children.find(
    (child): child is ReactTestInstance =>
      typeof child !== 'string' && typeof child.type === 'string' && !named(child, 'Text')
  )
  const rows: { accessibilityLabel?: unknown; value?: unknown }[] = root
    .findAll((node) => named(node, 'ListRow'))
    .map((node) => node.props)
  return {
    pillName: String(pill.props.accessibilityLabel),
    pillText,
    pillIcon: pillIcon ? String(pillIcon.type) : undefined,
    rows
  }
}

afterEach(() => {
  act(() => tree?.unmount())
  tree = null
})
afterAll(() => activateMobileUiLocale('en'))

describe('the mobile permission pill for an Own chat', () => {
  it('shows the reported mode and says it comes from the agent settings', () => {
    const view = render([permission('ask')])
    expect(view.pillName).toBe('Permissions, Ask for approval, from Claude Code settings')
    expect(view.pillIcon).toBe('Hand')
  })

  it('names the agent settings until the agent reports a mode', () => {
    const view = render([permission()])
    expect(view.pillName).toBe('Permissions, Claude Code settings')
    expect(view.pillText).toEqual(['Claude Code settings'])
  })

  it('warns on the closed model pill when the agent reports Full access', () => {
    const view = render([model, permission('full-access')])
    expect(view.pillName).toBe('Model, Opus, full access')
    expect(view.pillIcon).toBe('ShieldAlert')
    expect(render([model, permission('ask')]).pillName).toBe('Model, Opus')
  })

  it('lists the reported mode on the drawer permission row', () => {
    const view = render([model, permission('plan')], 'model')
    const row = view.rows.find((props) => String(props.accessibilityLabel).startsWith('Permissions'))
    expect(row).toMatchObject({
      value: 'Plan',
      accessibilityLabel: 'Permissions, Plan, from Claude Code settings'
    })
  })

  it('renders the shared translations in German', async () => {
    await act(() => activateMobileUiLocale('de'))
    const own = render([permission('full-access')])
    expect(own.pillName).toBe('Berechtigungen, Vollzugriff, aus den Claude Code-Einstellungen')
    expect(own.pillIcon).toBe('ShieldAlert')
    act(() => tree?.unmount())
    expect(render([permission()]).pillText).toEqual(['Claude Code-Einstellungen'])
    act(() => tree?.unmount())
    const drawer = render([model, permission('accept-edits')], 'model')
    expect(drawer.rows.find((props) => props.value === 'Änderungen akzeptieren')).toMatchObject({
      accessibilityLabel: 'Berechtigungen, Änderungen akzeptieren, aus den Claude Code-Einstellungen'
    })
  })
})
