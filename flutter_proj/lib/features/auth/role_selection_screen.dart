import 'package:flutter/material.dart';

import '../../core/auth/auth_api_client.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/app_role.dart';
import 'registration_screen.dart';

class RoleSelectionScreen extends StatelessWidget {
  const RoleSelectionScreen({
    required this.authApi,
    required this.authController,
    super.key,
  });

  final AuthApiClient authApi;
  final AuthController authController;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 24),
              const Icon(Icons.local_taxi, size: 44, color: Color(0xFFB3261E)),
              const SizedBox(height: 16),
              Text(
                'Такси Бгр',
                style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                'Локальная диспетчерская для поездок, доставок и заявок по Богородскому.',
                style: Theme.of(
                  context,
                ).textTheme.bodyLarge?.copyWith(color: const Color(0xFF5F6368)),
              ),
              const Spacer(),
              _RoleCard(
                icon: Icons.person_pin_circle_outlined,
                title: 'Я пассажир',
                subtitle:
                    'Создать заказ, выбрать адрес и получить push-статусы.',
                onTap: () => _openRegistration(context, AppRole.passenger),
              ),
              const SizedBox(height: 12),
              _RoleCard(
                icon: Icons.drive_eta_outlined,
                title: 'Я водитель',
                subtitle:
                    'Пройти проверку, выйти на линию и брать заявки с доски.',
                onTap: () => _openRegistration(context, AppRole.driver),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  void _openRegistration(BuildContext context, AppRole role) {
    Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => RegistrationScreen(
          role: role,
          authApi: authApi,
          authController: authController,
        ),
      ),
    );
  }
}

class _RoleCard extends StatelessWidget {
  const _RoleCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: const Color(0xFFFFEDEA),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon, color: const Color(0xFFB3261E)),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: const Color(0xFF5F6368),
                      ),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right),
            ],
          ),
        ),
      ),
    );
  }
}
