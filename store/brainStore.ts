import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface BrainFile {
  path: string
  purpose: string
  calls: string[]
  calledBy: string[]
}

interface BrainState {
  fileMap: BrainFile[]
  summary: string
  lastAnalysed: string | null
  setAnalysis: (payload: { fileMap: BrainFile[]; summary: string }) => void
  clear: () => void
}

export const useBrainStore = create<BrainState>()(
  persist(
    (set) => ({
      fileMap: [],
      summary: '',
      lastAnalysed: null,
      setAnalysis: ({ fileMap, summary }) =>
        set({
          fileMap,
          summary,
          lastAnalysed: new Date().toISOString(),
        }),
      clear: () => set({ fileMap: [], summary: '', lastAnalysed: null }),
    }),
    {
      name: 'helix-brain-store',
      partialize: (state) => ({
        fileMap: state.fileMap,
        summary: state.summary,
        lastAnalysed: state.lastAnalysed,
      }),
    }
  )
)
