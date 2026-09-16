export type AppErrorSource = 'boundary' | 'window' | 'unhandledrejection'

export interface AppError {
  id: string
  created_at: string | null
  user_id: string | null
  role_snapshot: string[]
  path: string
  message: string
  stack: string | null
  source: AppErrorSource
  user_agent: string | null
  profiles?: { id?: string; name?: string | null; username?: string | null } | null
}

export type AppErrorInsert = {
  user_id: string | null
  role_snapshot: string[]
  path: string
  message: string
  stack: string | null
  source: AppErrorSource
  user_agent: string | null
}
