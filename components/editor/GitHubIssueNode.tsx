'use client'
// components/editor/GitHubIssueNode.tsx
// Tiptap inline node that renders a GitHub issue chip (#42 · Title · 🟢/🔴)
// Triggered by InputRule: typing #42 followed by a space auto-inserts the chip.

import React, { useEffect, useState } from 'react'
import { Node, mergeAttributes, InputRule } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'

// ─── React Node View ──────────────────────────────────────────────────────────

function GitHubIssueView({ node }: NodeViewProps) {
  const { number, repo, title: cachedTitle, state: cachedState, url: cachedUrl } = node.attrs as {
    number: string
    repo: string | null
    title: string | null
    state: string
    url: string | null
  }

  const [issue, setIssue] = useState({
    title: cachedTitle,
    state: cachedState ?? 'open',
    url: cachedUrl,
    loading: !cachedTitle && !!repo,
  })

  useEffect(() => {
    if (cachedTitle || !repo || !number) return
    fetch(`/api/github/issue?repo=${encodeURIComponent(repo)}&issue=${encodeURIComponent(number)}`)
      .then(r => r.json())
      .then((data: { title?: string; state?: string; url?: string }) => {
        setIssue({ title: data.title ?? null, state: data.state ?? 'unknown', url: data.url ?? null, loading: false })
      })
      .catch(() => setIssue(d => ({ ...d, loading: false })))
  }, [number, repo, cachedTitle])

  const stateIcon = issue.state === 'open' ? '🟢' : issue.state === 'closed' ? '🔴' : '⬜'
  const label = issue.loading
    ? `#${number}…`
    : issue.title
      ? `#${number} · ${issue.title.slice(0, 45)}${issue.title.length > 45 ? '…' : ''} · ${stateIcon}`
      : `#${number}`

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <a
        href={issue.url ?? `https://github.com/${repo ?? ''}/issues/${number}`}
        target="_blank"
        rel="noopener noreferrer"
        contentEditable={false}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: '#1a1a2e',
          border: '1px solid #2a2a3e',
          borderRadius: 4,
          padding: '1px 7px',
          fontSize: '11px',
          color: '#e0e0e0',
          textDecoration: 'none',
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          verticalAlign: 'middle',
          lineHeight: 1.6,
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        }}
        title={`GitHub Issue ${repo ? `(${repo})` : ''}`}
      >
        {label}
      </a>
    </NodeViewWrapper>
  )
}

// ─── Extension ───────────────────────────────────────────────────────────────

export interface GitHubIssueNodeOptions {
  /** Owner/repo string, e.g. "facebook/react". When set, issues are fetched. */
  repo: string | null
}

export const GitHubIssueNode = Node.create<GitHubIssueNodeOptions>({
  name: 'githubIssue',
  group: 'inline',
  inline: true,
  atom: true,

  addOptions() {
    return { repo: null }
  },

  addAttributes() {
    return {
      number: { default: null },
      repo: { default: null },
      title: { default: null },
      state: { default: 'open' },
      url: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-github-issue]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-github-issue': '' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(GitHubIssueView)
  },

  addInputRules() {
    const repo = this.options.repo
    return [
      new InputRule({
        find: /#(\d+) $/,
        handler: ({ range, match, chain }) => {
          const number = match[1]
          chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: this.name,
              attrs: { number, repo, title: null, state: 'open', url: null },
            })
            .insertContent(' ')
            .run()
        },
      }),
    ]
  },
})
