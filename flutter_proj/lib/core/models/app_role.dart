enum AppRole { passenger, driver }

extension AppRoleText on AppRole {
  String get title {
    return switch (this) {
      AppRole.passenger => 'Пассажир',
      AppRole.driver => 'Водитель',
    };
  }
}
