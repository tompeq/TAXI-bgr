import { Chip } from "@mui/material";
import type { VerificationStatus } from "../types";
import { statusLabels } from "../verification-status";

const statusColors: Record<
  VerificationStatus,
  { color: string; backgroundColor: string }
> = {
  pending: { color: "#7a4b00", backgroundColor: "#fff2c2" },
  approved: { color: "#12633f", backgroundColor: "#dff3e8" },
  rejected: { color: "#9c2f28", backgroundColor: "#fde7e5" },
  changes_requested: { color: "#875300", backgroundColor: "#ffe9c2" },
  blocked: { color: "#ffffff", backgroundColor: "#34373c" },
};

export function StatusChip({ status }: { status: VerificationStatus }) {
  return (
    <Chip
      label={statusLabels[status]}
      size="small"
      sx={{
        ...statusColors[status],
        borderRadius: "4px",
        fontWeight: 650,
      }}
    />
  );
}
