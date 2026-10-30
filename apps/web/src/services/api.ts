/**
 * api.ts — Funções de comunicação com o backend NestJS.
 *
 * POR QUÊ centralizar: Evita duplicação de lógica de fetch/JWT em cada componente.
 * O token JWT é lido do localStorage e injetado automaticamente quando presente.
 */

const API_BASE =
  import.meta.env.VITE_API_URL || `${window.location.origin}/api`;

function getToken(): string | null {
  return localStorage.getItem('dyswis_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Token ausente, inválido ou expirado — limpa a sessão local
      localStorage.removeItem('dyswis_token');
      localStorage.removeItem('dyswis_user');
      window.dispatchEvent(new Event('dyswis:auth_expired'));
    }
    let msg = body.message;
    if (!msg || typeof msg !== 'string' || msg.toLowerCase() === 'internal server error') {
      msg =
        res.status >= 500
          ? 'Ocorreu uma instabilidade temporária no servidor. Por favor, tente novamente em instantes.'
          : 'Ocorreu um erro ao processar sua requisição.';
    }
    throw new ApiError(res.status, msg);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// --------------------------------------------------------------------------
// Auth
// --------------------------------------------------------------------------

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; name: string };
}

export function register(email: string, password: string, name: string) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, name }),
  });
}

export function login(email: string, password: string) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

// --------------------------------------------------------------------------
// Rooms
// --------------------------------------------------------------------------

export interface Room {
  id: string;
  inviteToken: string;
  shortCode?: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  name: string;
  pdfPath: string | null;
  hasPassword?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface RoomDetail {
  id: string;
  name: string;
  inviteToken: string;
  shortCode: string | null;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  pdfPath: string | null;
  videoPath: string | null;
  description: string | null;
  hostId: string;
  host: { name: string };
  hasPassword: boolean;
  createdAt: string;
}

export function createRoom(name: string, password?: string) {
  return request<Room>('/rooms', {
    method: 'POST',
    body: JSON.stringify({ name, ...(password ? { password } : {}) }),
  });
}

export function getMyRooms() {
  return request<Room[]>('/rooms');
}

export function getRoomById(id: string, token: string) {
  return request<RoomDetail>(
    `/rooms/${encodeURIComponent(id)}?token=${encodeURIComponent(token)}`,
  );
}

export function getRoomByCode(code: string) {
  return request<RoomDetail>(`/rooms/code/${encodeURIComponent(code)}`);
}


export function verifyRoomPassword(
  id: string,
  token: string,
  password: string,
) {
  return request<{ ok: boolean }>(
    `/rooms/${encodeURIComponent(id)}/verify-password?token=${encodeURIComponent(token)}`,
    { method: 'POST', body: JSON.stringify({ password }) },
  );
}

export async function uploadRoomPdf(roomId: string, file: File) {
  const jwtToken = getToken();
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(
      `${API_BASE}/rooms/${encodeURIComponent(roomId)}/upload-pdf`,
      {
        method: 'POST',
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        body: formData,
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      let msg = body.message;
      if (
        res.status === 413 ||
        (typeof msg === 'string' &&
          (msg.includes('File too large') ||
            msg.includes('LIMIT_FILE_SIZE') ||
            msg.includes('exceeded') ||
            msg.includes('52428800')))
      ) {
        msg =
          'O arquivo PDF excede o limite máximo permitido de 20 MB. Por favor, envie um documento menor.';
      } else if (
        !msg ||
        typeof msg !== 'string' ||
        msg.toLowerCase() === 'internal server error'
      ) {
        msg =
          'Ocorreu uma falha no servidor ao processar o upload do PDF. Por favor, tente novamente.';
      }
      throw new ApiError(res.status, msg);
    }

    return (await res.json()) as { id: string; pdfPath: string };
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      0,
      'Connection failure while uploading PDF. Please check your network and file size.',
    );
  }
}

export async function uploadRoomVideo(roomId: string, file: File) {
  const jwtToken = getToken();
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(
      `${API_BASE}/rooms/${encodeURIComponent(roomId)}/upload-video`,
      {
        method: 'POST',
        headers: jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {},
        body: formData,
      },
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      let msg = body.message;
      if (
        res.status === 413 ||
        (typeof msg === 'string' &&
          (msg.includes('File too large') ||
            msg.includes('LIMIT_FILE_SIZE') ||
            msg.includes('exceeded') ||
            msg.includes('52428800')))
      ) {
        msg =
          'O vídeo excede o limite máximo permitido de 50 MB. Por favor, envie um arquivo menor ou comprimido.';
      } else if (
        !msg ||
        typeof msg !== 'string' ||
        msg.toLowerCase() === 'internal server error'
      ) {
        msg =
          'Ocorreu uma falha no servidor ao processar o upload do vídeo. Por favor, tente novamente.';
      }
      throw new ApiError(res.status, msg);
    }

    return (await res.json()) as { id: string; videoPath: string };
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(
      0,
      'Connection failure while uploading video. Please check your network and file size.',
    );
  }
}

export function removeRoomPdf(roomId: string) {
  return request<{ id: string; pdfPath: string | null }>(`/rooms/${encodeURIComponent(roomId)}/pdf`, {
    method: 'DELETE',
  });
}

export function removeRoomVideo(roomId: string) {
  return request<{ id: string; videoPath: string | null }>(`/rooms/${encodeURIComponent(roomId)}/video`, {
    method: 'DELETE',
  });
}

export function updateRoomDescription(roomId: string, description: string) {
  return request<{ id: string; description: string }>(
    `/rooms/${encodeURIComponent(roomId)}/description`,
    { method: 'PATCH', body: JSON.stringify({ description }) },
  );
}

export function deleteRoom(roomId: string) {
  return request<{ success: boolean }>(`/rooms/${encodeURIComponent(roomId)}`, {
    method: 'DELETE',
  });
}

export function joinRoomByCode(code: string, password?: string) {
  return request<{ id: string; inviteToken: string; status: string }>('/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ code, ...(password ? { password } : {}) }),
  });
}

export function updateRoomStatus(roomId: string, status: string) {
  return request<{ id: string; status: string }>(
    `/rooms/${encodeURIComponent(roomId)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
}

// --------------------------------------------------------------------------
// Annotations
// --------------------------------------------------------------------------

export interface Annotation {
  id: string;
  userId: string;
  roomId: string;
  blockId?: string | null;
  originalText?: string | null;
  mediaId?: string | null;
  pdfPage?: number | null;
  pdfX?: number | null;
  pdfY?: number | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  room?: {
    name: string;
    pdfPath: string | null;
    inviteToken: string;
    description?: string | null;
  };
}

export function getAnnotations(roomId: string, mediaId?: string) {
  let url = `/annotations?roomId=${encodeURIComponent(roomId)}`;
  if (mediaId) url += `&mediaId=${encodeURIComponent(mediaId)}`;
  return request<Annotation[]>(url);
}

export function getAllAnnotations() {
  return request<Annotation[]>('/annotations/all');
}

export function createAnnotation(data: Partial<Annotation> & { roomId: string; content: string }) {
  return request<Annotation>('/annotations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateAnnotation(id: string, content: string) {
  return request<Annotation>(`/annotations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });
}

export function deleteAnnotation(id: string) {
  return request<{ success: boolean }>(`/annotations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ========================
// Highlights (Marcações/Sublinhados)
// ========================

export interface Highlight {
  id: string;
  userId: string;
  roomId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  color: string;
  text?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getHighlights(roomId: string) {
  return request<Highlight[]>(`/highlights?roomId=${encodeURIComponent(roomId)}`);
}

export function createHighlight(data: {
  roomId: string;
  blockId: string;
  startOffset: number;
  endOffset: number;
  color?: string;
  text?: string;
}) {
  return request<Highlight>('/highlights', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function updateHighlightColor(id: string, color: string) {
  return request<Highlight>(`/highlights/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ color }),
  });
}

export function deleteHighlight(id: string) {
  return request<{ success: boolean }>(`/highlights/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}
