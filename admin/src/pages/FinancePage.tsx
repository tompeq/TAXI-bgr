import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "../api";

const money = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function FinancePage() {
  const query = useQuery({
    queryKey: ["driver-finance"],
    queryFn: adminApi.driverFinances,
  });

  return (
    <>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <AccountBalanceWalletOutlined color="action" />
          <Typography variant="h1">Финансы водителей</Typography>
        </Box>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Заработок указан после удержания комиссии. Долг перед сервисом
          подтверждается вручную.
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
          Не удалось загрузить финансовые данные
        </Alert>
      )}
      {query.data && (
        <TableContainer sx={{ mt: 3, border: 1, borderColor: "divider" }}>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow>
                <TableCell>Водитель</TableCell>
                <TableCell align="right">Комиссия</TableCell>
                <TableCell align="right">Долг</TableCell>
                <TableCell align="right">Сегодня</TableCell>
                <TableCell align="right">Неделя</TableCell>
                <TableCell align="right">Месяц</TableCell>
                <TableCell align="right">Год</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {query.data.items.map((driver) => (
                <TableRow key={driver.profileId} hover>
                  <TableCell>
                    <Typography
                      component={Link}
                      to={`/drivers/${driver.profileId}`}
                      sx={{
                        color: "text.primary",
                        fontWeight: 700,
                        textDecoration: "none",
                        "&:hover": { textDecoration: "underline" },
                      }}
                    >
                      {driver.fullName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {driver.phone}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    {driver.effectiveCommissionPercent}%
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700 }}>
                    {money.format(driver.commissionDebt)}
                  </TableCell>
                  <TableCell align="right">
                    {money.format(driver.earnings.day)}
                  </TableCell>
                  <TableCell align="right">
                    {money.format(driver.earnings.week)}
                  </TableCell>
                  <TableCell align="right">
                    {money.format(driver.earnings.month)}
                  </TableCell>
                  <TableCell align="right">
                    {money.format(driver.earnings.year)}
                  </TableCell>
                </TableRow>
              ))}
              {query.data.items.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    align="center"
                    sx={{ py: 5, color: "text.secondary" }}
                  >
                    Водителей пока нет
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
}
