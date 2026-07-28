import StarOutlined from "@mui/icons-material/StarOutlined";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import {
  Alert,
  Box,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { adminApi } from "../api";

const reasonLabels: Record<string, string> = {
  passenger_no_show: "Не вышел",
  passenger_no_answer: "Не отвечает",
  passenger_aggressive: "Неадекватное поведение",
  passenger_count_mismatch: "Не совпало число пассажиров",
  passenger_over_capacity: "Больше посадочных мест",
  passenger_payment_refused: "Отказался оплатить заранее",
  other: "Другое",
};

export function ReputationPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["reputation"],
    queryFn: adminApi.reputation,
  });
  const ratingsQuery = useQuery({
    queryKey: ["user-ratings", selectedUserId],
    queryFn: () => adminApi.userRatings(selectedUserId!),
    enabled: selectedUserId !== null,
  });
  return (
    <>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Typography variant="h1">Оценки</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Внутренняя репутация водителей и пассажиров
        </Typography>
      </Box>
      <Divider />
      {query.isError && (
        <Alert severity="error" sx={{ mt: 3 }}>
          Не удалось загрузить оценки
        </Alert>
      )}
      <TableContainer sx={{ mt: 3, border: 1, borderColor: "divider" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Пользователь</TableCell>
              <TableCell>Роль</TableCell>
              <TableCell>Средняя оценка</TableCell>
              <TableCell>Причины отмен водителями</TableCell>
              <TableCell align="right">Отзывы</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(query.data?.items ?? []).map((user) => (
              <TableRow key={user.id} hover>
                <TableCell>
                  <Typography sx={{ fontWeight: 700 }}>
                    {user.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {user.phone}
                  </Typography>
                </TableCell>
                <TableCell>
                  {user.role === "driver" ? "Водитель" : "Пассажир"}
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <StarOutlined fontSize="small" color="warning" />
                    <Typography sx={{ fontWeight: 800 }}>
                      {user.ratingCount
                        ? user.averageRating.toFixed(2)
                        : "Нет оценок"}
                    </Typography>
                    {user.ratingCount > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        ({user.ratingCount})
                      </Typography>
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                    {user.driverCancellationReasons.length === 0
                      ? "Нет"
                      : user.driverCancellationReasons.map((reason) => (
                          <Chip
                            key={reason.reason}
                            size="small"
                            label={`${reasonLabels[reason.reason] ?? reason.reason}: ${reason.count}`}
                          />
                        ))}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Посмотреть все оценки">
                    <span>
                      <IconButton
                        size="small"
                        disabled={user.ratingCount === 0}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <VisibilityOutlined fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog
        open={selectedUserId !== null}
        onClose={() => setSelectedUserId(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          Оценки {ratingsQuery.data?.user.name ?? "пользователя"}
        </DialogTitle>
        <DialogContent dividers>
          {ratingsQuery.isError && (
            <Alert severity="error">Не удалось загрузить отзывы</Alert>
          )}
          <List disablePadding>
            {(ratingsQuery.data?.items ?? []).map((rating) => (
              <ListItem key={rating.id} divider disableGutters>
                <ListItemText
                  primary={
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <StarOutlined fontSize="small" color="warning" />
                      <Typography sx={{ fontWeight: 800 }}>
                        {rating.score} из 5
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(rating.createdAt).toLocaleString("ru-RU")}
                      </Typography>
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.primary"
                      >
                        {rating.comment || "Без комментария"}
                      </Typography>
                      <br />
                      {rating.author.name} · {rating.author.phone} · заказ{" "}
                      {rating.orderId}
                    </>
                  }
                />
              </ListItem>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </>
  );
}
