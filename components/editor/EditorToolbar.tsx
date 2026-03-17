'use client'

import { Editor } from '@tiptap/react'

interface Props {
  editor: Editor | null
}

const base = `px-2 py-1 rounded text-xs font-mono 
  border border-transparent transition-colors duration-150`
const on  = `bg-[#00d4a1] text-black border-[#00d4a1]`
const off = `bg-zinc-800 text-zinc-300 
  hover:bg-zinc-700 hover:border-zinc-600`

export default function EditorToolbar({ editor }: Props) {
  if (!editor) return null

  return (
    <div className="flex flex-wrap items-center gap-1 px-3 py-2
      border-b border-zinc-700/50 bg-zinc-900/80 backdrop-blur-sm">

      {/* Bold */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().toggleBold().run()
        }}
        className={`${base} ${editor.isActive('bold') ? on : off} 
          font-bold`}
        title="Bold (⌘B)"
      >
        B
      </button>

      {/* Italic */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().toggleItalic().run()
        }}
        className={`${base} ${editor.isActive('italic') ? on : off} 
          italic`}
        title="Italic (⌘I)"
      >
        I
      </button>

      {/* Highlight */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().toggleHighlight().run()
        }}
        className={`${base} ${editor.isActive('highlight') ? on : off}`}
        title="Highlight"
      >
        H̲
      </button>

      {/* Divider */}
      <div className="w-px h-4 bg-zinc-700 mx-1" />

      {/* H1, H2, H3 */}
      {([1, 2, 3] as const).map((level) => (
        <button
          key={level}
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().toggleHeading({ level }).run()
          }}
          className={`${base} ${
            editor.isActive('heading', { level }) ? on : off
          }`}
          title={`Heading ${level} (⌘⌥${level})`}
        >
          H{level}
        </button>
      ))}

      {/* Normal text (paragraph reset) */}
      <button
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().setParagraph().run()
        }}
        className={`${base} ${
          editor.isActive('paragraph') ? on : off
        }`}
        title="Normal text"
      >
        ¶
      </button>
    </div>
  )
}