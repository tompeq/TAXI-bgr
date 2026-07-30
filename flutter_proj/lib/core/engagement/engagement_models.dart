enum EngagementRole { passenger, driver, admin }

EngagementRole engagementRoleFromWire(String value) {
  return switch (value) {
    'passenger' => EngagementRole.passenger,
    'driver' => EngagementRole.driver,
    'admin' => EngagementRole.admin,
    _ => throw FormatException('Unknown engagement role: $value'),
  };
}

class OrderChatSender {
  const OrderChatSender({
    required this.id,
    required this.name,
    required this.role,
  });

  final String id;
  final String name;
  final EngagementRole role;

  factory OrderChatSender.fromJson(Map<String, dynamic> json) {
    return OrderChatSender(
      id: json['id'] as String,
      name: json['name'] as String,
      role: engagementRoleFromWire(json['role'] as String),
    );
  }
}

class OrderChatMessage {
  const OrderChatMessage({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.sender,
  });

  final String id;
  final String body;
  final DateTime createdAt;
  final OrderChatSender sender;

  factory OrderChatMessage.fromJson(Map<String, dynamic> json) {
    return OrderChatMessage(
      id: json['id'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      sender: OrderChatSender.fromJson(json['sender'] as Map<String, dynamic>),
    );
  }
}

class PendingRating {
  const PendingRating({
    required this.orderId,
    required this.targetId,
    required this.targetName,
    required this.targetRole,
    required this.completedAt,
  });

  final String orderId;
  final String targetId;
  final String targetName;
  final EngagementRole targetRole;
  final DateTime completedAt;

  factory PendingRating.fromJson(Map<String, dynamic> json) {
    final target = json['target'] as Map<String, dynamic>;
    return PendingRating(
      orderId: json['orderId'] as String,
      targetId: target['id'] as String,
      targetName: target['name'] as String,
      targetRole: engagementRoleFromWire(target['role'] as String),
      completedAt: DateTime.parse(json['completedAt'] as String).toLocal(),
    );
  }
}

class EngagementSurvey {
  const EngagementSurvey({
    required this.id,
    required this.title,
    required this.question,
    required this.answerOptions,
    required this.allowComment,
  });

  final String id;
  final String title;
  final String question;
  final List<String> answerOptions;
  final bool allowComment;

  factory EngagementSurvey.fromJson(Map<String, dynamic> json) {
    return EngagementSurvey(
      id: json['id'] as String,
      title: json['title'] as String,
      question: json['question'] as String,
      answerOptions: (json['answerOptions'] as List<dynamic>).cast<String>(),
      allowComment: json['allowComment'] as bool,
    );
  }
}

class UserAnnouncement {
  const UserAnnouncement({
    required this.id,
    required this.title,
    required this.body,
  });

  final String id;
  final String title;
  final String body;

  factory UserAnnouncement.fromJson(Map<String, dynamic> json) {
    return UserAnnouncement(
      id: json['id'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
    );
  }
}

class EngagementInbox {
  const EngagementInbox({
    required this.announcements,
    required this.surveys,
    required this.ratings,
  });

  final List<UserAnnouncement> announcements;
  final List<EngagementSurvey> surveys;
  final List<PendingRating> ratings;

  Iterable<PendingRating> ratingsForOrder(String? orderId) {
    if (orderId == null) return ratings;
    return ratings.where((rating) => rating.orderId == orderId);
  }

  bool get isEmpty =>
      announcements.isEmpty && surveys.isEmpty && ratings.isEmpty;
}
