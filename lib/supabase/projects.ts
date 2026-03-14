// lib/supabase/projects.ts — Project Plan Room data layer
import { createClient } from './client'

// ── Project Boards ─────────────────────────────────────────

export async function getBoard(projectId: string) {
  const supabase = createClient()
  return supabase
    .from('project_boards')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle()
}

export async function getBoardById(boardId: string) {
  const supabase = createClient()
  return supabase
    .from('project_boards')
    .select('*')
    .eq('id', boardId)
    .maybeSingle()
}

export async function createBoard(projectId: string, data: unknown) {
  const supabase = createClient()
  return supabase
    .from('project_boards')
    .insert({ project_id: projectId, data })
    .select()
    .single()
}

export async function upsertBoard(projectId: string, data: unknown) {
  const supabase = createClient()
  return supabase
    .from('project_boards')
    .upsert({ project_id: projectId, data }, { onConflict: 'project_id' })
    .select()
    .single()
}

// ── Sprints ────────────────────────────────────────────────

export async function getSprints(projectId: string) {
  const supabase = createClient()
  return supabase
    .from('sprints')
    .select('*')
    .eq('project_id', projectId)
    .order('start_date', { ascending: false })
}

export async function createSprint(projectId: string, name: string, startDate: string, endDate: string) {
  const supabase = createClient()
  return supabase
    .from('sprints')
    .insert({ project_id: projectId, name, start_date: startDate, end_date: endDate })
    .select()
    .single()
}

// ── Decisions ─────────────────────────────────────────────

export async function getDecisions(projectId: string) {
  const supabase = createClient()
  return supabase
    .from('decisions')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
}

export async function addDecision(projectId: string, body: string) {
  const supabase = createClient()
  return supabase
    .from('decisions')
    .insert({ project_id: projectId, body })
    .select()
    .single()
}

// ── Meeting Notes ──────────────────────────────────────────

export async function getMeetingNotes(projectId: string) {
  const supabase = createClient()
  return supabase
    .from('meeting_notes')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
}

export async function saveMeetingNote(projectId: string, content: string, sprintId?: string) {
  const supabase = createClient()
  return supabase
    .from('meeting_notes')
    .insert({ project_id: projectId, content, sprint_id: sprintId ?? null })
    .select()
    .single()
}

export async function updateMeetingNote(noteId: string, content: string, sprintId?: string | null) {
  const supabase = createClient()
  return supabase
    .from('meeting_notes')
    .update({ content, sprint_id: sprintId ?? null })
    .eq('id', noteId)
    .select()
    .single()
}
