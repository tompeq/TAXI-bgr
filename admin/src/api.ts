import type {
  ApiErrorBody,
  Dashboard,
  DriverDetail,
  DriverFinanceList,
  DriverList,
  SessionResponse,
  TariffList,
  TariffSetting,
  OrderKind,
  ServiceZone,
  VerificationStatus,
  ServiceSettings,
  RoadConditionList,
  RoadConditionState,
  SupportConversation,
  SupportConversationList,
  SupportConversationStatus,
  SurveyList,
  SurveyResponseList,
  SurveyTemplate,
  AnnouncementList,
  UserAnnouncement,
  ReputationList,
  UserRatingDetails,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
const SESSION_KEY = "taxi-bgr-admin-session";

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function readSession(): SessionResponse | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionResponse;
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

export function saveSession(session: SessionResponse): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

async function parseError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody = {};
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // The server can return an empty body for infrastructure errors.
  }
  const rawMessage = body.message;
  const message = Array.isArray(rawMessage)
    ? rawMessage.join(", ")
    : rawMessage || "Не удалось выполнить запрос";
  return new ApiError(message, response.status, body.code);
}

async function refreshSession(): Promise<SessionResponse | null> {
  const current = readSession();
  if (!current?.refreshToken) return null;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: current.refreshToken }),
  });
  if (!response.ok) {
    clearSession();
    return null;
  }

  const next = (await response.json()) as SessionResponse;
  if (next.user.role !== "admin") {
    clearSession();
    return null;
  }
  saveSession(next);
  return next;
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  canRefresh = true,
): Promise<T> {
  const session = readSession();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.accessToken) {
    headers.set("Authorization", `Bearer ${session.accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && canRefresh && (await refreshSession())) {
    return apiRequest<T>(path, init, false);
  }
  if (!response.ok) throw await parseError(response);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function requestOtp(phone: string) {
  const response = await fetch(`${API_URL}/auth/otp/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!response.ok) throw await parseError(response);
  return response.json() as Promise<{
    challengeId: string;
    expiresInSeconds: number;
    resendAfterSeconds: number;
    debugCode?: string;
  }>;
}

export async function verifyOtp(challengeId: string, code: string) {
  const response = await fetch(`${API_URL}/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      challengeId,
      code,
      role: "admin",
      deviceName: "Taxi Bgr Admin",
    }),
  });
  if (!response.ok) throw await parseError(response);
  const session = (await response.json()) as SessionResponse & {
    status: "authenticated" | "registration_required";
  };
  if (session.status !== "authenticated" || session.user?.role !== "admin") {
    throw new ApiError("У этого номера нет доступа к админ-панели", 403);
  }
  saveSession(session);
  return session;
}

export async function logout(): Promise<void> {
  try {
    await apiRequest<void>("/auth/logout", { method: "POST" }, false);
  } finally {
    clearSession();
  }
}

export const adminApi = {
  dashboard: () => apiRequest<Dashboard>("/admin/dashboard"),
  driverFinances: () => apiRequest<DriverFinanceList>("/admin/driver-finance"),
  tariffs: () => apiRequest<TariffList>("/admin/tariffs"),
  settings: () => apiRequest<ServiceSettings>("/admin/settings"),
  updateSettings: (settings: Omit<ServiceSettings, "version" | "updatedAt">) =>
    apiRequest<ServiceSettings>("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),
  roadConditions: () => apiRequest<RoadConditionList>("/admin/road-conditions"),
  updateRoadCondition: (area: "bgr" | "harbor", surchargeActive: boolean) =>
    apiRequest<RoadConditionState>(`/admin/road-conditions/${area}`, {
      method: "PATCH",
      body: JSON.stringify({ surchargeActive }),
    }),
  updateTariff: (
    kind: OrderKind,
    zone: ServiceZone,
    fares: Pick<TariffSetting, "dayFare" | "eveningFare" | "nightFare">,
  ) =>
    apiRequest<TariffSetting>(`/admin/tariffs/${kind}/${zone}`, {
      method: "PATCH",
      body: JSON.stringify(fares),
    }),
  drivers: (status?: VerificationStatus, search?: string) => {
    const query = new URLSearchParams();
    if (status) query.set("status", status);
    if (search) query.set("search", search);
    query.set("pageSize", "100");
    return apiRequest<DriverList>(`/admin/drivers?${query.toString()}`);
  },
  driver: (id: string) => apiRequest<DriverDetail>(`/admin/drivers/${id}`),
  updateDriverCommission: (
    id: string,
    commissionPercentOverride: number | null,
  ) =>
    apiRequest<DriverDetail>(`/admin/drivers/${id}/commission`, {
      method: "PATCH",
      body: JSON.stringify({ commissionPercentOverride }),
    }),
  adjustDriverCommissionDebt: (id: string, targetDebt: number, note?: string) =>
    apiRequest<DriverDetail>(`/admin/drivers/${id}/commission-debt`, {
      method: "PATCH",
      body: JSON.stringify({ targetDebt, note }),
    }),
  recordDriverCommissionSettlement: (
    id: string,
    amount: number,
    note?: string,
  ) =>
    apiRequest<DriverDetail>(`/admin/drivers/${id}/commission-settlements`, {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    }),
  reviewDriver: (
    id: string,
    decision: "approve" | "reject" | "request_changes" | "block",
    comment?: string,
  ) =>
    apiRequest<DriverDetail>(`/admin/drivers/${id}/review`, {
      method: "PATCH",
      body: JSON.stringify({ decision, comment }),
    }),
  supportConversations: (status?: SupportConversationStatus) => {
    const query = new URLSearchParams({ pageSize: "100" });
    if (status) query.set("status", status);
    return apiRequest<SupportConversationList>(
      `/admin/support/conversations?${query.toString()}`,
    );
  },
  supportConversation: (id: string) =>
    apiRequest<SupportConversation>(`/admin/support/conversations/${id}`),
  sendSupportMessage: (id: string, body: string) =>
    apiRequest<SupportConversation>(
      `/admin/support/conversations/${id}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ body }),
      },
    ),
  updateSupportConversationStatus: (
    id: string,
    status: SupportConversationStatus,
  ) =>
    apiRequest<SupportConversation>(`/admin/support/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  surveys: () => apiRequest<SurveyList>("/admin/surveys"),
  createSurvey: (survey: Omit<SurveyTemplate, "id" | "responseCount">) =>
    apiRequest<SurveyTemplate>("/admin/surveys", {
      method: "POST",
      body: JSON.stringify(survey),
    }),
  updateSurvey: (
    id: string,
    survey: Omit<SurveyTemplate, "id" | "responseCount">,
  ) =>
    apiRequest<SurveyTemplate>(`/admin/surveys/${id}`, {
      method: "PUT",
      body: JSON.stringify(survey),
    }),
  surveyResponses: (id: string) =>
    apiRequest<SurveyResponseList>(`/admin/surveys/${id}/responses`),
  announcements: () =>
    apiRequest<AnnouncementList>("/admin/announcements"),
  createAnnouncement: (announcement: {
    title: string;
    body: string;
    targetRole: "passenger" | "driver" | "all" | null;
    targetUserId: string | null;
    targetPhone: string | null;
    enabled: boolean;
  }) =>
    apiRequest<UserAnnouncement>("/admin/announcements", {
      method: "POST",
      body: JSON.stringify(announcement),
    }),
  updateAnnouncement: (
    id: string,
    announcement: Partial<
      Pick<
        UserAnnouncement,
        | "title"
        | "body"
        | "targetRole"
        | "targetUserId"
        | "targetPhone"
        | "enabled"
      >
    >,
  ) =>
    apiRequest<UserAnnouncement>(`/admin/announcements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(announcement),
    }),
  reputation: () => apiRequest<ReputationList>("/admin/reputation"),
  userRatings: (userId: string) =>
    apiRequest<UserRatingDetails>(`/admin/reputation/${userId}/ratings`),
};
