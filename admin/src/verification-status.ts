import type { VerificationStatus } from "./types";

export const statusLabels: Record<VerificationStatus, string> = {
  pending: "На проверке",
  approved: "Одобрен",
  rejected: "Отклонён",
  changes_requested: "Нужны фото",
  blocked: "Заблокирован",
};

export function getStatusLabel(status: VerificationStatus): string {
  return statusLabels[status];
}
