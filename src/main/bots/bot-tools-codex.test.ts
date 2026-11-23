import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { _resetSecretStoreForTests, setSecretStore } from '../../shared/secure-storage/secret-store'
import { BotLaunchTools } from './bot-launch-tools'
import {
  commitBotToolOAuth,
  newBotToolCredentialId,
  useBotToolCredentialsRoot
} from './bot-tool-credentials'
import { codexBotToolsThreadConfig, withoutCodexMcpConflicts } from './bot-tools-codex'
import { addBotTool, botToolProblems, type BotToolsHome } from './bot-tools-host'

const relay = { grant: async () => ({ origin: 'http://127.0.0.1:1', token: 'token' }) }
const bot = { botId: 'bot', folder: '/bot', agent: 'codex' }

const dirs: string[] = []
const tempDir = (prefix: string): string => {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  useBotToolCredentialsRoot(null)
  _resetSecretStoreForTests()
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

describe('codexBotToolsThreadConfig', () => {
  it("leaves out a url server named like the owner's stdio server, since Codex would merge the two", async () => {
    const tools = await BotLaunchTools.for(relay, bot, [
      { name: 'notion', url: 'https://mcp.notion.com/mcp' },
      { name: 'docs', command: 'npx', args: ['docs-mcp'] }
    ])

    expect(codexBotToolsThreadConfig(tools, ['notion', 'docs'])).toEqual({
      'mcp_servers.docs.command': 'npx',
      'mcp_servers.docs.args': ['docs-mcp']
    })
  })
})

describe('botToolProblems on Codex', () => {
  it("fails each url tool named like the owner's stdio server, even one Orca signs in to, without starting Codex", async () => {
    useBotToolCredentialsRoot(tempDir('bot-tool-credentials-'))
    setSecretStore({
      isEncryptionAvailable: () => true,
      encryptString: (text) => Buffer.from(text, 'utf8'),
      decryptString: (cipher) => cipher.toString('utf8'),
      describeProtectionGap: () => null
    })
    const folder = tempDir('bot-folder-')
    const accountHome = tempDir('codex-home-')
    const cli: BotToolsHome = {
      botId: 'bot',
      folder,
      signInFolder: folder,
      otherBotFolders: [],
      agent: 'codex',
      command: join(folder, 'no-codex-here'),
      prefixArgs: [],
      env: {},
      accountHome
    }
    const notion = 'https://mcp.notion.com/mcp'
    const id = newBotToolCredentialId()
    await addBotTool(
      cli,
      { name: 'notion', url: notion, transport: 'http', credential: id },
      new Map([[id, { url: notion, signIn: true as const }]])
    )
    commitBotToolOAuth(folder, id, (current) => ({
      url: notion,
      grant: current!.grant + 1,
      record: { resource: notion, tokens: { access_token: 'access', token_type: 'bearer' } }
    }))
    await addBotTool(cli, { name: 'linear', url: 'https://mcp.linear.app/mcp', transport: 'http' })
    writeFileSync(
      join(accountHome, 'config.toml'),
      '[mcp_servers.notion]\ncommand = "npx"\n\n[mcp_servers.linear]\ncommand = "npx"\n'
    )

    const taken = (name: string) => ({
      kind: 'failed',
      detail: expect.stringContaining(`Codex already has a local tool named ${name}`)
    })
    expect(await botToolProblems(cli)).toEqual({ notion: taken('notion'), linear: taken('linear') })
  })
})

const reading = (answer: unknown) => ({
  request: vi.fn(async () => (answer instanceof Error ? Promise.reject(answer) : answer))
})

describe('withoutCodexMcpConflicts', () => {
  it('asks Codex nothing when the thread adds no server', async () => {
    const rpc = reading({ config: {} })
    const config = { 'mcp_servers.notion.enabled': false, web_search: 'disabled' }
    expect(await withoutCodexMcpConflicts(rpc, '/work', config)).toEqual({
      threadConfig: config,
      leftOut: []
    })
    expect(rpc.request).not.toHaveBeenCalled()
  })

  it('reads the config Codex loads at the thread’s folder', async () => {
    const rpc = reading({ config: { mcp_servers: {} } })
    await withoutCodexMcpConflicts(rpc, '/work', { 'mcp_servers.notion.url': 'https://n/mcp' })
    expect(rpc.request).toHaveBeenCalledWith(
      'config/read',
      { cwd: '/work' },
      { timeoutMs: expect.any(Number) }
    )
  })

  it('drops every key of a server whose kind differs from the loaded one', async () => {
    const rpc = reading({
      config: { mcp_servers: { notion: { command: 'npx', args: [] }, linear: { url: 'u' } } }
    })
    const result = await withoutCodexMcpConflicts(rpc, '/work', {
      'mcp_servers.notion.url': 'https://n/mcp',
      'mcp_servers.notion.http_headers': { authorization: 'Bearer t' },
      'mcp_servers.notionx.url': 'https://x/mcp',
      'mcp_servers.linear.url': 'https://l/mcp',
      web_search: 'disabled'
    })
    expect(result).toEqual({
      threadConfig: {
        'mcp_servers.notionx.url': 'https://x/mcp',
        'mcp_servers.linear.url': 'https://l/mcp',
        web_search: 'disabled'
      },
      leftOut: ['notion']
    })
  })

  it('keeps the thread config as it is when Codex’s config can’t be read', async () => {
    const config = { 'mcp_servers.notion.url': 'https://n/mcp' }
    for (const answer of [new Error('refused'), null, { config: { mcp_servers: 'odd' } }]) {
      expect(await withoutCodexMcpConflicts(reading(answer), '/work', config)).toEqual({
        threadConfig: config,
        leftOut: []
      })
    }
  })
})
