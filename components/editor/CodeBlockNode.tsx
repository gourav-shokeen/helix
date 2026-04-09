'use client'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'

const lowlight = createLowlight(common)

const LANGUAGES = ['javascript', 'typescript', 'python', 'rust', 'go', 'sql', 'bash', 'json', 'html', 'css']
const RUNNABLE = ['javascript', 'typescript', 'python']

// Pyodide state
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

async function runPython(code: string): Promise<string> {
  try {
    const py = await initializePyodide()
    py.runPython(code)
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

// Prevents both mouse and touch events from bubbling into ProseMirror
function stopAll(e: React.SyntheticEvent) {
  e.preventDefault()
  e.stopPropagation()
}

function CodeBlockNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
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

    // FIX: use srcdoc instead of blob URL.
    // Blob URLs in sandboxed iframes break on iOS Safari and some Android
    // Chrome when served over HTTPS — srcdoc is universally supported.
    if (iframeRef.current) {
      iframeRef.current.srcdoc = createRunnerHtml(code, language)
    }
    // setRunning(false) happens in the message listener after postMessage arrives
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

  // Shared button props: block ALL pointer/touch events from reaching ProseMirror
  const btnStop = {
    onMouseDown: stopAll,
    onTouchStart: stopAll,  // FIX: was missing — caused newline insertion on mobile tap
    onTouchEnd: stopAll,
  }

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
            {...btnStop}
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

        {/* srcdoc iframe — no blob URL needed, works on all mobile browsers */}
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