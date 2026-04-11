'use client'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useState } from 'react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

const LANGUAGES = ['javascript', 'typescript', 'python', 'rust', 'go', 'sql', 'bash', 'json', 'html', 'css']
const RUNNABLE = ['javascript', 'typescript', 'python']

// ─── Pyodide ─────────────────────────────────────────────────────────────────
// BUG FIX: was Promise<void> which made the resolved value disappear,
// so `py` was always `undefined` → TypeError on every Python run.
let pyodide: any | null = null
let pyodideLoading: Promise<any> | null = null

async function initializePyodide(): Promise<any> {
  if (pyodide) return pyodide
  if (pyodideLoading) return pyodideLoading

  pyodideLoading = new Promise<any>((resolve, reject) => {
    // Guard: don't add duplicate script tags
    if (document.querySelector('script[src*="pyodide"]')) {
      // Script already in DOM (e.g. hot reload). Wait for loadPyodide to appear.
      const poll = setInterval(async () => {
        if ((globalThis as any).loadPyodide) {
          clearInterval(poll)
          try {
            const loaded = await (globalThis as any).loadPyodide()
            pyodide = loaded
            pyodide.runPython('import sys, io\nsys.stdout = io.StringIO()')
            resolve(pyodide)
          } catch (err) {
            pyodideLoading = null
            reject(err)
          }
        }
      }, 100)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js'
    script.onload = async () => {
      try {
        const loaded = await (globalThis as any).loadPyodide()
        pyodide = loaded
        pyodide.runPython('import sys, io\nsys.stdout = io.StringIO()')
        resolve(pyodide)
      } catch (err) {
        pyodideLoading = null   // allow retry on next run
        reject(err)
      }
    }
    script.onerror = () => {
      pyodideLoading = null
      reject(new Error('Failed to load Python runtime — check your internet connection.'))
    }
    document.head.appendChild(script)
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
    // py is now correctly typed as `any` — the actual Pyodide object
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

// ─── TypeScript compiler (loaded once, lazily) ────────────────────────────────
let tsCompiler: any = null
let tsLoading: Promise<any> | null = null

async function loadTypeScript(): Promise<any> {
  if (tsCompiler) return tsCompiler
  if (tsLoading) return tsLoading
  tsLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/typescript@5.6.3/lib/typescript.js'
    script.onload  = () => { tsCompiler = (window as any).ts; resolve(tsCompiler) }
    script.onerror = reject
    document.head.appendChild(script)
  })
  return tsLoading
}

// ─── JS / TS runner — direct eval, no iframe/postMessage/blob ────────────────
async function runJS(code: string, language: string): Promise<string> {
  const logs: string[] = []

  const origLog   = console.log.bind(console)
  const origError = console.error.bind(console)
  const origWarn  = console.warn.bind(console)

  const serialize = (args: any[]) =>
    args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')

  console.log   = (...args: any[]) => { logs.push(serialize(args));              origLog(...args)   }
  console.error = (...args: any[]) => { logs.push('[Error] ' + serialize(args)); origError(...args) }
  console.warn  = (...args: any[]) => { logs.push('[Warn] '  + serialize(args)); origWarn(...args)  }

  try {
    let executable = code
    if (language === 'typescript') {
      try {
        const ts = await loadTypeScript()
        executable = ts.transpile(code, {
          target: ts.ScriptTarget.ES2020,
          module:  ts.ModuleKind.ESNext,
        })
      } catch {
        // TS compiler failed to load — run as-is
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

// ─── Quote / punctuation normalisation ───────────────────────────────────────
// iOS / macOS keyboards autocorrect straight quotes → curly quotes, dashes →
// en/em-dashes, etc. These cause syntax errors in every language.
function normalizeQuotes(code: string): string {
  return code
    .replace(/[\u201C\u201D]/g, '"')              // curly double → "
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // curly single → '
    .replace(/\u201E/g, '"')                      // double low-9 → "
    .replace(/[\u2032\u2033]/g, "'")             // prime → '
    .replace(/[\u2013\u2014]/g, '-')             // en/em-dash → -
    .replace(/\u2026/g, '...')                    // ellipsis → ...
    .replace(/\u00A0/g, ' ')                      // non-breaking space → space
}

// ─── Python builtin case normaliser ──────────────────────────────────────────
// iPhone/iPad autocapitalises the first letter when you start a new line.
// So `print` becomes `Print`, `len` becomes `Len`, etc. — all NameErrors.
// This normalises common Python builtins to lowercase before execution.
// Only matches bare identifiers followed by ( or used as keywords — safe to
// apply globally because these names have no valid capitalised meaning in Python.
const PYTHON_BUILTINS = [
  // I/O
  'print', 'input',
  // Type constructors
  'int', 'str', 'float', 'bool', 'complex', 'bytes', 'bytearray',
  'list', 'dict', 'set', 'frozenset', 'tuple',
  // Inspection
  'type', 'isinstance', 'issubclass', 'callable', 'id', 'hash', 'dir', 'vars',
  'hasattr', 'getattr', 'setattr', 'delattr',
  // Iterables / functional
  'len', 'range', 'enumerate', 'zip', 'map', 'filter',
  'sorted', 'reversed', 'iter', 'next', 'any', 'all',
  // Math
  'abs', 'round', 'sum', 'min', 'max', 'pow', 'divmod',
  // Encoding
  'ord', 'chr', 'hex', 'oct', 'bin', 'format', 'repr',
  // Misc
  'open', 'eval', 'exec', 'compile', 'globals', 'locals', 'super', 'object',
  // Common keywords that iOS might capitalise at line start
  'if', 'else', 'elif', 'for', 'while', 'def', 'class', 'return',
  'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise',
  'pass', 'break', 'continue', 'and', 'or', 'not', 'in', 'is',
  'lambda', 'yield', 'assert', 'del', 'global', 'nonlocal',
]

function normalizePythonCode(code: string): string {
  // Build a single regex that matches any of the builtins as a whole word,
  // case-insensitively. \b ensures we don't mangle substrings (e.g. "format"
  // inside "reformat").
  const pattern = new RegExp(
    `\\b(${PYTHON_BUILTINS.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'gi'
  )
  return code.replace(pattern, match => match.toLowerCase())
}

// ─── Shared pointer-stop (Copy / Delete / Select) ────────────────────────────
// Kills ProseMirror's native DOM listener before it can insert a newline.
// Does NOT call preventDefault so the browser still synthesises the click event.
const stopPM = (e: React.PointerEvent) => {
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

  const handleRun = useCallback(async () => {
    if (!RUNNABLE.includes(language)) {
      setOutput(`Execution not supported for ${language}`)
      return
    }
    setRunning(true)
    setOutput('⏳ Loading runtime...')
    const quotesFixed = normalizeQuotes(code)
    // For Python: also fix iPhone autocapitalisation of builtins/keywords
    const normalizedCode = language === 'python'
      ? normalizePythonCode(quotesFixed)
      : quotesFixed
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
  }, [language, code])

  // ─── Run button handlers ──────────────────────────────────────────────────
  // Problem: onPointerDown + stopImmediatePropagation prevents click synthesis
  // on real mobile devices (works in DevTools emulation because that still uses
  // mouse events under the hood).
  //
  // Fix: use onTouchEnd for touch devices + onClick for desktop mouse.
  // onTouchEnd fires reliably on all real phones. Calling e.preventDefault()
  // inside onTouchEnd stops the browser from synthesising a duplicate click event,
  // so handleRun() is called exactly once regardless of input device.
  //
  // Copy/Delete keep the simpler onPointerDown + onClick because they don't have
  // the async timing gap that makes the mobile click-synthesis failure visible.

  const handleRunTouchEnd = useCallback((e: React.TouchEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    e.preventDefault()    // ← prevents the synthesised click → no double-fire
    if (running) return
    handleRun()
  }, [running, handleRun])

  const handleRunClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // On a real touch device this never fires (preventDefault on touchend killed it).
    // On desktop this is the primary handler.
    e.stopPropagation()
    handleRun()
  }, [handleRun])

  const handleRunPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    e.nativeEvent.stopImmediatePropagation()
    // No preventDefault here — we need the touch event chain to continue
    // so that onTouchEnd fires below.
  }, [])

  return (
    <NodeViewWrapper>
      <div style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '0.75em 0', background: 'var(--code-bg)', position: 'relative' }}>
        <div
          contentEditable={false}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'default', userSelect: 'none' }}
        >
          <select
            value={language}
            onPointerDown={stopPM}
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
              onPointerDown={handleRunPointerDown}
              onTouchEnd={handleRunTouchEnd}
              onClick={handleRunClick}
              disabled={running}
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '3px', color: 'var(--accent)', cursor: running ? 'wait' : 'pointer', fontSize: '10px', fontFamily: 'var(--font-sans), system-ui, sans-serif', padding: '2px 8px', opacity: running ? 0.6 : 1 }}
            >
              {running ? '◉ running' : '▶ Run'}
            </button>
          )}

          <button
            onPointerDown={stopPM}
            onClick={handleCopy}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', color: copied ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-sans), system-ui, sans-serif', padding: '2px 8px' }}
          >
            {copied ? '✓ copied' : 'copy'}
          </button>

          <button
            onPointerDown={stopPM}
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
              onPointerDown={stopPM}
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