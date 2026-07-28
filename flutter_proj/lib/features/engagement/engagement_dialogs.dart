import 'package:flutter/material.dart';

import '../../core/engagement/engagement_models.dart';
import '../../core/engagement/engagement_store.dart';

Future<void> showPendingEngagementDialogs(
  BuildContext context,
  EngagementStore store,
) async {
  EngagementInbox inbox;
  try {
    inbox = await store.loadInbox();
  } on Object {
    return;
  }
  if (!context.mounted) return;

  for (final announcement in inbox.announcements) {
    await showDialog<void>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.campaign_outlined),
        title: Text(announcement.title),
        content: Text(announcement.body),
        actions: [
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Понятно'),
          ),
        ],
      ),
    );
    await store.acknowledgeAnnouncement(announcement.id);
    if (!context.mounted) return;
  }

  for (final survey in inbox.surveys.take(1)) {
    final response = await showDialog<_SurveyDialogResult>(
      context: context,
      builder: (_) => _SurveyDialog(survey: survey),
    );
    if (response != null) {
      await store.submitSurvey(
        survey.id,
        answer: response.answer,
        comment: response.comment,
      );
    }
    if (!context.mounted) return;
  }

  for (final rating in inbox.ratings.take(1)) {
    final response = await showDialog<_RatingDialogResult>(
      context: context,
      builder: (_) => _RatingDialog(rating: rating),
    );
    if (response != null) {
      await store.submitRating(
        rating.orderId,
        response.score,
        comment: response.comment,
      );
    }
    if (!context.mounted) return;
  }
}

class _SurveyDialogResult {
  const _SurveyDialogResult({this.answer, this.comment});

  final String? answer;
  final String? comment;
}

class _SurveyDialog extends StatefulWidget {
  const _SurveyDialog({required this.survey});

  final EngagementSurvey survey;

  @override
  State<_SurveyDialog> createState() => _SurveyDialogState();
}

class _SurveyDialogState extends State<_SurveyDialog> {
  final _comment = TextEditingController();
  String? _answer;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final canSubmit =
        _answer != null ||
        (widget.survey.allowComment && _comment.text.trim().isNotEmpty);
    return AlertDialog(
      title: Text(widget.survey.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(widget.survey.question),
            const SizedBox(height: 12),
            RadioGroup<String>(
              groupValue: _answer,
              onChanged: (value) => setState(() => _answer = value),
              child: Column(
                children: widget.survey.answerOptions
                    .map(
                      (answer) => RadioListTile<String>(
                        contentPadding: EdgeInsets.zero,
                        title: Text(answer),
                        value: answer,
                      ),
                    )
                    .toList(growable: false),
              ),
            ),
            if (widget.survey.allowComment) ...[
              const SizedBox(height: 8),
              TextField(
                controller: _comment,
                maxLines: 4,
                maxLength: 1000,
                decoration: const InputDecoration(
                  labelText: 'Комментарий или предложение',
                ),
                onChanged: (_) => setState(() {}),
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Позже'),
        ),
        FilledButton(
          onPressed: canSubmit
              ? () => Navigator.of(context).pop(
                  _SurveyDialogResult(
                    answer: _answer,
                    comment: _comment.text.trim(),
                  ),
                )
              : null,
          child: const Text('Отправить'),
        ),
      ],
    );
  }
}

class _RatingDialogResult {
  const _RatingDialogResult({required this.score, this.comment});

  final int score;
  final String? comment;
}

class _RatingDialog extends StatefulWidget {
  const _RatingDialog({required this.rating});

  final PendingRating rating;

  @override
  State<_RatingDialog> createState() => _RatingDialogState();
}

class _RatingDialogState extends State<_RatingDialog> {
  final _comment = TextEditingController();
  int _score = 0;

  @override
  void dispose() {
    _comment.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Оцените: ${widget.rating.targetName}'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              5,
              (index) => IconButton(
                onPressed: () => setState(() => _score = index + 1),
                icon: Icon(
                  index < _score ? Icons.star : Icons.star_border,
                  color: const Color(0xFFFFB300),
                  size: 34,
                ),
              ),
            ),
          ),
          TextField(
            controller: _comment,
            maxLines: 3,
            maxLength: 500,
            decoration: const InputDecoration(
              labelText: 'Комментарий (необязательно)',
            ),
          ),
        ],
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Позже'),
        ),
        FilledButton(
          onPressed: _score == 0
              ? null
              : () => Navigator.of(context).pop(
                  _RatingDialogResult(
                    score: _score,
                    comment: _comment.text.trim(),
                  ),
                ),
          child: const Text('Оценить'),
        ),
      ],
    );
  }
}
