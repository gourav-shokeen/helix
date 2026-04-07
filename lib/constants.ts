// lib/constants.ts

export const CURSOR_COLORS = [
    '#00d4a1',
    '#ff8c42',
    '#a78bfa',
    '#4fa3e0',
    '#f87171',
    '#fbbf24',
]

export const APP_NAME = 'Helix'
export const APP_TAGLINE = 'Plan. Code. Collaborate.'

const _RAW_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:1234'

// Auto-upgrade ws:// → wss:// when the page is served over HTTPS.
// Browsers block mixed content (ws:// from an https:// page) with a SecurityError.
export const WS_URL =
  typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? _RAW_WS_URL.replace(/^ws:\/\//, 'wss://')
    : _RAW_WS_URL

export const SLASH_COMMANDS = [
    { id: 'code', icon: '⌥', title: 'Code block', desc: 'Syntax-highlighted code' },
    { id: 'todo', icon: '☐', title: 'Task list', desc: 'Checkable to-do items' },
    { id: 'diagram', icon: '◈', title: 'Diagram', desc: 'Mermaid flowchart, ER, sequence' },
    { id: 'kanban', icon: '▦', title: 'Kanban board', desc: 'Drag-and-drop board' },
    { id: 'brain', icon: '⬡', title: 'Codebase Brain', desc: 'AI explains your code' },
    { id: 'standup', icon: '◈', title: 'Standup template', desc: 'Daily standup format' },
    { id: 'table', icon: '▤', title: 'Table', desc: 'Editable data table' },
]

export const POMODORO = {
    WORK_MINUTES: 25,
    BREAK_MINUTES: 5,
    LONG_BREAK_MINUTES: 15,
    CYCLES_BEFORE_LONG: 4,
}

export const DAILY_PROMPTS = [
    'What did you ship today?',
    'What took longer than expected?',
    'What do you want to remember tomorrow?',
    'What blocked you? How did you get past it?',
    'What are you proud of from today?',
]
