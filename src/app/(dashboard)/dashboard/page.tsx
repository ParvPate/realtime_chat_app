import { getFriendsByUserId } from '@/helpers/get-friends-by-user-id'
import { fetchRedis } from '@/helpers/redis'
import { authOptions } from '@/lib/auth'
import { chatHrefConstructor } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Message, User } from '@/types/db'

const page = async ({}) => {
  const session = await getServerSession(authOptions)
  if (!session) notFound()

  //const friends = await getFriendsByUserId(session.user.id)

  const friendIds = await fetchRedis('smembers', `user:${session.user.id}:friends`) as string[]

  const friends = await Promise.all(
  friendIds.map(async (id): Promise<User> => {
    const raw = await fetchRedis('get', `user:${id}`)
    return JSON.parse(raw as string) as User
  })
)

  const friendsWithLastMessage = await Promise.all(
    friends.map(async (friend) => {
      const [lastMessageRaw] = (await fetchRedis(
        'zrange',
        `chat:${chatHrefConstructor(session.user.id, friend.id)}:messages`,
        -1,
        -1
      )) as string[]

      const lastMessage = lastMessageRaw ? JSON.parse(lastMessageRaw) as Message : null

      return {
        ...friend,
        lastMessage,
      }
    })
  )

  const groupsRaw = await fetchRedis('smembers', `user:${session.user.id}:groups`) as string[]
  const groups = await Promise.all(
    groupsRaw.map(async (groupId) => {
      const groupData = await fetchRedis('get', `groups:${groupId}`)
      if (!groupData) return null
      const group = JSON.parse(groupData) as { id: string, name: string, image?: string }
      return group
    })
  )

  return (
    <div className='container py-12'>
      <h1 className='font-bold text-5xl mb-8'>Recent chats</h1>
      {friendsWithLastMessage.length === 0 ? (
        <p className='text-sm text-zinc-500'>Nothing to show here...</p>
      ) : (
        friendsWithLastMessage.map((friend) => (
          <div
            key={friend.id}
            className='relative bg-zinc-50 border border-zinc-200 p-3 rounded-md'>
            <div className='absolute right-4 inset-y-0 flex items-center'>
              <ChevronRight className='h-7 w-7 text-zinc-400' />
            </div>

            <Link
              href={`/dashboard/chat/${chatHrefConstructor(
                session.user.id,
                friend.id
              )}`}
              className='relative sm:flex'>
              <div className='mb-4 flex-shrink-0 sm:mb-0 sm:mr-4'>
                <div className='relative h-6 w-6'>
                  <Image
                    referrerPolicy='no-referrer'
                    className='rounded-full'
                    alt={`${friend.name} profile picture`}
                    src={friend.image}
                    fill
                  />
                </div>
              </div>

              <div>
                <h4 className='text-lg font-semibold'>{friend.name}</h4>
                <p className='mt-1 max-w-md'>
                  <span className='text-zinc-400'>
                    {friend.lastMessage?.senderId === session.user.id
                      ? 'You: '
                      : ''}
                  </span>
                  {friend.lastMessage?.text}
                </p>
              </div>
            </Link>
          </div>
        ))
      )}
      <h2 className="font-bold text-3xl mt-8 mb-4">Your Groups</h2>
      {groups.filter(Boolean).length === 0 ? (
        <p className='text-sm text-zinc-500'>No groups yet...</p>
      ) : (
        groups.filter(Boolean).map((group) => (
          <div
            key={group!.id}
            className='relative bg-zinc-50 border border-zinc-200 p-3 rounded-md'>
            <Link href={`/dashboard/chat/group-${group!.id}`} className='relative sm:flex'>
              <div className='mb-4 flex-shrink-0 sm:mb-0 sm:mr-4'>
                <div className='relative h-6 w-6'>
                  <Image
                    referrerPolicy='no-referrer'
                    className='rounded-full'
                    alt={`${group!.name} group picture`}
                    src={group!.image || '/default-group.png'}
                    fill
                  />
                </div>
              </div>
              <div>
                <h4 className='text-lg font-semibold'>{group!.name}</h4>
              </div>
            </Link>
          </div>
        ))
      )}
    </div>
  )
}

export default page
