import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_proj/core/engagement/engagement_models.dart';

void main() {
  test('filters pending ratings by the order that just closed', () {
    final completedAt = DateTime(2026, 7, 30);
    final inbox = EngagementInbox(
      announcements: const [],
      surveys: const [],
      ratings: [
        PendingRating(
          orderId: 'completed-order',
          targetId: 'driver-id',
          targetName: 'Driver',
          targetRole: EngagementRole.driver,
          completedAt: completedAt,
        ),
      ],
    );

    expect(inbox.ratingsForOrder(null), hasLength(1));
    expect(inbox.ratingsForOrder('completed-order'), hasLength(1));
    expect(inbox.ratingsForOrder('cancelled-order'), isEmpty);
  });
}
