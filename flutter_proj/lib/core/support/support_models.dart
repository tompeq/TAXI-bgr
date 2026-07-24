class SupportParticipant {
  const SupportParticipant({
    required this.id,
    required this.name,
    required this.phone,
    required this.role,
  });

  final String id;
  final String name;
  final String phone;
  final String role;

  factory SupportParticipant.fromJson(Map<String, dynamic> json) {
    return SupportParticipant(
      id: json['id'] as String,
      name: json['name'] as String,
      phone: json['phone'] as String,
      role: json['role'] as String,
    );
  }
}

class SupportMessage {
  const SupportMessage({
    required this.id,
    required this.body,
    required this.createdAt,
    required this.sender,
  });

  final String id;
  final String body;
  final DateTime createdAt;
  final SupportParticipant sender;

  factory SupportMessage.fromJson(Map<String, dynamic> json) {
    return SupportMessage(
      id: json['id'] as String,
      body: json['body'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      sender: SupportParticipant.fromJson(
        json['sender'] as Map<String, dynamic>,
      ),
    );
  }
}

class SupportConversation {
  const SupportConversation({
    required this.id,
    required this.status,
    required this.participant,
    required this.createdAt,
    required this.updatedAt,
    required this.messages,
  });

  final String id;
  final String status;
  final SupportParticipant participant;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<SupportMessage> messages;

  factory SupportConversation.fromJson(Map<String, dynamic> json) {
    return SupportConversation(
      id: json['id'] as String,
      status: json['status'] as String,
      participant: SupportParticipant.fromJson(
        json['participant'] as Map<String, dynamic>,
      ),
      createdAt: DateTime.parse(json['createdAt'] as String).toLocal(),
      updatedAt: DateTime.parse(json['updatedAt'] as String).toLocal(),
      messages: (json['messages'] as List<dynamic>)
          .map((item) => SupportMessage.fromJson(item as Map<String, dynamic>))
          .toList(growable: false),
    );
  }
}
