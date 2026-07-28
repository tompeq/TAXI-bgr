export type VerificationStatus =
  "pending" | "approved" | "rejected" | "changes_requested" | "blocked";

export interface AdminUser {
  id: string;
  phone: string;
  name: string;
  role: "admin";
  status: "active";
}

export interface SessionResponse {
  status?: "authenticated";
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: AdminUser;
}

export interface Dashboard {
  pendingDrivers: number;
  approvedDrivers: number;
  blockedDrivers: number;
  registeredUsers: number;
  orders: {
    created: number;
    completed: number;
    notCompleted: number;
  };
  activity: {
    loginsTotal: number;
    logoutsTotal: number;
    loginsToday: number;
    logoutsToday: number;
  };
  finance: {
    commissionDebt: number;
    driverEarningsToday: number;
  };
}

export type OrderKind = "taxi" | "delivery";
export type ServiceZone =
  "upper_bgr" | "kombinat" | "lower_harbor" | "quarry" | "custom";

export interface TariffSetting {
  id: string;
  kind: OrderKind;
  zone: ServiceZone;
  dayFare: number;
  eveningFare: number;
  nightFare: number;
  version: number;
  updatedAt: string;
}

export interface TariffList {
  items: TariffSetting[];
}

export interface ServiceSettings {
  acceptedOrderTimeoutSeconds: number;
  freeWaitingMinutes: number;
  waitingBaseFee: number;
  waitingPricePerMinute: number;
  arrivalSoonMinutes: number;
  driverBoardAnnouncement: string;
  commissionPercent: number;
  priceSurveyEnabled: boolean;
  priceSurveyIntervalDays: number;
  priceSurveyQuestion: string;
  priceSurveyAllowSuggestion: boolean;
  roadSurveyEnabled: boolean;
  roadSurveyIntervalDays: number;
  roadSurveyBgrQuestion: string;
  roadSurveyHarborQuestion: string;
  harborSurveyAfterEachTrip: boolean;
  roadBadVotesRequired: number;
  roadGoodVotesToDisable: number;
  roadSurchargePercent: number;
  version: number;
  updatedAt: string;
}

export interface RoadConditionState {
  area: "bgr" | "harbor";
  surchargeActive: boolean;
  badVotes: number;
  goodVotes: number;
  stateChangedAt: string;
  updatedAt: string;
}

export interface RoadConditionList {
  items: RoadConditionState[];
}

export interface DriverSummary {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  vehicleMakeModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  verificationStatus: VerificationStatus;
  userStatus: "active" | "pending_verification" | "blocked";
  createdAt: string;
  updatedAt: string;
}

export interface DriverList {
  items: DriverSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface DriverReview {
  id: string;
  previousStatus: VerificationStatus;
  decisionStatus: VerificationStatus;
  comment: string | null;
  createdAt: string;
  reviewer: {
    id: string;
    name: string;
  };
}

export interface DriverDetail extends DriverSummary {
  licensePhotoUrl: string;
  licensePhotoBackUrl: string | null;
  carPhotoUrls: string[];
  reviewComment: string | null;
  reviewedAt: string | null;
  history: DriverReview[];
  finance: DriverFinance;
}

export interface DriverFinance {
  profileId: string;
  driverUserId: string;
  fullName: string;
  phone: string;
  commissionPercentOverride: number | null;
  effectiveCommissionPercent: number;
  commissionDebt: number;
  earnings: {
    day: number;
    week: number;
    month: number;
    year: number;
  };
}

export interface DriverFinanceList {
  items: DriverFinance[];
}

export type SupportConversationStatus = "open" | "closed";

export interface SupportParticipant {
  id: string;
  name: string;
  phone: string;
  role: "passenger" | "driver" | "admin";
}

export interface SupportMessage {
  id: string;
  body: string;
  createdAt: string;
  sender: SupportParticipant;
}

export interface SupportConversationSummary {
  id: string;
  status: SupportConversationStatus;
  participant: SupportParticipant;
  createdAt: string;
  updatedAt: string;
  lastMessage: SupportMessage | null;
}

export interface SupportConversationList {
  items: SupportConversationSummary[];
  page: number;
  pageSize: number;
  total: number;
}

export interface SupportConversation extends Omit<
  SupportConversationSummary,
  "lastMessage"
> {
  messages: SupportMessage[];
}

export interface ApiErrorBody {
  code?: string;
  message?: string | string[];
}

export type SurveyTargetRole = "passenger" | "driver" | "all";

export interface SurveyTemplate {
  id: string;
  title: string;
  question: string;
  targetRole: SurveyTargetRole;
  answerOptions: string[];
  allowComment: boolean;
  enabled: boolean;
  startsAt: string | null;
  displayTime: string | null;
  frequencyDays: number | null;
  everyCompletedTrips: number | null;
  responseCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SurveyList {
  items: SurveyTemplate[];
}

export interface SurveyResponseItem {
  id: string;
  answer: string | null;
  comment: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    phone: string;
    role: "passenger" | "driver";
  };
}

export interface SurveyResponseList {
  survey: SurveyTemplate;
  items: SurveyResponseItem[];
}

export interface UserAnnouncement {
  id: string;
  title: string;
  body: string;
  targetRole: SurveyTargetRole | null;
  targetUserId: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AnnouncementList {
  items: UserAnnouncement[];
}

export interface ReputationUser {
  id: string;
  name: string;
  phone: string;
  role: "passenger" | "driver";
  averageRating: number;
  ratingCount: number;
  driverCancellationReasons: Array<{
    reason: string;
    count: number;
  }>;
}

export interface ReputationList {
  items: ReputationUser[];
}

export interface UserRatingDetails {
  user: Pick<ReputationUser, "id" | "name" | "phone" | "role">;
  items: Array<{
    id: string;
    orderId: string;
    score: number;
    comment: string | null;
    createdAt: string;
    author: {
      id: string;
      name: string;
      phone: string;
      role: "passenger" | "driver";
    };
  }>;
}
