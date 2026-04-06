// app/api/threads/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = session.user
    const supabase = await createClient()

    const body = await request.json()
    const { doc_id, anchor_text, selected_range } = body

    if (!doc_id || !anchor_text) {
      return NextResponse.json({ error: 'Missing doc_id or anchor_text' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('threads')
      .insert({ 
        doc_id, 
        anchor_text, 
        created_by: user.id 
      })
      .select()
      .single()

    if (error) {
      console.error('[threads] Insert failed:', error)
      return NextResponse.json({ error: `Failed to create thread: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      thread: data 
    })
  } catch (err) {
    console.error('[API] /api/threads error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = session.user
    const supabase = await createClient()

    const body = await request.json()
    const { thread_id, resolved } = body

    if (!thread_id || typeof resolved !== 'boolean') {
      return NextResponse.json({ error: 'Missing thread_id or resolved flag' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('threads')
      .update({ resolved })
      .eq('id', thread_id)
      .select()
      .single()

    if (error) {
      console.error('[threads] Update failed:', error)
      return NextResponse.json({ error: `Failed to update thread: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      thread: data 
    })
  } catch (err) {
    console.error('[API] /api/threads PATCH error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}