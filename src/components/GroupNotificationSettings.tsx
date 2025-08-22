'use client'

import { useState } from 'react'

interface NotificationSettingsProps {
  groupId: string
  currentSettings: {
    muted: boolean
    mentions: boolean
    keywords: string[]
  }
}

export default function GroupNotificationSettings({ groupId, currentSettings }: NotificationSettingsProps) {
  const [muted, setMuted] = useState(currentSettings.muted)
  const [mentions, setMentions] = useState(currentSettings.mentions)
  const [keywords, setKeywords] = useState(currentSettings.keywords.join(', '))

  const saveSettings = async () => {
    try {
      await fetch(`/api/groups/${groupId}/notifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          muted,
          mentions,
          keywords: keywords.split(',').map(k => k.trim()).filter(k => k.length > 0)
        })
      })
    } catch (error) {
      console.error('Failed to save notification settings:', error)
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">Notification Settings</h3>
      
      <div className="space-y-3">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={muted}
            onChange={(e) => setMuted(e.target.checked)}
          />
          <span>Mute all notifications</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={mentions}
            onChange={(e) => setMentions(e.target.checked)}
            disabled={muted}
          />
          <span>Notify on mentions</span>
        </label>

        <div>
          <label className="block text-sm font-medium mb-1">
            Keywords (comma-separated)
          </label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            disabled={muted}
            placeholder="urgent, important, meeting"
            className="w-full p-2 border rounded"
          />
        </div>
      </div>

      <button
        onClick={saveSettings}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Save Settings
      </button>
    </div>
  )
}