import SaveOutlined from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  InputAdornment,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminApi, ApiError } from "../api";
import type { OrderKind, ServiceZone, TariffSetting } from "../types";

const kindLabels: Record<OrderKind, string> = {
  taxi: "Такси",
  delivery: "Доставка",
};

const zoneLabels: Record<ServiceZone, string> = {
  upper_bgr: "Верхний БГР",
  kombinat: "Комбинат",
  lower_harbor: "Нижняя Гавань",
  quarry: "Карьер",
  custom: "По километражу",
};

export function TariffsPage() {
  const [kind, setKind] = useState<OrderKind>("taxi");
  const query = useQuery({
    queryKey: ["tariffs"],
    queryFn: adminApi.tariffs,
  });
  const settings = query.data?.items.filter((item) => item.kind === kind) ?? [];

  return (
    <>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Typography variant="h1">Тарифы</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Цены по зонам и времени поездки. Для строки «По километражу»
          указывается цена за 1 км для адресов вне фиксированных зон.
        </Typography>
      </Box>
      <Divider />

      <Tabs
        value={kind}
        onChange={(_, value: OrderKind) => setKind(value)}
        sx={{ mt: 2 }}
      >
        {(Object.keys(kindLabels) as OrderKind[]).map((value) => (
          <Tab key={value} value={value} label={kindLabels[value]} />
        ))}
      </Tabs>

      {query.isLoading && (
        <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
          <CircularProgress />
        </Box>
      )}
      {query.isError && (
        <Alert severity="error" sx={{ mt: 3 }}>
          Не удалось загрузить тарифы
        </Alert>
      )}
      {query.data && (
        <TableContainer
          sx={{
            mt: 2,
            border: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
            overflowX: "auto",
          }}
        >
          <Table sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>Зона</TableCell>
                <TableCell>День, до 19:00</TableCell>
                <TableCell>Вечер, 19:00–21:00</TableCell>
                <TableCell>Ночь, 21:00–06:00</TableCell>
                <TableCell align="right">Действие</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {settings.map((setting) => (
                <TariffRow
                  key={`${setting.id}-${setting.version}`}
                  setting={setting}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}

function TariffRow({ setting }: { setting: TariffSetting }) {
  const queryClient = useQueryClient();
  const [dayFare, setDayFare] = useState(String(setting.dayFare));
  const [eveningFare, setEveningFare] = useState(String(setting.eveningFare));
  const [nightFare, setNightFare] = useState(String(setting.nightFare));

  useEffect(() => {
    setDayFare(String(setting.dayFare));
    setEveningFare(String(setting.eveningFare));
    setNightFare(String(setting.nightFare));
  }, [setting]);

  const mutation = useMutation({
    mutationFn: () =>
      adminApi.updateTariff(setting.kind, setting.zone, {
        dayFare: Number(dayFare),
        eveningFare: Number(eveningFare),
        nightFare: Number(nightFare),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["tariffs"] });
    },
  });
  const values = [dayFare, eveningFare, nightFare].map(Number);
  const valid = values.every(
    (value) => Number.isInteger(value) && value > 0 && value <= 100_000,
  );
  const changed =
    values[0] !== setting.dayFare ||
    values[1] !== setting.eveningFare ||
    values[2] !== setting.nightFare;

  return (
    <>
      <TableRow>
        <TableCell>
          <Typography sx={{ fontWeight: 700 }}>
            {zoneLabels[setting.zone]}
          </Typography>
        </TableCell>
        <FareCell
          value={dayFare}
          onChange={setDayFare}
          suffix={setting.zone === "custom" ? "₽/км" : "₽"}
        />
        <FareCell
          value={eveningFare}
          onChange={setEveningFare}
          suffix={setting.zone === "custom" ? "₽/км" : "₽"}
        />
        <FareCell
          value={nightFare}
          onChange={setNightFare}
          suffix={setting.zone === "custom" ? "₽/км" : "₽"}
        />
        <TableCell align="right">
          <Button
            variant="contained"
            startIcon={<SaveOutlined />}
            disabled={!valid || !changed || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Сохранить
          </Button>
        </TableCell>
      </TableRow>
      {mutation.isError && (
        <TableRow>
          <TableCell colSpan={5} sx={{ pt: 0 }}>
            <Alert severity="error">
              {mutation.error instanceof ApiError
                ? mutation.error.message
                : "Не удалось сохранить тариф"}
            </Alert>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function FareCell({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix: string;
}) {
  return (
    <TableCell>
      <TextField
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        slotProps={{
          htmlInput: { min: 1, max: 100_000, step: 10 },
          input: {
            endAdornment: (
              <InputAdornment position="end">{suffix}</InputAdornment>
            ),
          },
        }}
        sx={{ width: 150 }}
      />
    </TableCell>
  );
}
