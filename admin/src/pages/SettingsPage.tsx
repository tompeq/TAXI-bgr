import SaveOutlined from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  InputAdornment,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { adminApi, ApiError } from "../api";
import type { RoadConditionState, ServiceSettings } from "../types";

type EditableSettings = Omit<ServiceSettings, "version" | "updatedAt">;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["settings"],
    queryFn: adminApi.settings,
  });
  const roadQuery = useQuery({
    queryKey: ["road-conditions"],
    queryFn: adminApi.roadConditions,
  });
  const [form, setForm] = useState<EditableSettings | null>(null);

  useEffect(() => {
    if (!query.data) return;
    const {
      version: _version,
      updatedAt: _updatedAt,
      ...editable
    } = query.data;
    setForm(editable);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: (value: EditableSettings) => adminApi.updateSettings(value),
    onSuccess: async (saved) => {
      queryClient.setQueryData(["settings"], saved);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  const setNumber = (key: keyof EditableSettings, value: string) => {
    setForm((current) =>
      current ? { ...current, [key]: Number(value) } : current,
    );
  };
  const setText = (key: keyof EditableSettings, value: string) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };
  const setBoolean = (key: keyof EditableSettings, value: boolean) => {
    setForm((current) => (current ? { ...current, [key]: value } : current));
  };

  return (
    <>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Typography variant="h1">Настройки</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Заказы, ожидание, уведомления и опросы водителей
        </Typography>
      </Box>
      <Divider />

      {query.isLoading && (
        <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
          <CircularProgress />
        </Box>
      )}
      {query.isError && (
        <Alert severity="error" sx={{ mt: 3 }}>
          Не удалось загрузить настройки
        </Alert>
      )}
      {form && (
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate(form);
          }}
        >
          <SettingsSection title="Заказы и ожидание">
            <NumberField
              label="Возврат заказа на доску"
              value={form.acceptedOrderTimeoutSeconds}
              min={30}
              max={900}
              suffix="сек."
              onChange={(value) =>
                setNumber("acceptedOrderTimeoutSeconds", value)
              }
            />
            <NumberField
              label="Бесплатное ожидание"
              value={form.freeWaitingMinutes}
              min={0}
              max={60}
              suffix="мин."
              onChange={(value) => setNumber("freeWaitingMinutes", value)}
            />
            <NumberField
              label="Цена минуты ожидания"
              value={form.waitingPricePerMinute}
              min={0}
              max={1000}
              suffix="₽"
              onChange={(value) => setNumber("waitingPricePerMinute", value)}
            />
            <NumberField
              label="Уведомлять до прибытия"
              value={form.arrivalSoonMinutes}
              min={1}
              max={15}
              suffix="мин."
              onChange={(value) => setNumber("arrivalSoonMinutes", value)}
            />
            <NumberField
              label="Комиссия сервиса по умолчанию"
              value={form.commissionPercent}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => setNumber("commissionPercent", value)}
            />
            <TextField
              label="Объявление на доске водителей"
              value={form.driverBoardAnnouncement}
              onChange={(event) =>
                setText("driverBoardAnnouncement", event.target.value)
              }
              slotProps={{ htmlInput: { maxLength: 500 } }}
              multiline
              minRows={3}
              helperText="Оставьте поле пустым, чтобы скрыть объявление."
              fullWidth
              sx={{ gridColumn: { lg: "1 / -1" } }}
            />
          </SettingsSection>

          <SettingsSection title="Опрос по ценам">
            <FormControlLabel
              control={
                <Switch
                  checked={form.priceSurveyEnabled}
                  onChange={(_, value) =>
                    setBoolean("priceSurveyEnabled", value)
                  }
                />
              }
              label="Опрос включён"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.priceSurveyAllowSuggestion}
                  onChange={(_, value) =>
                    setBoolean("priceSurveyAllowSuggestion", value)
                  }
                />
              }
              label="Разрешить водителю предложить свою цену"
            />
            <NumberField
              label="Периодичность"
              value={form.priceSurveyIntervalDays}
              min={1}
              max={365}
              suffix="дн."
              onChange={(value) => setNumber("priceSurveyIntervalDays", value)}
            />
            <TextField
              label="Текст вопроса"
              value={form.priceSurveyQuestion}
              onChange={(event) =>
                setText("priceSurveyQuestion", event.target.value)
              }
              slotProps={{ htmlInput: { maxLength: 300 } }}
              fullWidth
            />
          </SettingsSection>

          <SettingsSection title="Качество дорог и надбавка">
            <FormControlLabel
              control={
                <Switch
                  checked={form.roadSurveyEnabled}
                  onChange={(_, value) =>
                    setBoolean("roadSurveyEnabled", value)
                  }
                />
              }
              label="Опросы дорог включены"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={form.harborSurveyAfterEachTrip}
                  onChange={(_, value) =>
                    setBoolean("harborSurveyAfterEachTrip", value)
                  }
                />
              }
              label="Спрашивать о дороге в Гавань после каждой поездки"
            />
            <NumberField
              label="Период опроса по БГР"
              value={form.roadSurveyIntervalDays}
              min={1}
              max={30}
              suffix="дн."
              onChange={(value) => setNumber("roadSurveyIntervalDays", value)}
            />
            <NumberField
              label="Плохих голосов для включения"
              value={form.roadBadVotesRequired}
              min={1}
              max={100}
              onChange={(value) => setNumber("roadBadVotesRequired", value)}
            />
            <NumberField
              label="Хороших голосов для отключения"
              value={form.roadGoodVotesToDisable}
              min={1}
              max={100}
              onChange={(value) => setNumber("roadGoodVotesToDisable", value)}
            />
            <NumberField
              label="Дорожная надбавка"
              value={form.roadSurchargePercent}
              min={0}
              max={100}
              suffix="%"
              onChange={(value) => setNumber("roadSurchargePercent", value)}
            />
            <TextField
              label="Вопрос по дорогам БГР"
              value={form.roadSurveyBgrQuestion}
              onChange={(event) =>
                setText("roadSurveyBgrQuestion", event.target.value)
              }
              slotProps={{ htmlInput: { maxLength: 300 } }}
              fullWidth
            />
            <TextField
              label="Вопрос по дороге в Гавань"
              value={form.roadSurveyHarborQuestion}
              onChange={(event) =>
                setText("roadSurveyHarborQuestion", event.target.value)
              }
              slotProps={{ htmlInput: { maxLength: 300 } }}
              fullWidth
            />
            {roadQuery.data?.items.map((state) => (
              <RoadConditionControl key={state.area} state={state} />
            ))}
          </SettingsSection>

          {mutation.isError && (
            <Alert severity="error" sx={{ mt: 3 }}>
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : "Не удалось сохранить настройки"}
            </Alert>
          )}
          {mutation.isSuccess && (
            <Alert severity="success" sx={{ mt: 3 }}>
              Настройки сохранены
            </Alert>
          )}
          <Box sx={{ mt: 3 }}>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SaveOutlined />}
              disabled={mutation.isPending}
            >
              Сохранить настройки
            </Button>
          </Box>
        </Box>
      )}
    </>
  );
}

function RoadConditionControl({ state }: { state: RoadConditionState }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (enabled: boolean) =>
      adminApi.updateRoadCondition(state.area, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["road-conditions"] });
    },
  });
  return (
    <Box sx={{ border: 1, borderColor: "divider", p: 1.5 }}>
      <FormControlLabel
        control={
          <Switch
            checked={state.surchargeActive}
            disabled={mutation.isPending}
            onChange={(_, value) => mutation.mutate(value)}
          />
        }
        label={
          state.area === "bgr"
            ? "Надбавка по БГР активна"
            : "Надбавка по Гавани активна"
        }
      />
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block" }}
      >
        Голоса после последнего изменения: плохих {state.badVotes}, хороших{" "}
        {state.goodVotes}
      </Typography>
    </Box>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Box sx={{ py: 3, borderBottom: 1, borderColor: "divider" }}>
      <Typography variant="h2" sx={{ mb: 2 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "repeat(2, minmax(0, 1fr))" },
          gap: 2,
          maxWidth: 1000,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextField
      type="number"
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{
        htmlInput: { min, max, step: 1 },
        input: suffix
          ? {
              endAdornment: (
                <InputAdornment position="end">{suffix}</InputAdornment>
              ),
            }
          : undefined,
      }}
    />
  );
}
