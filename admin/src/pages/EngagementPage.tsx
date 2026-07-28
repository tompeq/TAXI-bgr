import AddOutlined from "@mui/icons-material/AddOutlined";
import CampaignOutlined from "@mui/icons-material/CampaignOutlined";
import EditOutlined from "@mui/icons-material/EditOutlined";
import PollOutlined from "@mui/icons-material/PollOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
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
import { useState } from "react";
import { adminApi } from "../api";
import type {
  SurveyTargetRole,
  SurveyTemplate,
  UserAnnouncement,
} from "../types";

type SurveyDraft = Omit<
  SurveyTemplate,
  "id" | "responseCount" | "createdAt" | "updatedAt" | "version"
>;

const emptySurvey: SurveyDraft = {
  title: "",
  question: "",
  targetRole: "driver",
  answerOptions: ["Да", "Нет"],
  allowComment: true,
  enabled: false,
  startsAt: null,
  displayTime: null,
  frequencyDays: null,
  everyCompletedTrips: null,
};

export function EngagementPage() {
  const [tab, setTab] = useState(0);
  return (
    <>
      <Box sx={{ py: { xs: 2, md: 4 } }}>
        <Typography variant="h1">Обратная связь</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>
          Опросы, ответы и одноразовые сообщения пользователям
        </Typography>
      </Box>
      <Divider />
      <Tabs value={tab} onChange={(_, value) => setTab(value)} sx={{ mt: 2 }}>
        <Tab icon={<PollOutlined />} iconPosition="start" label="Опросы" />
        <Tab
          icon={<CampaignOutlined />}
          iconPosition="start"
          label="Сообщения"
        />
      </Tabs>
      {tab === 0 ? <SurveysSection /> : <AnnouncementsSection />}
    </>
  );
}

function SurveysSection() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["surveys"], queryFn: adminApi.surveys });
  const [editing, setEditing] = useState<SurveyTemplate | "new" | null>(null);
  const [responsesId, setResponsesId] = useState<string | null>(null);
  const responsesQuery = useQuery({
    queryKey: ["survey-responses", responsesId],
    queryFn: () => adminApi.surveyResponses(responsesId!),
    enabled: Boolean(responsesId),
  });
  const save = useMutation({
    mutationFn: ({
      id,
      value,
    }: {
      id?: string;
      value: SurveyDraft;
    }) =>
      id
        ? adminApi.updateSurvey(id, value)
        : adminApi.createSurvey(value),
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["surveys"] });
    },
  });

  return (
    <Box sx={{ py: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddOutlined />}
          onClick={() => setEditing("new")}
        >
          Новый опрос
        </Button>
      </Box>
      {query.isError && <Alert severity="error">Не удалось загрузить опросы</Alert>}
      <TableContainer sx={{ border: 1, borderColor: "divider" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Опрос</TableCell>
              <TableCell>Для кого</TableCell>
              <TableCell>Расписание</TableCell>
              <TableCell align="right">Ответов</TableCell>
              <TableCell align="center">Включён</TableCell>
              <TableCell width={70} />
            </TableRow>
          </TableHead>
          <TableBody>
            {(query.data?.items ?? []).map((survey) => (
              <TableRow key={survey.id} hover>
                <TableCell>
                  <Typography sx={{ fontWeight: 700 }}>
                    {survey.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {survey.question}
                  </Typography>
                </TableCell>
                <TableCell>{targetLabel(survey.targetRole)}</TableCell>
                <TableCell>{surveySchedule(survey)}</TableCell>
                <TableCell align="right">
                  <Button size="small" onClick={() => setResponsesId(survey.id)}>
                    {survey.responseCount ?? 0}
                  </Button>
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={survey.enabled}
                    onChange={(_, enabled) =>
                      save.mutate({
                        id: survey.id,
                        value: surveyToDraft({ ...survey, enabled }),
                      })
                    }
                  />
                </TableCell>
                <TableCell>
                  <Button
                    size="small"
                    aria-label="Редактировать"
                    onClick={() => setEditing(survey)}
                  >
                    <EditOutlined fontSize="small" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {editing && (
        <SurveyDialog
          survey={editing === "new" ? null : editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(value) =>
            save.mutate({
              id: editing === "new" ? undefined : editing.id,
              value,
            })
          }
        />
      )}
      <Dialog
        open={Boolean(responsesId)}
        onClose={() => setResponsesId(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          Ответы: {responsesQuery.data?.survey.title ?? "опрос"}
        </DialogTitle>
        <DialogContent dividers>
          {responsesQuery.data?.items.length === 0 && (
            <Typography color="text.secondary">Ответов пока нет</Typography>
          )}
          {responsesQuery.data?.items.map((response) => (
            <Box
              key={response.id}
              sx={{ py: 1.5, borderBottom: 1, borderColor: "divider" }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography sx={{ fontWeight: 700 }}>
                  {response.user.name} · {targetLabel(response.user.role)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {new Date(response.createdAt).toLocaleString("ru-RU")}
                </Typography>
              </Box>
              {response.answer && <Typography>{response.answer}</Typography>}
              {response.comment && (
                <Typography color="text.secondary">
                  {response.comment}
                </Typography>
              )}
            </Box>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResponsesId(null)}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function SurveyDialog({
  survey,
  saving,
  onClose,
  onSave,
}: {
  survey: SurveyTemplate | null;
  saving: boolean;
  onClose: () => void;
  onSave: (value: SurveyDraft) => void;
}) {
  const [draft, setDraft] = useState<SurveyDraft>(
    survey ? surveyToDraft(survey) : emptySurvey,
  );
  const [optionsText, setOptionsText] = useState(
    draft.answerOptions.join("\n"),
  );
  const valid =
    draft.title.trim().length >= 2 &&
    draft.question.trim().length >= 3 &&
    (optionsText.trim().length > 0 || draft.allowComment);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{survey ? "Редактировать опрос" : "Новый опрос"}</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "grid", gap: 2, pt: 0.5 }}>
          <TextField
            label="Название в админке"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
          <TextField
            label="Вопрос пользователю"
            value={draft.question}
            multiline
            minRows={2}
            onChange={(event) =>
              setDraft({ ...draft, question: event.target.value })
            }
          />
          <FormControl>
            <InputLabel>Для кого</InputLabel>
            <Select
              label="Для кого"
              value={draft.targetRole}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  targetRole: event.target.value as SurveyTargetRole,
                })
              }
            >
              <MenuItem value="driver">Водители</MenuItem>
              <MenuItem value="passenger">Пассажиры</MenuItem>
              <MenuItem value="all">Все</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Варианты ответа, каждый с новой строки"
            value={optionsText}
            multiline
            minRows={3}
            onChange={(event) => setOptionsText(event.target.value)}
          />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { sm: "1fr 1fr" },
              gap: 2,
            }}
          >
            <TextField
              type="time"
              label="Показывать после времени"
              value={draft.displayTime ?? ""}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  displayTime: event.target.value || null,
                })
              }
            />
            <TextField
              type="number"
              label="Повторять раз в дней"
              value={draft.frequencyDays ?? ""}
              slotProps={{ htmlInput: { min: 1, max: 365 } }}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  frequencyDays: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
            <TextField
              type="number"
              label="Через количество поездок"
              value={draft.everyCompletedTrips ?? ""}
              slotProps={{ htmlInput: { min: 1, max: 10000 } }}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  everyCompletedTrips: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
            <TextField
              type="datetime-local"
              label="Начать не раньше"
              value={draft.startsAt?.slice(0, 16) ?? ""}
              slotProps={{ inputLabel: { shrink: true } }}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  startsAt: event.target.value
                    ? new Date(event.target.value).toISOString()
                    : null,
                })
              }
            />
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={draft.allowComment}
                onChange={(_, checked) =>
                  setDraft({ ...draft, allowComment: checked })
                }
              />
            }
            label="Разрешить текстовый комментарий"
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.enabled}
                onChange={(_, checked) =>
                  setDraft({ ...draft, enabled: checked })
                }
              />
            }
            label="Опрос включён"
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={!valid || saving}
          onClick={() =>
            onSave({
              ...draft,
              answerOptions: optionsText
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean),
            })
          }
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AnnouncementsSection() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["announcements"],
    queryFn: adminApi.announcements,
  });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [targetRole, setTargetRole] = useState<SurveyTargetRole>("all");
  const [targetUserId, setTargetUserId] = useState<string>("");
  const reputationQuery = useQuery({
    queryKey: ["reputation", "announcement-targets"],
    queryFn: adminApi.reputation,
  });
  const create = useMutation({
    mutationFn: () =>
      adminApi.createAnnouncement({
        title,
        body,
        targetRole: targetUserId ? null : targetRole,
        targetUserId: targetUserId || null,
        enabled: true,
      }),
    onSuccess: async () => {
      setOpen(false);
      setTitle("");
      setBody("");
      setTargetUserId("");
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });
  const toggle = useMutation({
    mutationFn: ({
      item,
      enabled,
    }: {
      item: UserAnnouncement;
      enabled: boolean;
    }) => adminApi.updateAnnouncement(item.id, { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  return (
    <Box sx={{ py: 3 }}>
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<AddOutlined />}
          onClick={() => setOpen(true)}
        >
          Новое сообщение
        </Button>
      </Box>
      <TableContainer sx={{ border: 1, borderColor: "divider" }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Сообщение</TableCell>
              <TableCell>Для кого</TableCell>
              <TableCell>Создано</TableCell>
              <TableCell align="center">Активно</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(query.data?.items ?? []).map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Typography sx={{ fontWeight: 700 }}>
                    {item.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.body}
                  </Typography>
                </TableCell>
                <TableCell>
                  {item.targetUserId
                    ? `Пользователь ${item.targetUserId}`
                    : targetLabel(item.targetRole ?? "all")}
                </TableCell>
                <TableCell>
                  {new Date(item.createdAt).toLocaleString("ru-RU")}
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={item.enabled}
                    onChange={(_, enabled) =>
                      toggle.mutate({ item, enabled })
                    }
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Одноразовое сообщение</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: "grid", gap: 2 }}>
            <TextField
              label="Заголовок"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <TextField
              label="Текст"
              value={body}
              multiline
              minRows={4}
              onChange={(event) => setBody(event.target.value)}
            />
            <FormControl>
              <InputLabel>Для кого</InputLabel>
              <Select
                label="Для кого"
                value={targetRole}
                onChange={(event) =>
                  setTargetRole(event.target.value as SurveyTargetRole)
                }
              >
                <MenuItem value="all">Все</MenuItem>
                <MenuItem value="driver">Водители</MenuItem>
                <MenuItem value="passenger">Пассажиры</MenuItem>
              </Select>
            </FormControl>
            <FormControl>
              <InputLabel>Конкретный пользователь</InputLabel>
              <Select
                label="Конкретный пользователь"
                value={targetUserId}
                onChange={(event) => setTargetUserId(event.target.value)}
              >
                <MenuItem value="">Не выбран</MenuItem>
                {(reputationQuery.data?.items ?? []).map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name} · {user.phone} ·{" "}
                    {user.role === "driver" ? "водитель" : "пассажир"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {targetUserId && (
              <Typography variant="caption" color="text.secondary">
                Сообщение увидит только выбранный пользователь. Выбор роли выше
                будет проигнорирован.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Отмена</Button>
          <Button
            variant="contained"
            disabled={title.trim().length < 2 || body.trim().length < 2}
            onClick={() => create.mutate()}
          >
            Создать
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function surveyToDraft(survey: SurveyTemplate): SurveyDraft {
  return {
    title: survey.title,
    question: survey.question,
    targetRole: survey.targetRole,
    answerOptions: survey.answerOptions,
    allowComment: survey.allowComment,
    enabled: survey.enabled,
    startsAt: survey.startsAt,
    displayTime: survey.displayTime,
    frequencyDays: survey.frequencyDays,
    everyCompletedTrips: survey.everyCompletedTrips,
  };
}

function targetLabel(role: SurveyTargetRole | "passenger" | "driver") {
  return role === "driver"
    ? "Водители"
    : role === "passenger"
      ? "Пассажиры"
      : "Все";
}

function surveySchedule(survey: SurveyTemplate) {
  const parts = [];
  if (survey.displayTime) parts.push(`после ${survey.displayTime}`);
  if (survey.frequencyDays) parts.push(`раз в ${survey.frequencyDays} дн.`);
  if (survey.everyCompletedTrips)
    parts.push(`через ${survey.everyCompletedTrips} поезд.`);
  return parts.length ? parts.join(" · ") : "один раз";
}
