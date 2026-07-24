import ArrowBack from "@mui/icons-material/ArrowBack";
import BlockOutlined from "@mui/icons-material/BlockOutlined";
import Check from "@mui/icons-material/Check";
import Close from "@mui/icons-material/Close";
import PhotoCameraOutlined from "@mui/icons-material/PhotoCameraOutlined";
import Replay from "@mui/icons-material/Replay";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { adminApi, ApiError } from "../api";
import { StatusChip } from "../components/StatusChip";
import type { DriverDetail } from "../types";
import { getStatusLabel } from "../verification-status";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

type ReviewDecision = "approve" | "reject" | "request_changes" | "block";

export function DriverDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["driver", id],
    queryFn: () => adminApi.driver(id),
    enabled: Boolean(id),
  });
  const review = useMutation({
    mutationFn: (decision: ReviewDecision) =>
      adminApi.reviewDriver(id, decision, comment.trim() || undefined),
    onSuccess: (driver) => {
      queryClient.setQueryData(["driver", id], driver);
      void queryClient.invalidateQueries({ queryKey: ["drivers"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setComment("");
      setError(null);
    },
    onError: (reason) => {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Не удалось сохранить решение",
      );
    },
  });

  if (query.isLoading) {
    return (
      <Box sx={{ minHeight: 480, display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Box sx={{ py: 4 }}>
        <Button startIcon={<ArrowBack />} onClick={() => navigate("/drivers")}>
          К списку
        </Button>
        <Alert severity="error" sx={{ mt: 3 }}>
          Не удалось открыть заявку
        </Alert>
      </Box>
    );
  }

  const driver = query.data;

  return (
    <>
      <Box
        sx={{
          py: { xs: 2, md: 3 },
          display: "flex",
          alignItems: "center",
          gap: 1.5,
        }}
      >
        <Tooltip title="К списку водителей">
          <IconButton onClick={() => navigate("/drivers")}>
            <ArrowBack />
          </IconButton>
        </Tooltip>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h1" sx={{ wordBreak: "break-word" }}>
            {driver.fullName}
          </Typography>
          <Typography color="text.secondary">{driver.phone}</Typography>
        </Box>
        <StatusChip status={driver.verificationStatus} />
      </Box>
      <Divider />

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0, 1fr) 360px" },
          gap: { xs: 4, lg: 5 },
          py: 3,
          alignItems: "start",
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <SectionTitle
            title="Водительское удостоверение"
            subtitle="Сверьте фотографию и полное ФИО"
          />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
              gap: 1.5,
            }}
          >
            <Box>
              <Typography variant="caption" color="text.secondary">
                Лицевая сторона
              </Typography>
              <DocumentImage
                src={driver.licensePhotoUrl}
                alt="Лицевая сторона водительского удостоверения"
                onOpen={setPreview}
                aspectRatio="16 / 10"
              />
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary">
                Оборотная сторона
              </Typography>
              {driver.licensePhotoBackUrl ? (
                <DocumentImage
                  src={driver.licensePhotoBackUrl}
                  alt="Оборотная сторона водительского удостоверения"
                  onOpen={setPreview}
                  aspectRatio="16 / 10"
                />
              ) : (
                <Box
                  sx={{
                    aspectRatio: "16 / 10",
                    display: "grid",
                    placeItems: "center",
                    border: 1,
                    borderColor: "divider",
                    color: "text.secondary",
                  }}
                >
                  Не загружена в старой анкете
                </Box>
              )}
            </Box>
          </Box>

          <Box sx={{ mt: 4 }}>
            <SectionTitle
              title="Автомобиль"
              subtitle="Передняя, задняя, левая и правая стороны"
            />
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
                gap: 1,
                mb: 2,
              }}
            >
              {[
                ["Марка и модель", driver.vehicleMakeModel],
                ["Цвет", driver.vehicleColor],
                ["Госномер", driver.vehiclePlate],
              ].map(([label, value]) => (
                <Box key={label} sx={{ border: 1, borderColor: "divider", p: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">
                    {label}
                  </Typography>
                  <Typography sx={{ fontWeight: 800 }}>
                    {value || "Не указано"}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" },
                gap: 1.5,
              }}
            >
              {driver.carPhotoUrls.map((url, index) => (
                <DocumentImage
                  key={url}
                  src={url}
                  alt={`Автомобиль, сторона ${index + 1}`}
                  onOpen={setPreview}
                  aspectRatio="4 / 3"
                />
              ))}
            </Box>
          </Box>

          <Box sx={{ mt: 4 }}>
            <SectionTitle title="История решений" />
            {driver.history.length === 0 ? (
              <Typography color="text.secondary" variant="body2">
                Решений по этой заявке пока нет
              </Typography>
            ) : (
              <Box sx={{ borderTop: 1, borderColor: "divider" }}>
                {driver.history.map((item) => (
                  <Box
                    key={item.id}
                    sx={{
                      py: 2,
                      display: "grid",
                      gridTemplateColumns: { xs: "1fr", sm: "180px 1fr" },
                      gap: 1,
                      borderBottom: 1,
                      borderColor: "divider",
                    }}
                  >
                    <Typography variant="body2" color="text.secondary">
                      {dateFormatter.format(new Date(item.createdAt))}
                    </Typography>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {getStatusLabel(item.decisionStatus)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {item.reviewer.name}
                        {item.comment ? `: ${item.comment}` : ""}
                      </Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        </Box>

        <Box sx={{ display: "grid", gap: 2 }}>
          <DriverFinancePanel
            driver={driver}
            onUpdated={(next) => {
              queryClient.setQueryData(["driver", id], next);
              void queryClient.invalidateQueries({
                queryKey: ["driver-finance"],
              });
              void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            }}
          />
          <ReviewPanel
            driver={driver}
            comment={comment}
            setComment={setComment}
            busy={review.isPending}
            error={error}
            onDecision={(decision) => review.mutate(decision)}
          />
        </Box>
      </Box>

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ pr: 7 }}>
          Просмотр документа
          <IconButton
            aria-label="Закрыть"
            onClick={() => setPreview(null)}
            sx={{ position: "absolute", right: 12, top: 10 }}
          >
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 1 }}>
          {preview && (
            <Box
              component="img"
              src={preview}
              alt="Увеличенное изображение"
              sx={{
                display: "block",
                width: "100%",
                maxHeight: "78vh",
                objectFit: "contain",
                bgcolor: "#111",
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="h2">{title}</Typography>
      {subtitle && (
        <Typography color="text.secondary" variant="body2" sx={{ mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  );
}

function DocumentImage({
  src,
  alt,
  onOpen,
  aspectRatio,
}: {
  src: string;
  alt: string;
  onOpen: (src: string) => void;
  aspectRatio: string;
}) {
  return (
    <Box
      component="button"
      type="button"
      onClick={() => onOpen(src)}
      sx={{
        display: "block",
        width: "100%",
        p: 0,
        border: 1,
        borderColor: "divider",
        bgcolor: "#eceef0",
        cursor: "zoom-in",
        overflow: "hidden",
        borderRadius: "6px",
        "&:focus-visible": {
          outline: "3px solid #f4c900",
          outlineOffset: 2,
        },
      }}
    >
      <Box
        component="img"
        src={src}
        alt={alt}
        sx={{
          width: "100%",
          aspectRatio,
          display: "block",
          objectFit: "contain",
        }}
      />
    </Box>
  );
}

function DriverFinancePanel({
  driver,
  onUpdated,
}: {
  driver: DriverDetail;
  onUpdated: (driver: DriverDetail) => void;
}) {
  const [usesOverride, setUsesOverride] = useState(
    driver.finance.commissionPercentOverride !== null,
  );
  const [commissionPercent, setCommissionPercent] = useState(
    String(
      driver.finance.commissionPercentOverride ??
        driver.finance.effectiveCommissionPercent,
    ),
  );
  const [targetDebt, setTargetDebt] = useState(
    String(driver.finance.commissionDebt),
  );
  const [settlementAmount, setSettlementAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUsesOverride(driver.finance.commissionPercentOverride !== null);
    setCommissionPercent(
      String(
        driver.finance.commissionPercentOverride ??
          driver.finance.effectiveCommissionPercent,
      ),
    );
    setTargetDebt(String(driver.finance.commissionDebt));
  }, [driver.finance]);

  const handleError = (reason: unknown) => {
    setError(
      reason instanceof ApiError
        ? reason.message
        : "Не удалось сохранить финансовые данные",
    );
  };
  const rateMutation = useMutation({
    mutationFn: () =>
      adminApi.updateDriverCommission(
        driver.id,
        usesOverride ? Number(commissionPercent) : null,
      ),
    onSuccess: (saved) => {
      onUpdated(saved);
      setError(null);
    },
    onError: handleError,
  });
  const debtMutation = useMutation({
    mutationFn: () =>
      adminApi.adjustDriverCommissionDebt(driver.id, Number(targetDebt)),
    onSuccess: (saved) => {
      onUpdated(saved);
      setError(null);
    },
    onError: handleError,
  });
  const settlementMutation = useMutation({
    mutationFn: () =>
      adminApi.recordDriverCommissionSettlement(
        driver.id,
        Number(settlementAmount),
      ),
    onSuccess: (saved) => {
      onUpdated(saved);
      setSettlementAmount("");
      setError(null);
    },
    onError: handleError,
  });
  const busy =
    rateMutation.isPending ||
    debtMutation.isPending ||
    settlementMutation.isPending;

  return (
    <Box
      component="aside"
      sx={{
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 2.5,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <AccountBalanceWalletOutlined />
        <Typography variant="h2">Финансы</Typography>
      </Box>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 1,
          mt: 2,
        }}
      >
        {[
          ["Сегодня", driver.finance.earnings.day],
          ["Неделя", driver.finance.earnings.week],
          ["Месяц", driver.finance.earnings.month],
          ["Год", driver.finance.earnings.year],
        ].map(([label, value]) => (
          <Box
            key={String(label)}
            sx={{ border: 1, borderColor: "divider", p: 1.25 }}
          >
            <Typography variant="caption" color="text.secondary">
              {label}
            </Typography>
            <Typography sx={{ fontWeight: 800 }}>
              {money.format(Number(value))}
            </Typography>
          </Box>
        ))}
      </Box>
      <Typography variant="body2" sx={{ fontWeight: 800, mt: 2.5 }}>
        Долг по комиссии: {money.format(driver.finance.commissionDebt)}
      </Typography>
      <FormControlLabel
        sx={{ mt: 1.5, alignItems: "flex-start" }}
        control={
          <Switch
            checked={usesOverride}
            onChange={(_, checked) => setUsesOverride(checked)}
            disabled={busy}
          />
        }
        label="Индивидуальная ставка комиссии"
      />
      <TextField
        fullWidth
        type="number"
        label="Комиссия водителя"
        value={commissionPercent}
        disabled={!usesOverride || busy}
        onChange={(event) => setCommissionPercent(event.target.value)}
        slotProps={{
          htmlInput: { min: 0, max: 100, step: 1 },
          input: {
            endAdornment: <InputAdornment position="end">%</InputAdornment>,
          },
        }}
        helperText={
          usesOverride
            ? "Эта ставка применяется только к новым завершённым заказам."
            : `Используется общая ставка: ${driver.finance.effectiveCommissionPercent}%.`
        }
      />
      <Button
        fullWidth
        variant="outlined"
        sx={{ mt: 1 }}
        disabled={busy || (usesOverride && !commissionPercent)}
        onClick={() => rateMutation.mutate()}
      >
        Сохранить ставку
      </Button>
      <Divider sx={{ my: 2.5 }} />
      <TextField
        fullWidth
        type="number"
        label="Установить долг"
        value={targetDebt}
        onChange={(event) => setTargetDebt(event.target.value)}
        disabled={busy}
        slotProps={{
          htmlInput: { min: 0, step: 1 },
          input: {
            endAdornment: <InputAdornment position="end">₽</InputAdornment>,
          },
        }}
      />
      <Button
        fullWidth
        variant="outlined"
        sx={{ mt: 1 }}
        disabled={busy || !targetDebt}
        onClick={() => debtMutation.mutate()}
      >
        Скорректировать долг
      </Button>
      <TextField
        fullWidth
        type="number"
        label="Полученный перевод комиссии"
        value={settlementAmount}
        onChange={(event) => setSettlementAmount(event.target.value)}
        disabled={busy}
        sx={{ mt: 2 }}
        slotProps={{
          htmlInput: { min: 1, max: driver.finance.commissionDebt, step: 1 },
          input: {
            endAdornment: <InputAdornment position="end">₽</InputAdornment>,
          },
        }}
      />
      <Button
        fullWidth
        variant="contained"
        sx={{ mt: 1 }}
        disabled={
          busy ||
          !settlementAmount ||
          Number(settlementAmount) > driver.finance.commissionDebt
        }
        onClick={() => settlementMutation.mutate()}
      >
        Подтвердить перевод
      </Button>
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
    </Box>
  );
}

function ReviewPanel({
  driver,
  comment,
  setComment,
  busy,
  error,
  onDecision,
}: {
  driver: DriverDetail;
  comment: string;
  setComment: (comment: string) => void;
  busy: boolean;
  error: string | null;
  onDecision: (decision: ReviewDecision) => void;
}) {
  return (
    <Box
      component="aside"
      sx={{
        position: { lg: "sticky" },
        top: { lg: 24 },
        border: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        p: 2.5,
      }}
    >
      <Typography variant="h2">Решение</Typography>
      <Typography color="text.secondary" variant="body2" sx={{ mt: 0.75 }}>
        Заявка подана {dateFormatter.format(new Date(driver.createdAt))}
      </Typography>
      <TextField
        multiline
        minRows={4}
        fullWidth
        label="Комментарий"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        helperText="Обязателен при отказе, блокировке или запросе новых фото"
        sx={{ mt: 2.5 }}
      />
      {error && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: "grid", gap: 1, mt: 2.5 }}>
        <Button
          variant="contained"
          color="success"
          startIcon={<Check />}
          disabled={busy}
          onClick={() => onDecision("approve")}
        >
          Одобрить
        </Button>
        <Button
          variant="outlined"
          color="warning"
          startIcon={<PhotoCameraOutlined />}
          disabled={busy}
          onClick={() => onDecision("request_changes")}
        >
          Запросить новые фото
        </Button>
        <Button
          variant="outlined"
          color="error"
          startIcon={<Replay />}
          disabled={busy}
          onClick={() => onDecision("reject")}
        >
          Отклонить
        </Button>
        <Button
          color="error"
          startIcon={<BlockOutlined />}
          disabled={busy}
          onClick={() => onDecision("block")}
        >
          Заблокировать
        </Button>
      </Box>
    </Box>
  );
}
