enum DriverLineStatus { offline, online, onBreak }

class DriverWorkSettings {
  const DriverWorkSettings({
    required this.acceptsTaxi,
    required this.acceptsDelivery,
    required this.backgroundNotifications,
    required this.nightNotifications,
  });

  final bool acceptsTaxi;
  final bool acceptsDelivery;
  final bool backgroundNotifications;
  final bool nightNotifications;

  factory DriverWorkSettings.fromJson(Map<String, dynamic> json) {
    return DriverWorkSettings(
      acceptsTaxi: json['acceptsTaxi'] as bool,
      acceptsDelivery: json['acceptsDelivery'] as bool,
      backgroundNotifications: json['backgroundNotifications'] as bool,
      nightNotifications: json['nightNotifications'] as bool,
    );
  }

  DriverWorkSettings copyWith({
    bool? acceptsTaxi,
    bool? acceptsDelivery,
    bool? backgroundNotifications,
    bool? nightNotifications,
  }) {
    return DriverWorkSettings(
      acceptsTaxi: acceptsTaxi ?? this.acceptsTaxi,
      acceptsDelivery: acceptsDelivery ?? this.acceptsDelivery,
      backgroundNotifications:
          backgroundNotifications ?? this.backgroundNotifications,
      nightNotifications: nightNotifications ?? this.nightNotifications,
    );
  }
}

class DriverWorkState {
  const DriverWorkState({
    required this.status,
    required this.shiftId,
    required this.startedAt,
    required this.breakUntil,
    required this.earnings24h,
    required this.commissionDebt,
    required this.commissionDebtStatus,
    required this.visibilityDelaySeconds,
    required this.settings,
  });

  final DriverLineStatus status;
  final String? shiftId;
  final DateTime? startedAt;
  final DateTime? breakUntil;
  final double earnings24h;
  final double commissionDebt;
  final String commissionDebtStatus;
  final int visibilityDelaySeconds;
  final DriverWorkSettings settings;

  bool get isWorking => status != DriverLineStatus.offline;
  bool get isOnBreak => status == DriverLineStatus.onBreak;

  factory DriverWorkState.fromJson(Map<String, dynamic> json) {
    return DriverWorkState(
      status: switch (json['status']) {
        'online' => DriverLineStatus.online,
        'break' => DriverLineStatus.onBreak,
        _ => DriverLineStatus.offline,
      },
      shiftId: json['shiftId'] as String?,
      startedAt: _dateFromJson(json['startedAt']),
      breakUntil: _dateFromJson(json['breakUntil']),
      earnings24h: (json['earnings24h'] as num).toDouble(),
      commissionDebt: (json['commissionDebt'] as num).toDouble(),
      commissionDebtStatus: json['commissionDebtStatus'] as String? ?? 'clear',
      visibilityDelaySeconds: json['visibilityDelaySeconds'] as int,
      settings: DriverWorkSettings.fromJson(
        json['settings'] as Map<String, dynamic>,
      ),
    );
  }
}

DateTime? _dateFromJson(Object? value) {
  return value is String ? DateTime.parse(value).toLocal() : null;
}

enum DriverSurveyType { price, roadBgr, roadHarbor }

enum DriverSurveyAnswer { satisfied, notSatisfied, good, bad }

extension DriverSurveyAnswerWire on DriverSurveyAnswer {
  String get wireName => switch (this) {
    DriverSurveyAnswer.satisfied => 'satisfied',
    DriverSurveyAnswer.notSatisfied => 'not_satisfied',
    DriverSurveyAnswer.good => 'good',
    DriverSurveyAnswer.bad => 'bad',
  };
}

class DriverSurvey {
  const DriverSurvey({
    required this.type,
    required this.question,
    required this.answers,
    required this.allowSuggestion,
    this.orderId,
  });

  final DriverSurveyType type;
  final String question;
  final List<DriverSurveyAnswer> answers;
  final bool allowSuggestion;
  final String? orderId;

  factory DriverSurvey.fromJson(Map<String, dynamic> json) {
    return DriverSurvey(
      type: switch (json['type']) {
        'road_bgr' => DriverSurveyType.roadBgr,
        'road_harbor' => DriverSurveyType.roadHarbor,
        _ => DriverSurveyType.price,
      },
      question: json['question'] as String,
      answers: (json['answers'] as List<dynamic>)
          .map(
            (answer) => switch (answer) {
              'not_satisfied' => DriverSurveyAnswer.notSatisfied,
              'good' => DriverSurveyAnswer.good,
              'bad' => DriverSurveyAnswer.bad,
              _ => DriverSurveyAnswer.satisfied,
            },
          )
          .toList(growable: false),
      allowSuggestion: json['allowSuggestion'] as bool,
      orderId: json['orderId'] as String?,
    );
  }
}
