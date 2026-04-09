'use client'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

const LANGUAGES = ['javascript', 'typescript', 'python', 'rust', 'go', 'sql', 'bash', 'json', 'html', 'css']
const RUNNABLE = ['javascript', 'typescript', 'python']

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
      const loadedPyodide = await globalThis.loadPyodide()
      pyodide = loadedPyodide
      pyodide.runPython(`
        import sys
        import io
        sys.stdout = io.StringIO()
      `)
      resolve(pyodide)
    }
    script.onerror = reject
  })
  return pyodideLoading
}

function cleanPyTraceback(raw: string): string {
  const lines = raw.split('\n')
  const errorLine = [...lines].reverse().find(l => {
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
      const cleaned = cleanPyTraceback(e.message)
      return (stdout ? stdout + '\n' : '') + `[Error] ${cleaned}`
    }

    const stdout = py.runPython('sys.stdout.getvalue()')
    py.runPython('sys.stdout.truncate(0); sys.stdout.seek(0)')
    return stdout || '(no output)'
  } catch (e: any) {
    return `[Error] ${e.message}`
  }
}

function createRunnerHtml(code: string, language: string) {
  const safeCode = JSON.stringify(code)
  const safeLanguage = JSON.stringify(language)

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script src="https://unpkg.com/typescript@5.6.3/lib/typescript.js"><\/script>
  </head>
  <body>
    <script>
      (() => {
        const logs = [];
        const originalLog = console.log.bind(console);
        const originalError = console.error.bind(console);
        const originalWarn = console.warn.bind(console);

        const push = (prefix, args) => logs.push(prefix + args.map((arg) => {
          if (typeof arg === 'string') return arg;
          try { return JSON.stringify(arg); } catch { return String(arg); }
        }).join(' '));

        console.log = (...args) => { push('', args); originalLog(...args); };
        console.error = (...args) => { push('[Error] ', args); originalError(...args); };
        console.warn = (...args) => { push('[Warn] ', args); originalWarn(...args); };

        const source = ${safeCode};
        const language = ${safeLanguage};

        try {
          let executable = source;
          if (language === 'typescript' && window.ts) {
            executable = window.ts.transpile(source, {
              target: window.ts.ScriptTarget.ES2020,
              module: window.ts.ModuleKind.ESNext,
            });
          }
          (0, eval)(executable);
        } catch (error) {
          logs.push('[Error] ' + (error?.message || String(error)));
        }

        window.parent.postMessage({ type: 'helix-run', output: logs.join('\\n') || '(no output)' }, '*');
      })();
    <\/script>
  </body>
</html>`
}

// Detects touch-primary devices (phones/tablets).
// Runs once after mount — SSR-safe (defaults false = desktop handlers).
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false)
  useEffect(() => {
    setIsTouch(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)
  }, [])
  return isTouch
}

// Desktop button handlers — identical to original, no touch events involved
const desktopBtnStop = {
  onMouseDown: (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() },
}

// Mobile button handlers — stopPropagation only, NO preventDefault so onClick still fires
const mobileBtnStop = {
  onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
  onTouchEnd: (e: React.TouchEvent) => e.stopPropagation(),
}

// Desktop select handler — stops PM from stealing focus on mousedown
const desktopSelectStop = {
  onMouseDown: (e: React.MouseEvent) => e.stopPropagation(),
}

// Mobile select handler — nothing at all, native dropdown must open freely
const mobileSelectStop = {}

function CodeBlockNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const isTouch = useIsTouchDevice()

  // Pick the right handler set based on device type
  const btnStop  = isTouch ? mobileBtnStop  : desktopBtnStop
  const selStop  = isTouch ? mobileSelectStop : desktopSelectStop

  const [language, setLanguage] = useState((node.attrs.language as string) || 'typescript')
  const [copied, setCopied] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)

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

    if (language === 'python') {
      const result = await runPython(code)
      setOutput(result)
      setRunning(false)
      return
    }

    if (iframeRef.current) {
      iframeRef.current.srcdoc = createRunnerHtml(code, language)
    }
  }

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'helix-run') {
        setOutput(e.data.output || '(no output)')
        setRunning(false)
      }
    }
    window.addEventListener('message', onMsg)
    return () => window.removeEventListener('message', onMsg)
  }, [])

  return (
    <NodeViewWrapper>
      <div
        style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '0.75em 0', background: 'var(--code-bg)', position: 'relative' }}
      >
        <div
          contentEditable={false}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'default', userSelect: 'none' }}
        >
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            {...selStop}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', fontFamily: 'var(--font-sans), system-ui, sans-serif', fontSize: '11px', outline: 'none', padding: '2px 4px', cursor: 'pointer' }}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <span style={{ flex: 1 }} />

          {RUNNABLE.includes(language) && (
            <button
              {...btnStop}
              onClick={handleRun}
              disabled={running}
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '3px', color: 'var(--accent)', cursor: running ? 'wait' : 'pointer', fontSize: '10px', fontFamily: 'var(--font-sans), system-ui, sans-serif', padding: '2px 8px', opacity: running ? 0.6 : 1 }}
            >
              {running ? '◉ running' : '▶ Run'}
            </button>
          )}

          <button
            {...btnStop}
            onClick={handleCopy}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', color: copied ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontFamily: 'var(--font-sans), system-ui, sans-serif', padding: '2px 8px' }}
          >
            {copied ? '✓ copied' : 'copy'}
          </button>

          <button
            {...btnStop}
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
              {...btnStop}
              onClick={() => setOutput(null)}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px' }}
            >
              clear
            </button>
          </div>
        )}

        <iframe
          ref={iframeRef}
          style={{ display: 'none', width: 0, height: 0, border: 'none' }}
          sandbox="allow-scripts"
          title="helix-runner"
        />
      </div>
    </NodeViewWrapper>
  )
}

export const EnhancedCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView)
  },
}).configure({ lowlight })