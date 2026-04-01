/** Last message + unread snapshot for a connection (messages inbox sidebar). */
export interface MessagingInboxPreview {
  content: string;
  createdAt: string;
  senderId: string;
  unreadCount: number;
}
