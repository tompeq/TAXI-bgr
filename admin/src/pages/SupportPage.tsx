import ForumOutlined from "@mui/icons-material/ForumOutlined";
import SendOutlined from "@mui/icons-material/SendOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { adminApi } from "../api";
import { useAuth } from "../auth-context";
import type { SupportMessage } from "../types";

const dateTime = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function SupportPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState("");
  const conversationsQuery = useQuery({
    queryKey: ["support-conversations"],
    queryFn: () => adminApi.supportConversations(),
    refetchInterval: 10_000,
  });
  const detailQuery = useQuery({
    queryKey: ["support-conversation", selectedId],
    queryFn: () => adminApi.supportConversation(selectedId!),
    enabled: Boolean(selectedId),
    refetchInterval: 10_000,
  });

  useEffect(() => {
    const items = conversationsQuery.data?.items ?? [];
    if (items.length > 0 && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [conversationsQuery.data, selectedId]);

  const refresh = async () => {
    await queryClient.invalidateQueries({
      queryKey: ["support-conversations"],
    });
    if (selectedId) {
      await queryClient.invalidateQueries({
        queryKey: ["support-conversation", selectedId],
      });
    }
  };

  const sendMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      adminApi.sendSupportMessage(id, body),
    onSuccess: async () => {
      setDraft("");
      await refresh();
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "open" | "closed" }) =>
      adminApi.updateSupportConversationStatus(id, status),
    onSuccess: refresh,
  });

  const conversation = detailQuery.data;
  const send = () => {
    if (!selectedId || !draft.trim() || sendMutation.isPending) return;
    sendMutation.mutate({ id: selectedId, body: draft.trim() });
  };

  return (
    <>
      <Box
        sx={{
          py: { xs: 2, md: 4 },
          display: "flex",
          alignItems: "center",
          gap: 1.25,
        }}
      >
        <ForumOutlined color="action" />
        <Box>
          <Typography variant="h1">Сообщения</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Пассажиры и водители
          </Typography>
        </Box>
      </Box>
      <Divider />

      {conversationsQuery.isError && (
        <Alert severity="error" sx={{ mt: 3 }}>
          Не удалось загрузить сообщения
        </Alert>
      )}
      <Box
        sx={{
          mt: 3,
          minHeight: { xs: 560, md: 620 },
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "340px minmax(0, 1fr)" },
          gridTemplateRows: { xs: "250px minmax(310px, 1fr)", md: "1fr" },
          border: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Box
          sx={{
            overflowY: "auto",
            borderRight: { md: 1 },
            borderBottom: { xs: 1, md: 0 },
            borderColor: "divider",
          }}
        >
          {conversationsQuery.isLoading ? (
            <Box sx={{ py: 6, display: "grid", placeItems: "center" }}>
              <CircularProgress size={26} />
            </Box>
          ) : conversationsQuery.data?.items.length ? (
            <List disablePadding>
              {conversationsQuery.data.items.map((item) => (
                <ListItemButton
                  key={item.id}
                  selected={item.id === selectedId}
                  onClick={() => setSelectedId(item.id)}
                  sx={{ alignItems: "flex-start", px: 2, py: 1.25 }}
                >
                  <ListItemText
                    primary={
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          justifyContent: "space-between",
                        }}
                      >
                        <Typography noWrap sx={{ fontWeight: 700 }}>
                          {item.participant.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.status === "open" ? "Открыт" : "Закрыт"}
                        </Typography>
                      </Box>
                    }
                    secondary={
                      <Box component="span" sx={{ display: "block", mt: 0.25 }}>
                        <Typography
                          component="span"
                          variant="caption"
                          color="text.secondary"
                        >
                          {item.participant.role === "driver"
                            ? "Водитель"
                            : "Пассажир"}
                        </Typography>
                        <Typography
                          component="span"
                          variant="body2"
                          noWrap
                          sx={{ display: "block" }}
                        >
                          {item.lastMessage?.body ?? "Сообщений пока нет"}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItemButton>
              ))}
            </List>
          ) : (
            <Box
              sx={{
                height: "100%",
                display: "grid",
                placeItems: "center",
                px: 3,
                textAlign: "center",
              }}
            >
              <Typography color="text.secondary">Сообщений пока нет</Typography>
            </Box>
          )}
        </Box>

        <Box sx={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
          {detailQuery.isLoading && (
            <Box sx={{ flex: 1, display: "grid", placeItems: "center" }}>
              <CircularProgress size={28} />
            </Box>
          )}
          {detailQuery.isError && (
            <Alert severity="error" sx={{ m: 2 }}>
              Не удалось открыть диалог
            </Alert>
          )}
          {!selectedId && !detailQuery.isLoading && (
            <Box sx={{ flex: 1, display: "grid", placeItems: "center", px: 3 }}>
              <Typography color="text.secondary">Выберите диалог</Typography>
            </Box>
          )}
          {conversation && (
            <>
              <Box
                sx={{
                  px: 2,
                  py: 1.25,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography sx={{ fontWeight: 800 }} noWrap>
                    {conversation.participant.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {conversation.participant.phone}
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() =>
                    statusMutation.mutate({
                      id: conversation.id,
                      status:
                        conversation.status === "open" ? "closed" : "open",
                    })
                  }
                  disabled={statusMutation.isPending}
                >
                  {conversation.status === "open" ? "Закрыть" : "Открыть"}
                </Button>
              </Box>
              <Divider />
              <Box
                sx={{
                  flex: 1,
                  overflowY: "auto",
                  p: 2,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                {conversation.messages.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    isOwn={message.sender.id === session?.user.id}
                  />
                ))}
              </Box>
              <Divider />
              <Box sx={{ display: "flex", gap: 1, p: 1.5 }}>
                <TextField
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Сообщение"
                  multiline
                  maxRows={4}
                  fullWidth
                  disabled={sendMutation.isPending}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                />
                <Tooltip title="Отправить">
                  <span>
                    <IconButton
                      color="primary"
                      onClick={send}
                      disabled={!draft.trim() || sendMutation.isPending}
                      sx={{ alignSelf: "flex-end" }}
                    >
                      <SendOutlined />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
              {sendMutation.isError && (
                <Alert severity="error" sx={{ mx: 1.5, mb: 1.5 }}>
                  Не удалось отправить сообщение
                </Alert>
              )}
            </>
          )}
        </Box>
      </Box>
    </>
  );
}

function MessageRow({
  message,
  isOwn,
}: {
  message: SupportMessage;
  isOwn: boolean;
}) {
  return (
    <Box
      sx={{
        alignSelf: isOwn ? "flex-end" : "flex-start",
        maxWidth: "min(620px, 90%)",
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderRadius: "6px",
          bgcolor: isOwn ? "secondary.light" : "action.hover",
          color: "text.primary",
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
        }}
      >
        {!isOwn && (
          <Typography
            variant="caption"
            sx={{ display: "block", fontWeight: 700, mb: 0.25 }}
          >
            {message.sender.name}
          </Typography>
        )}
        <Typography variant="body2">{message.body}</Typography>
      </Box>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: "block", mt: 0.25, textAlign: isOwn ? "right" : "left" }}
      >
        {dateTime.format(new Date(message.createdAt))}
      </Typography>
    </Box>
  );
}
