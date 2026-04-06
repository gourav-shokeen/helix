// app/api/comments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/auth'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const thread_id = request.nextUrl.searchParams.get('thread_id')
    if (!thread_id) {
      return NextResponse.json({ error: 'Missing thread_id' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('comments')
      .select('*')
      .eq('thread_id', thread_id)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[comments GET]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ comments: data ?? [] })
  } catch (err) {
    console.error('[API] /api/comments GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = session.user

    const body = await request.json()
    const { thread_id, body: commentBody } = body

    if (!thread_id || !commentBody?.trim()) {
      return NextResponse.json({ error: 'Missing thread_id or comment body' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('comments')
      .insert({ 
        thread_id, 
        body: commentBody.trim(), 
        author_id: user.id 
      })
      .select()
      .single()

    if (error) {
      console.error('[comments] Insert failed:', error)
      return NextResponse.json({ error: `Failed to create comment: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, comment: data })
  } catch (err) {
    console.error('[API] /api/comments error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}