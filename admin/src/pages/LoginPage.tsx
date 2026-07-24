import LockOutlined from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ApiError, requestOtp, verifyOtp } from "../api";
import { useAuth } from "../auth-context";

export function LoginPage() {
  const { session, setSession } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState(
    import.meta.env.DEV ? "+79990000000" : "+7",
  );
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!challengeId) {
        const otp = await requestOtp(phone.trim());
        setChallengeId(otp.challengeId);
        setDebugCode(otp.debugCode ?? null);
        if (otp.debugCode) setCode(otp.debugCode);
      } else {
        const nextSession = await verifyOtp(challengeId, code);
        setSession(nextSession);
        navigate("/", { replace: true });
      }
    } catch (reason) {
      setError(
        reason instanceof ApiError ? reason.message : "Не удалось войти",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        bgcolor: "#eef0f2",
        px: 2,
      }}
    >
      <Paper
        component="main"
        sx={{
          width: "100%",
          maxWidth: 420,
          border: 1,
          borderColor: "divider",
          p: { xs: 3, sm: 4 },
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 4 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              display: "grid",
              placeItems: "center",
              bgcolor: "secondary.main",
              borderRadius: "6px",
            }}
          >
            <LockOutlined />
          </Box>
          <Box>
            <Typography variant="h2">Такси Бгр</Typography>
            <Typography color="text.secondary" variant="body2">
              Панель администратора
            </Typography>
          </Box>
        </Box>

        <Typography variant="h1" sx={{ mb: 1 }}>
          {challengeId ? "Введите код" : "Вход"}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {challengeId
            ? `Код отправлен на ${phone}`
            : "Используйте номер административного аккаунта"}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {debugCode && challengeId && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Тестовый код: <strong>{debugCode}</strong>
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          {!challengeId ? (
            <TextField
              fullWidth
              autoFocus
              label="Номер телефона"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              slotProps={{ htmlInput: { inputMode: "tel" } }}
            />
          ) : (
            <TextField
              fullWidth
              autoFocus
              label="Код из SMS"
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              slotProps={{
                htmlInput: { inputMode: "numeric", maxLength: 6 },
              }}
            />
          )}
          <Button
            fullWidth
            type="submit"
            variant="contained"
            disabled={
              busy ||
              (!challengeId && phone.trim().length < 10) ||
              (Boolean(challengeId) && code.length !== 6)
            }
            sx={{ mt: 2 }}
          >
            {busy ? (
              <CircularProgress color="inherit" size={22} />
            ) : challengeId ? (
              "Войти"
            ) : (
              "Получить код"
            )}
          </Button>
          {challengeId && (
            <Button
              fullWidth
              color="inherit"
              onClick={() => {
                setChallengeId(null);
                setCode("");
                setDebugCode(null);
                setError(null);
              }}
              sx={{ mt: 1 }}
            >
              Изменить номер
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
