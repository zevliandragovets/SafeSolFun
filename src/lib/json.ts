import { NextResponse } from 'next/server'

export function json(data: unknown, init?: ResponseInit) {
  const body = JSON.stringify(
    data,
    (_, v) =>
      typeof v === 'bigint'
        ? v.toString()
        : v instanceof Date
        ? v.toISOString()
        : v
  )
  return new NextResponse(body, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  })
}
