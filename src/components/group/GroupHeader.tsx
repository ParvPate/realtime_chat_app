'use client'

import { GroupInfo, GroupMember } from '@/types/group'
import { MoreHorizontal, Users, Bell } from 'lucide-react'

type Props = {
  info: GroupInfo
  members: GroupMember[]
  onOpenMembers: () => void
}

export default function GroupHeader({ info, members, onOpenMembers }: Props) {
  return (
    <div className="flex items-center justify-between border-b px-4 py-2 bg-white">
      <div>
        <div className="font-semibold">{info.name}</div>
        <div className="text-xs text-gray-500">{members.length} members</div>
      </div>
      <div className="flex items-center gap-2">
        {/* (local-only for now) notification settings could be wired later */}
        <button className="p-2 rounded-lg hover:bg-gray-100" title="Notifications">
          <Bell size={18} />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-100" onClick={onOpenMembers} title="Members">
          <Users size={18} />
        </button>
        <button className="p-2 rounded-lg hover:bg-gray-100" title="More">
          <MoreHorizontal size={18} />
        </button>
      </div>
    </div>
  )
}