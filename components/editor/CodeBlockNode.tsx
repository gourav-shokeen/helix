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

  // @ts-ignore
  const script = globalThis.document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.0/full/pyodide.js'
  // @ts-ignore
  globalThis.document.head.appendChild(script)

  pyodideLoading = new Promise<void>((resolve, reject) => {
    script.onload = async () => {
      // @ts-ignore
      const loadedPyodide = await globalThis.loadPyodide()
      pyodide = loadedPyodide
      // Override stdout to capture prints
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
    py.runPython('sys.stdout.truncate(0); sys.stdout.seek(0)') // Clear buffer
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
    <script src="https://unpkg.com/typescript@5.6.3/lib/typescript.js"></script>
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
    </script>
  </body>
</html>`
}

function CodeBlockNodeView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [language, setLanguage] = useState((node.attrs.language as string) || 'typescript')
  const [copied, setCopied] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const blobUrlRef = useRef<string | null>(null)

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

  const [running, setRunning] = useState(false)

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

    // JS/TS: load via blob URL into hidden iframe
    // allow-same-origin is mandatory — without it the browser refuses the blob URL
    const blob = new Blob([createRunnerHtml(code, language)], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    blobUrlRef.current = url
    if (iframeRef.current) {
      iframeRef.current.src = url
    }
    // setRunning(false) happens in the message listener after output arrives
  }

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'helix-run') {
        setOutput(e.data.output || '(no output)')
        setRunning(false)
      }
    }
    window.addEventListener('message', onMsg)
    return () => {
      window.removeEventListener('message', onMsg)
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
    }
  }, [])

  return (
    <NodeViewWrapper>
      <div
        style={{ border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', margin: '0.75em 0', background: 'var(--code-bg)', position: 'relative' }}
      >
        {/* contentEditable=false stops ProseMirror from placing the text cursor inside the toolbar */}
        <div
          contentEditable={false}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.6rem', borderBottom: '1px solid var(--border)', background: 'var(--surface)', cursor: 'default', userSelect: 'none' }}
        >
          <select
            value={language}
            onChange={(e) => handleLanguageChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', outline: 'none', padding: '2px 4px', cursor: 'pointer' }}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <span style={{ flex: 1 }} />
          {RUNNABLE.includes(language) && (
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={handleRun}
              disabled={running}
              style={{ background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: '3px', color: 'var(--accent)', cursor: running ? 'wait' : 'pointer', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', padding: '2px 8px', opacity: running ? 0.6 : 1 }}
            >
              {running ? '◉ running' : '▶ Run'}
            </button>
          )}
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={handleCopy}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', color: copied ? 'var(--accent)' : 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', padding: '2px 8px' }}
          >
            {copied ? '✓ copied' : 'copy'}
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
            onClick={deleteNode}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '3px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px', fontFamily: 'JetBrains Mono, monospace', padding: '2px 8px' }}
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
          <div style={{ padding: '0.5rem 0.75rem', borderTop: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', whiteSpace: 'pre-wrap', maxHeight: '220px', overflowY: 'auto' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>output › </span>{output}
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={() => setOutput(null)}
              style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '10px' }}
            >
              clear
            </button>
          </div>
        )}
        {/* sandbox MUST include allow-same-origin — blob: URLs are blocked without it */}
        <iframe
          ref={iframeRef}
          style={{ display: 'none', width: 0, height: 0, border: 'none' }}
          sandbox="allow-scripts allow-same-origin"
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
