import BlockOutlined from "@mui/icons-material/BlockOutlined";
import CheckCircleOutlined from "@mui/icons-material/CheckCircleOutlined";
import GroupsOutlined from "@mui/icons-material/GroupsOutlined";
import LoginOutlined from "@mui/icons-material/LoginOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import AssignmentTurnedInOutlined from "@mui/icons-material/AssignmentTurnedInOutlined";
import PendingActionsOutlined from "@mui/icons-material/PendingActionsOutlined";
import {
  Alert,
  Box,
  CircularProgress,
  Divider,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { adminApi } from "../api";

const metrics = [
  {
    key: "pendingDrivers" as const,
    label: "Ожидают проверки",
    icon: <PendingActionsOutlined />,
    color: "#a15c00",
  },
  {
    key: "approvedDrivers" as const,
    label: "Одобрено водителей",
    icon: <CheckCircleOutlined />,
    color: "#18794e",
  },
  {
    key: "blockedDrivers" as const,
    label: "Заблокировано",
    icon: <BlockOutlined />,
    color: "#c9372c",
  },
  {
    key: "registeredUsers" as const,
    label: "Всего пользователей",
    icon: <GroupsOutlined />,
    color: "#2563a6",
  },
];

export function DashboardPage() {
  const query = useQuery({
    queryKey: ["dashboard"],
    queryFn: adminApi.dashboard,
  });

  return (
    <>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Typography variant="h1">Обзор</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Текущее состояние сервиса
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
          Не удалось загрузить статистику
        </Alert>
      )}
      {query.data && (
        <>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                xl: "repeat(4, minmax(0, 1fr))",
              },
              borderLeft: 1,
              borderTop: 1,
              borderColor: "divider",
              mt: 3,
            }}
          >
            {metrics.map((metric) => (
              <Box
                key={metric.key}
                component={metric.key === "pendingDrivers" ? Link : "div"}
                to={metric.key === "pendingDrivers" ? "/drivers" : undefined}
                sx={{
                  minHeight: 148,
                  p: 2.5,
                  borderRight: 1,
                  borderBottom: 1,
                  borderColor: "divider",
                  bgcolor: "background.paper",
                  color: "text.primary",
                  textDecoration: "none",
                  "&:hover":
                    metric.key === "pendingDrivers"
                      ? { bgcolor: "#fffdf0" }
                      : undefined,
                }}
              >
                <Box sx={{ color: metric.color, mb: 2 }}>{metric.icon}</Box>
                <Typography variant="h1">
                  {query.data[metric.key].toLocaleString("ru-RU")}
                </Typography>
                <Typography
                  color="text.secondary"
                  variant="body2"
                  sx={{ mt: 1 }}
                >
                  {metric.label}
                </Typography>
              </Box>
            ))}
          </Box>
          <MetricSection
            title="Заказы"
            items={[
              {
                label: "Создано",
                value: query.data.orders.created,
                icon: <AssignmentTurnedInOutlined />,
              },
              {
                label: "Выполнено",
                value: query.data.orders.completed,
                icon: <CheckCircleOutlined />,
              },
              {
                label: "Не выполнено",
                value: query.data.orders.notCompleted,
                icon: <PendingActionsOutlined />,
              },
            ]}
          />
          <MetricSection
            title="Активность"
            items={[
              {
                label: "Входов сегодня",
                value: query.data.activity.loginsToday,
                icon: <LoginOutlined />,
              },
              {
                label: "Выходов сегодня",
                value: query.data.activity.logoutsToday,
                icon: <LogoutOutlined />,
              },
              {
                label: "Всего входов",
                value: query.data.activity.loginsTotal,
                icon: <LoginOutlined />,
              },
              {
                label: "Всего выходов",
                value: query.data.activity.logoutsTotal,
                icon: <LogoutOutlined />,
              },
            ]}
          />
          <MetricSection
            title="Деньги"
            items={[
              {
                label: "Заработок водителей сегодня",
                value: `${query.data.finance.driverEarningsToday.toLocaleString("ru-RU")} ₽`,
                icon: <AccountBalanceWalletOutlined />,
              },
              {
                label: "Общий долг по комиссии",
                value: `${query.data.finance.commissionDebt.toLocaleString("ru-RU")} ₽`,
                icon: <AccountBalanceWalletOutlined />,
              },
            ]}
          />
        </>
      )}
    </>
  );
}

function MetricSection({
  title,
  items,
}: {
  title: string;
  items: Array<{
    label: string;
    value: number | string;
    icon: React.ReactNode;
  }>;
}) {
  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, minmax(0, 1fr))",
            lg: "repeat(4, minmax(0, 1fr))",
          },
          borderTop: 1,
          borderLeft: 1,
          borderColor: "divider",
        }}
      >
        {items.map((item) => (
          <Box
            key={item.label}
            sx={{
              minHeight: 112,
              p: 2,
              borderRight: 1,
              borderBottom: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            <Box sx={{ color: "text.secondary", mb: 1 }}>{item.icon}</Box>
            <Typography variant="h2">{item.value}</Typography>
            <Typography
              color="text.secondary"
              variant="body2"
              sx={{ mt: 0.75 }}
            >
              {item.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
