import 'package:flutter/material.dart';

import 'app_update_controller.dart';

class AppUpdateBanner extends StatelessWidget {
  const AppUpdateBanner({required this.controller, super.key});

  final AppUpdateController controller;

  @override
  Widget build(BuildContext context) {
    final update = controller.update;
    if (update == null) {
      return const SizedBox.shrink();
    }

    final percent = controller.progress == null
        ? null
        : (controller.progress! * 100).clamp(0, 100).round();
    final (title, subtitle, icon) = switch (controller.stage) {
      AppUpdateStage.available => (
        'Доступно обновление ${update.versionName}',
        update.releaseNotes.isEmpty
            ? 'Новая версия приложения готова к загрузке'
            : update.releaseNotes,
        Icons.system_update_alt,
      ),
      AppUpdateStage.downloading => (
        'Загружаем обновление',
        percent == null ? 'Загрузка в фоне' : 'Загружено $percent%',
        Icons.downloading,
      ),
      AppUpdateStage.ready => (
        'Обновление готово',
        'Можно установить сейчас или продолжить работу',
        Icons.download_done,
      ),
      AppUpdateStage.error => (
        'Не удалось обновить приложение',
        controller.error ?? 'Попробуйте ещё раз',
        Icons.error_outline,
      ),
      AppUpdateStage.idle => (
        'Проверяем обновление',
        '',
        Icons.system_update_alt,
      ),
    };

    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Material(
          color: Theme.of(context).colorScheme.surface,
          elevation: 8,
          borderRadius: BorderRadius.circular(8),
          clipBehavior: Clip.antiAlias,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 10),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Icon(icon, size: 22),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: const TextStyle(fontWeight: FontWeight.w900),
                          ),
                          if (subtitle.isNotEmpty) ...[
                            const SizedBox(height: 2),
                            Text(
                              subtitle,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (update.required != true)
                      IconButton(
                        tooltip: controller.stage == AppUpdateStage.downloading
                            ? 'Скрыть'
                            : 'Позже',
                        onPressed: controller.dismiss,
                        icon: const Icon(Icons.close),
                      ),
                  ],
                ),
                if (controller.stage == AppUpdateStage.downloading) ...[
                  const SizedBox(height: 8),
                  LinearProgressIndicator(value: controller.progress),
                ],
                if (controller.waitingForInstallPermission) ...[
                  const SizedBox(height: 8),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Разрешите установку из этого источника и вернитесь в приложение.',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
                if (controller.stage != AppUpdateStage.downloading) ...[
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      if (controller.stage == AppUpdateStage.available)
                        FilledButton.icon(
                          onPressed: controller.download,
                          icon: const Icon(Icons.download),
                          label: const Text('Скачать'),
                        ),
                      if (controller.stage == AppUpdateStage.ready)
                        FilledButton.icon(
                          onPressed: controller.install,
                          icon: const Icon(Icons.install_mobile),
                          label: const Text('Установить'),
                        ),
                      if (controller.stage == AppUpdateStage.error)
                        FilledButton.icon(
                          onPressed: controller.hasDownloadedPackage
                              ? controller.install
                              : controller.download,
                          icon: const Icon(Icons.refresh),
                          label: const Text('Повторить'),
                        ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
