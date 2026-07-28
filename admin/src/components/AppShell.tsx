import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import DirectionsCarOutlined from "@mui/icons-material/DirectionsCarOutlined";
import AccountBalanceWalletOutlined from "@mui/icons-material/AccountBalanceWalletOutlined";
import LogoutOutlined from "@mui/icons-material/LogoutOutlined";
import Menu from "@mui/icons-material/Menu";
import PaymentsOutlined from "@mui/icons-material/PaymentsOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import ForumOutlined from "@mui/icons-material/ForumOutlined";
import PollOutlined from "@mui/icons-material/PollOutlined";
import StarOutlined from "@mui/icons-material/StarOutlined";
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth-context";

const drawerWidth = 240;

const navigation = [
  { to: "/", label: "Обзор", icon: <DashboardOutlined /> },
  { to: "/drivers", label: "Водители", icon: <DirectionsCarOutlined /> },
  { to: "/tariffs", label: "Тарифы", icon: <PaymentsOutlined /> },
  { to: "/finance", label: "Финансы", icon: <AccountBalanceWalletOutlined /> },
  { to: "/support", label: "Сообщения", icon: <ForumOutlined /> },
  { to: "/engagement", label: "Опросы", icon: <PollOutlined /> },
  { to: "/reputation", label: "Оценки", icon: <StarOutlined /> },
  { to: "/settings", label: "Настройки", icon: <SettingsOutlined /> },
];

export function AppShell() {
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up("md"));
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Toolbar sx={{ px: 2.5, minHeight: "64px !important" }}>
        <Box
          aria-hidden="true"
          sx={{
            width: 30,
            height: 30,
            display: "grid",
            placeItems: "center",
            mr: 1.25,
            bgcolor: "secondary.main",
            borderRadius: "5px",
            color: "#171717",
            fontWeight: 900,
          }}
        >
          Т
        </Box>
        <Box>
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 800, lineHeight: 1.1 }}
          >
            Такси Бгр
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Управление
          </Typography>
        </Box>
      </Toolbar>
      <Divider />
      <List sx={{ px: 1.25, py: 1.5 }}>
        {navigation.map((item) => {
          const active =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <ListItemButton
              key={item.to}
              component={NavLink}
              to={item.to}
              selected={active}
              onClick={() => setMobileOpen(false)}
              sx={{
                minHeight: 44,
                mb: 0.5,
                borderRadius: "5px",
                "&.Mui-selected": {
                  bgcolor: "#fff3a6",
                  "&:hover": { bgcolor: "#ffed7a" },
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 38, color: "inherit" }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText
                primary={item.label}
                slotProps={{
                  primary: { sx: { fontWeight: active ? 700 : 500 } },
                }}
              />
            </ListItemButton>
          );
        })}
      </List>
      <Box sx={{ mt: "auto", p: 2 }}>
        <Divider sx={{ mb: 2 }} />
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Avatar
            sx={{
              width: 34,
              height: 34,
              bgcolor: "primary.main",
              fontSize: 14,
            }}
          >
            {session?.user.name?.slice(0, 1).toUpperCase() ?? "А"}
          </Avatar>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
              {session?.user.name}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              {session?.user.phone}
            </Typography>
          </Box>
          <Tooltip title="Выйти">
            <IconButton
              size="small"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              <LogoutOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        color="inherit"
        sx={{
          display: { md: "none" },
          borderBottom: 1,
          borderColor: "divider",
          zIndex: theme.zIndex.drawer + 1,
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            onClick={() => setMobileOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu />
          </IconButton>
          <Typography sx={{ ml: 1, fontWeight: 800 }}>Такси Бгр</Typography>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: 0 }}>
        <Drawer
          variant={desktop ? "permanent" : "temporary"}
          open={desktop || mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxSizing: "border-box",
              borderRightColor: "divider",
            },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box
        component="main"
        sx={{
          flex: 1,
          minWidth: 0,
          pt: { xs: 10, md: 0 },
          px: { xs: 2, sm: 3, lg: 4 },
          pb: 5,
        }}
      >
        <Box sx={{ width: "100%", maxWidth: 1440, mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
