export interface LinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

export interface MentionData {
  username: string;
  user_id: string;
}

export interface Post {
  id: string;
  chapter_id: string;
  author_id: string;
  content: string;
  post_type: 'text' | 'image' | 'text_image';
  image_url?: string;
  /** True when post has an image but URL was omitted (slim feed). Load via per-post endpoint when in view. */
  has_image?: boolean;
  metadata?: Record<string, any> & {
    link_previews?: LinkPreview[];
    mentions?: MentionData[];
    profile_update?: {
      source: 'profile_update_prompt';
      changed_fields: string[];
      change_types: string[];
    }
  };
  likes_count: number;
  comments_count: number;
  shares_count: number;
  created_at: string;
  updated_at: string;
  author?: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    chapter_role?: string;
    member_status?: string;
  };
  is_liked?: boolean;
  is_author?: boolean;
  is_bookmarked?: boolean;
  /**
   * Lightweight snapshot of the most recent comments returned with the feed payload.
   * Use this to show counts/teasers without triggering the full comments fetch.
   */
  comments_preview?: PostCommentPreview[];
}

export interface PostLike {
  id: string;
  post_id: string;
  user_id: string;
  created_at: string;
  user?: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
}

export interface PostComment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  likes_count: number;
  created_at: string;
  updated_at: string;
  parent_comment_id?: string | null;
  metadata?: Record<string, any> & {
    link_previews?: LinkPreview[];
    mentions?: MentionData[];
  };
  author?: {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };
  is_liked?: boolean;
  replies?: PostComment[];
}

export type PostCommentPreview = Omit<PostComment, 'is_liked'>;

export interface CreatePostRequest {
  content: string;
  post_type: 'text' | 'image' | 'text_image';
  image_url?: string;
  metadata?: Record<string, any> & {
    image_urls?: string[];
    image_count?: number;
    link_previews?: LinkPreview[];
    profile_updates?: {
      source: 'profile_update_prompt';
      changed_fields: string[];
      changed_types: string[];
    };
  };
}

/** Body for PATCH /api/posts/[id] — content-only edits (server keeps image_url / metadata intact). */
export interface UpdatePostRequest {
  content: string;
}

export interface CreateCommentRequest {
  content: string;
  parent_comment_id?: string | null;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface CommentsResponse {
  comments: PostComment[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface PostsResponse {
  posts: Post[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
