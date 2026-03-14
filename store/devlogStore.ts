import { create } from 'zustand'

export interface DevlogEntry {
  id: string
  user_id: string
  date: string
  content: string
  project_id: string | null
  mood: string | null
  created_at: string
  updated_at: string
}

interface DevlogState {
  entries: DevlogEntry[]
  activeDate: string
  status: 'idle' | 'saving' | 'error'
  setEntries: (entries: DevlogEntry[]) => void
  setActiveDate: (date: string) => void
  setStatus: (status: DevlogState['status']) => void
  upsertEntry: (entry: DevlogEntry) => void
  patchEntryByDate: (date: string, patch: Partial<DevlogEntry>) => void
}

const today = () => new Date().toISOString().split('T')[0]

export const useDevlogStore = create<DevlogState>((set) => ({
  entries: [],
  activeDate: today(),
  status: 'idle',
  setEntries: (entries) => set({ entries }),
  setActiveDate: (activeDate) => set({ activeDate }),
  setStatus: (status) => set({ status }),
  upsertEntry: (entry) =>
    set((state) => {
      const found = state.entries.find((item) => item.id === entry.id)
      if (found) {
        return {
          entries: state.entries.map((item) => (item.id === entry.id ? entry : item)),
        }
      }
      return {
        entries: [entry, ...state.entries].sort((a, b) => (a.date < b.date ? 1 : -1)),
      }
    }),
  patchEntryByDate: (date, patch) =>
    set((state) => ({
      entries: state.entries.map((item) => (item.date === date ? { ...item, ...patch } : item)),
    })),
}))
