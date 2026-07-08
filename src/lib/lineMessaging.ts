const LINE_MULTICAST_URL = "https://api.line.me/v2/bot/message/multicast";

export function parseLineNotifyUserIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .map((id) => id.trim())
        .filter(Boolean)
    ),
  ];
}

export function isLineMessagingConfigured(): boolean {
  return Boolean(
    process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() &&
      parseLineNotifyUserIds(process.env.LINE_NOTIFY_USER_IDS).length > 0
  );
}

/** LINE Messaging API で管理者へテキスト通知（未設定時は何もしない） */
export async function sendLineMulticast(text: string): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const userIds = parseLineNotifyUserIds(process.env.LINE_NOTIFY_USER_IDS);
  if (!token || userIds.length === 0 || !text.trim()) return;

  const response = await fetch(LINE_MULTICAST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      to: userIds,
      messages: [{ type: "text", text: text.slice(0, 5000) }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`LINE multicast failed (${response.status}): ${body}`);
  }
}
