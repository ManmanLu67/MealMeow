import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (name.endsWith('.ts')) out.push(full)
  }
  return out
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  const found: string[] = []
  for (const match of text.matchAll(/(?:from|import)\s+['"]([^'"]+)['"]/g)) found.push(match[1])
  return found
}

function rel(file: string): string {
  return relative(root, file).replaceAll('\\', '/')
}

/** 平台相关的名字。出现在 domain/ 或 app/ 里，说明规则和某个平台绑死了。 */
const PLATFORM_APIS = [
  /\bwx\./,
  /\bwx\b\s*\)/,
  /\bgetApp\b/,
  /\bgetCurrentPages\b/,
  /\bwx-server-sdk\b/,
  /\bdocument\.(?:getElement|querySelector|createElement|body)/,
  /\bwindow\.(?:location|document|localStorage|addEventListener|navigator)/,
  /\bglobalThis\.(?:window|wx)\b/,
  /\blocalStorage\b/,
  /\bprocess\./,
  /\brequire\(/,
  /react-native/,
  /\bexpo\b/,
]

describe('layer boundaries', () => {
  it('domain/ imports only domain/ and has no platform API', () => {
    for (const file of sourceFiles(join(root, 'domain'))) {
      for (const spec of importsOf(file)) {
        assert.ok(spec.startsWith('./'), `${rel(file)} imports ${spec}; domain/ may only import ./`)
      }
      const text = readFileSync(file, 'utf8')
      for (const api of PLATFORM_APIS) {
        assert.ok(!api.test(text), `${rel(file)} uses a platform API (${api})`)
      }
    }
  })

  it('app/ imports only domain/ and itself and has no platform API', () => {
    for (const file of sourceFiles(join(root, 'app'))) {
      for (const spec of importsOf(file)) {
        const ok = spec.startsWith('./') || spec.startsWith('../domain/')
        assert.ok(ok, `${rel(file)} imports ${spec}; app/ may only import ./ and ../domain/`)
      }
      const text = readFileSync(file, 'utf8')
      for (const api of PLATFORM_APIS) {
        assert.ok(!api.test(text), `${rel(file)} uses a platform API (${api})`)
      }
    }
  })

  it('domain/ and app/ do not read the clock or random numbers themselves', () => {
    // 时间只能从调用者传进来的 now 来。手机端和云端各自提供时钟，测试也能固定它。
    for (const dir of ['domain', 'app']) {
      for (const file of sourceFiles(join(root, dir))) {
        const text = readFileSync(file, 'utf8')
        assert.ok(!/new Date\(\)/.test(text), `${rel(file)} calls new Date() with no argument`)
        assert.ok(!/Date\.now\(/.test(text), `${rel(file)} calls Date.now()`)
        assert.ok(!/Math\.random\(/.test(text), `${rel(file)} calls Math.random()`)
      }
    }
  })

  it('adapters may use app/ interfaces and types, never the commands', () => {
    // 适配器只实现 app/ports.ts 的接口。它不能调用命令，否则依赖会绕成圈。
    const allowed = new Set(['app/ports.ts', 'app/types.ts'])
    for (const file of sourceFiles(join(root, 'adapters'))) {
      for (const spec of importsOf(file)) {
        if (!spec.startsWith('.')) continue
        const target = relative(root, join(file, '..', spec)).replaceAll('\\', '/')
        if (target.startsWith('app/')) {
          assert.ok(allowed.has(target), `${rel(file)} imports ${target}; adapters may only import ports.ts and types.ts from app/`)
        }
      }
    }
  })

  it('no source file depends on a specific adapter except tests and entry points', () => {
    // 具体的适配器由入口（云函数、手机端启动代码）选。命令层只认接口。
    for (const dir of ['domain', 'app']) {
      for (const file of sourceFiles(join(root, dir))) {
        for (const spec of importsOf(file)) {
          assert.ok(!spec.includes('adapters'), `${rel(file)} imports an adapter: ${spec}`)
        }
      }
    }
  })
})
