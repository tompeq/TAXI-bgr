import ChevronRight from "@mui/icons-material/ChevronRight";
import PersonSearchOutlined from "@mui/icons-material/PersonSearchOutlined";
import Search from "@mui/icons-material/Search";
import {
  Alert,
  Box,
  CircularProgress,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { adminApi } from "../api";
import { StatusChip } from "../components/StatusChip";
import type { VerificationStatus } from "../types";

type StatusFilter = "all" | VerificationStatus;

const filters: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "На проверке" },
  { value: "changes_requested", label: "Нужны фото" },
  { value: "approved", label: "Одобрены" },
  { value: "rejected", label: "Отклонены" },
  { value: "blocked", label: "Заблокированы" },
  { value: "all", label: "Все" },
];

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function DriversPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const query = useQuery({
    queryKey: ["drivers", status, search],
    queryFn: () =>
      adminApi.drivers(status === "all" ? undefined : status, search),
  });

  return (
    <>
      <Box
        sx={{
          py: { xs: 2, md: 4 },
          display: "flex",
          flexWrap: "wrap",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Box>
          <Typography variant="h1">Проверка водителей</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.75 }}>
            Заявки, документы и решения администратора
          </Typography>
        </Box>
        <TextField
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="ФИО, телефон или машина"
          sx={{ width: { xs: "100%", sm: 300 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <Search fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <Tabs
        value={status}
        onChange={(_, value: StatusFilter) => setStatus(value)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          "& .MuiTab-root": { minHeight: 48 },
        }}
      >
        {filters.map((filter) => (
          <Tab key={filter.value} value={filter.value} label={filter.label} />
        ))}
      </Tabs>

      {query.isLoading && (
        <Box sx={{ py: 8, display: "grid", placeItems: "center" }}>
          <CircularProgress />
        </Box>
      )}
      {query.isError && (
        <Alert severity="error" sx={{ mt: 3 }}>
          Не удалось загрузить заявки
        </Alert>
      )}
      {query.data && (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            Найдено: {query.data.total}
          </Typography>
          {query.data.items.length === 0 ? (
            <Box
              sx={{
                minHeight: 300,
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                borderTop: 1,
                borderColor: "divider",
              }}
            >
              <Box>
                <PersonSearchOutlined
                  sx={{ fontSize: 40, color: "text.disabled", mb: 1 }}
                />
                <Typography sx={{ fontWeight: 700 }}>
                  Заявок не найдено
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  Измените фильтр или поисковый запрос
                </Typography>
              </Box>
            </Box>
          ) : (
            <TableContainer
              sx={{
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
              }}
            >
              <Table sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Водитель</TableCell>
                    <TableCell>Телефон</TableCell>
                    <TableCell>Автомобиль</TableCell>
                    <TableCell>Статус</TableCell>
                    <TableCell>Подана</TableCell>
                    <TableCell width={52} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {query.data.items.map((driver) => (
                    <TableRow
                      hover
                      key={driver.id}
                      tabIndex={0}
                      onClick={() => navigate(`/drivers/${driver.id}`)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          navigate(`/drivers/${driver.id}`);
                        }
                      }}
                      sx={{ cursor: "pointer" }}
                    >
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {driver.fullName}
                        </Typography>
                      </TableCell>
                      <TableCell>{driver.phone}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                          {driver.vehicleMakeModel ?? "Не указано"}
                        </Typography>
                        {(driver.vehicleColor || driver.vehiclePlate) && (
                          <Typography variant="caption" color="text.secondary">
                            {[driver.vehicleColor, driver.vehiclePlate]
                              .filter(Boolean)
                              .join(" · ")}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusChip status={driver.verificationStatus} />
                      </TableCell>
                      <TableCell>
                        {dateFormatter.format(new Date(driver.createdAt))}
                      </TableCell>
                      <TableCell>
                        <ChevronRight color="disabled" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </>
      )}
    </>
  );
}
