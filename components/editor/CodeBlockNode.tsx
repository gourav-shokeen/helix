'use client'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useState } from 'react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

const LANGUAGES = ['javascript', 'typescript', 'python', 'rust', 'go', 'sql', 'bash', 'json', 'html', 'css']
const RUNNABLE = ['javascript', 'typescript', 'python']

// ─── Pyodide ────────────────────────────────────────────────────────────────
let pyodide: any | null = null
let pyodideLoading: Promise<any> | null = null

async function initializePyodide() {
  if (pyodide) return pyodide
  if (pyodideLoading) return pyodideLoading

  const script = globalThis.document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js'
  globalThis.document.head.appendChild(script)

  pyodideLoading = new Promise<void>((resolve, reject) => {
    script.onload = async () => {
      // @ts-ignore
      const loaded = await globalThis.loadPyodide()
      pyodide = loaded
      pyodide.runPython(`
        import sys, io
        sys.stdout = io.StringIO()
      `)
      resolve(pyodide)
    }
    script.onerror = reject
  })
  return pyodideLoading
}

function cleanPyTraceback(raw: string): string {
  const errorLine = [...raw.split('\n')].reverse().find(l => {
    const t = l.trim()
    return (
      t.length > 0 &&
      !t.startsWith('^') &&
      !t.startsWith('File "') &&
      !t.startsWith('Traceback') &&
      !t.startsWith('CodeRunner') &&
      !t.includes('_pyodide') &&
      !t.includes('/lib/python')
    )
  })
  return errorLine?.trim() || raw.split('\n').at(-1)?.trim() || raw
}

async function runPython(code: string): Promise<string> {
  try {
    const py = await initializePyodide()
    py.runPython('sys.stdout.truncate(0); sys.stdout.seek(0)')
    try {
      py.runPython(code)
    } catch (e: any) {
      const stdout = py.runPython('sys.stdout.getvalue()')
      py.runPython('sys.stdout.truncate(0); sys.stdout.seek(0)')
      return (stdout ? stdout + '\n' : '') + `[Error] ${cleanPyTraceback(e.message)}`
    }
    const stdout = py.runPython('sys.stdout.getvalue()')
    py.runPython('sys.stdout.truncate(0); sys.stdout.seek(0)')
    return stdout || '(no output)'
  } catch (e: any) {
    return `[Error] ${e.message}`
  }
}

// ─── TypeScript compiler (loaded once, lazily) ───────────────────────────────
let tsCompiler: any = null
let tsLoading: Promise<any> | null = null

async function loadTypeScript(): Promise<any> {
  if (tsCompiler) return tsCompiler
  if (tsLoading) return tsLoading
  tsLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/typescript@5.6.3/lib/typescript.js'
    script.onload = () => { tsCompiler = (window as any).ts; resolve(tsCompiler) }
    script.onerror = reject
    document.head.appendChild(script)
  })
  return tsLoading
}

// ─── JS/TS runner — direct eval, no iframe/postMessage/blob needed ───────────
// More reliable on all browsers/platforms including deployed HTTPS on mobile.
async function runJS(code: string, language: string): Promise<string> {
  const logs: string[] = []

  const origLog   = console.log.bind(console)
  const origError = console.error.bind(console)
  const origWarn  = console.warn.bind(console)

  const serialize = (args: any[]) =>
    args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')

  console.log   = (...args: any[]) => { logs.push(serialize(args));               origLog(...args) }
  console.error = (...args: any[]) => { logs.push('[Error] ' + serialize(args));   origError(...args) }
  console.warn  = (...args: any[]) => { logs.push('[Warn] '  + serialize(args));   origWarn(...args) }

  try {
    let executable = code

    if (language === 'typescript') {
      try {
        const ts = await loadTypeScript()
        executable = ts.transpile(code, {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.ESNext,
        })
      } catch {
        // TS compiler failed to load — run as-is and let eval surface the error
      }
    }

    // eslint-disable-next-line no-eval
    ;(0, eval)(executable)
  } catch (e: any) {
    logs.push('[Error] ' + (e?.message || String(e)))
  } finally {
    console.log   = origLog
    console.error = origError
    console.warn  = origWarn
  }

  return logs.join('\n') || '(no output)'
}

// ─── Quote normalisation ─────────────────────────────────────────────────────
// iOS/macOS keyboards autocorrect straight quotes to typographic (curly) quotes,
// dashes to en/em-dashes, etc. These cause syntax errors in every language.
// Call this on the code string before passing it to any executor.
function normalizeQuotes(code: string): string {
  return code
    .replace(/[\u201C\u201D]/g, '"')   // curly double → straight double
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // curly single / apostrophe → straight single
    .replace(/\u201E/g, '"')           // double low-9 quotation mark → "
    .replace(/[\u2032\u2033]/g, "'")  // prime / double prime → '
    .replace(/[\u2013\u2014]/g, '-')  // en-dash / em-dash → hyphen-minus
    .replace(/\u2026/g, '...')         // ellipsis character → three dots
    .replace(/\u00A0/g, ' ')           // non-breaking space → regular space
}

// ─── Unified pointer-down stop ───────────────────────────────────────────────
// onPointerDown fires before ProseMirror's native DOM listener on both desktop
// (mouse) and real mobile (touch). stopImmediatePropagation() kills PM's listener
// before it can insert a newline. We do NOT call preventDefault() so the browser
// still synthesises the subsequent click event → onClick fires normally.
// This single pattern replaces the old device-detection approach.
const btnPointerDown = (e: React.PointerEvent) => {
  e.stopPropagation()
  e.nativeEvent.stopImmediatePropagation()
}

// ─── Component ───────────────────────────────────────────────────────────────
function CodeBlockNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [language, setLanguage] = useState((node.attrs.language as string) || 'typescript')
  const [copied,   setCopied]   = useState(false)
  const [output,   setOutput]   = useState<string | null>(null)
  const [running,  setRunning]  = useState(false)

  const code = node.textContent

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    updateAttributes({ language: lang })
  }

  const handleRun = async () => {
    if (!RUNNABLE.includes(language)) {
      setOutput(`Execution not supported for ${language}`)
      return
    }
    setRunning(true)
    setOutput('Running...')
    // Normalise typographic quotes/dashes before any language branching so that
    // iOS/macOS autocorrect substitutions don't cause syntax errors.
    const normalizedCode = normalizeQuotes(code)
    try {
      const result =
        language === 'python'
          ? await runPython(normalizedCode)
          : await runJS(normalizedCode, language)
      setOutput(result)
    } catch (e: any) {
      setOutput(`[Error] ${e.message}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <NodeViewWrapper>
      <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '0.75em 0', background: 'var(--code-bg)', position: 'relative' }}>
        <div
          contentEditable={false}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'default', userSelect: 'none' }}
        >
          <select
            value={language}
            onPointerDown={btnPointerDown}
            onChange={(e) => handleLanguageChange(e.target.value)}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: '11px', outline: 'none', padding: '2px 4px', cursor: 'pointer' }}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <span style={{ flex: 1 }} />

          {RUNNABLE.includes(language) && (
            <button
              onPointerDown={btnPointerDown}
              onClick={handleRun}
              disabled={running}
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '3px', color: 'var(--accent)', cursor: running ? 'wait' : 'pointer', fontSize: '10px', fontFamily: 'var(--font-sans), system-ui, sans-serif', padding: '2px 8px', opacity: running ? 0.6 : 1 }}
            >
              {running ? '◉ running' : '▶ Run'}
            </button>
          )}

          <button
            onPointerDown={btnPointerDown}
            onClick={handleCopy}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', color: copied ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-sans), system-ui, sans-serif', padding: '2px 8px' }}
          >
            {copied ? '✓ copied' : 'copy'}
          </button>

          <button
            onPointerDown={btnPointerDown}
            onClick={deleteNode}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-sans), system-ui, sans-serif', padding: '2px 8px' }}
          >
            delete
          </button>
        </div>

        <div className="code-block-content" data-language={language}>
          <pre>
            <NodeViewContent style={{ outline: 'none' }} />
          </pre>
        </div>

        {output !== null && (
          <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--accent)', fontFamily: 'var(--font-mono), monospace', fontSize: '12px', whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>output › </span>{output}
            <button
              onPointerDown={btnPointerDown}
              onClick={() => setOutput(null)}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px' }}
            >
              clear
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  )
}

export const EnhancedCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },
}).configure({ lowlight })