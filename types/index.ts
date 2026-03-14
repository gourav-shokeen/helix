// types/index.ts

export interface User {
  id: string
  email: string
  name: string
  avatar_url?: string
  created_at: string
}

export interface Document {
  id: string
  title: string
  owner_id: string
  is_public: boolean
  type: 'document' | 'journal'
  journal_date?: string
  github_repo?: string
  created_at: string
  updated_at: string
}

export interface DocumentMember {
  document_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
}

export interface Presence {
  userId: string
  name: string
  color: string
}

export interface KanbanCard {
  id: string
  title: string
  assignee?: string
  description?: string
  label?: string
  color?: string
  dueDate?: string
  createdAt?: string
}

export interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

export type BrainMode = 'explain' | 'imports' | 'find' | 'summarize'

export type Theme = 'dark' | 'light'

export type PomodoroState = 'idle' | 'working' | 'break' | 'longBreak'

export interface MermaidNode {
  id: string
  syntax: string
}

export interface GitHubConnection {
  id: string
  user_id: string
  token: string
  github_username: string
  connected_at: string
}

export interface GitHubCommit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

export interface GitHubIssue {
  number: number
  title: string
  state: 'open' | 'closed'
  url: string
}
