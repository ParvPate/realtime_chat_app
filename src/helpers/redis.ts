const upstashRedisRestUrl = process.env.UPSTASH_REDIS_REST_URL
const authToken = process.env.UPSTASH_REDIS_REST_TOKEN

type Command = 'zrange' | 'sismember' | 'get' | 'smembers' | 'keys' | 'scan'

export async function fetchRedis(
  command: Command,
  ...args: (string | number)[]
) {
  let commandUrl: string

  if (command === 'scan') {
    // Build Upstash SCAN URL: /scan/{cursor}?match=pattern&count=n
    const [cursorRaw, ...rest] = args
    const cursor = String(cursorRaw ?? 0)
    const url = new URL(`${upstashRedisRestUrl}/scan/${encodeURIComponent(cursor)}`)

    // Parse optional pairs like ['match', 'groups:*', 'count', 1000]
    for (let i = 0; i < rest.length; i += 2) {
      const key = String(rest[i] ?? '').toLowerCase()
      const val = String(rest[i + 1] ?? '')
      if (!key) continue
      if (key === 'match') url.searchParams.set('match', val)
      if (key === 'count') url.searchParams.set('count', val)
    }
    commandUrl = url.toString()
  } else {
    commandUrl = `${upstashRedisRestUrl}/${command}/${args.join('/')}`
  }

  const response = await fetch(commandUrl, {
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Error executing Redis command: ${response.statusText}`)
  }

  const data = await response.json()
  return data.result
}
